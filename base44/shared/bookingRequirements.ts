// Delad logik för behandlingsspecifika bokningskrav. Används av
// getBookingRequirements och updateBookingStatus (och kan återanvändas av
// createPublicBooking vid behov). Hålls portabel — ingen Base44-specifik kod
// förutom SDK-anropen som anroparen skickar in.

export function parseRequiredFormIds(treatment) {
  try {
    const ids = JSON.parse(treatment?.required_form_ids || '[]');
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Returnerar en kravlista med completed-flagga per krav, samt allCompleted och
// missing (etiketter för ej uppfyllda obligatoriska krav).
// `svc` är en Base44-klient (service role eller user-scoped) som kan läsa
// HealthDeclaration, Consent, FormSubmission, Payment och FormTemplate.
export async function computeBookingRequirements(svc, booking, treatment) {
  const requirements = [];
  if (!treatment) {
    return { requirements, allCompleted: true, missing: [], enforceableCount: 0 };
  }
  const cid = booking?.customer_id || null;
  const bid = booking?.id || null;

  // 1. Hälsodeklaration
  if (treatment.requires_health_declaration) {
    let completed = false;
    if (cid) {
      const hd = await svc.entities.HealthDeclaration.filter(
        { customer_id: cid, status: 'submitted' },
        { limit: 1 }
      );
      completed = !!(hd.items && hd.items.length);
    }
    requirements.push({ key: 'health_declaration', label: 'Hälsodeklaration', required: true, completed });
  }

  // 2. Samtycke till behandling
  if (treatment.requires_consent) {
    let completed = false;
    if (cid) {
      const c = await svc.entities.Consent.filter(
        { customer_id: cid, type: 'treatment', granted: true },
        { limit: 50 }
      );
      completed = !!((c.items || []).some((x) => !x.revoked_at));
    }
    requirements.push({ key: 'consent', label: 'Samtycke till behandling', required: true, completed });
  }

  // 3. Obligatoriska formulär
  const formIds = parseRequiredFormIds(treatment);
  if (formIds.length > 0) {
    let submittedPage = { items: [] };
    if (cid) {
      submittedPage = await svc.entities.FormSubmission.filter(
        { customer_id: cid, template_id: { $in: formIds }, status: 'submitted' },
        { limit: 200 }
      );
    }
    const submittedIds = new Set((submittedPage.items || []).map((s) => s.template_id));
    for (const fid of formIds) {
      let name = fid;
      try {
        const t = await svc.entities.FormTemplate.get(fid);
        if (t && t.name) name = t.name;
      } catch { /* ignore — använd id som fallback */ }
      requirements.push({ key: `form:${fid}`, label: `Formulär: ${name}`, required: true, completed: submittedIds.has(fid) });
    }
  }

  // 4. Betalning
  if (treatment.requires_payment) {
    let completed = false;
    if (bid) {
      const p = await svc.entities.Payment.filter(
        { booking_id: bid, status: 'paid' },
        { limit: 1 }
      );
      completed = !!(p.items && p.items.length);
    }
    requirements.push({ key: 'payment', label: 'Betalning', required: true, completed });
  }

  // 5. Klinikregler: behandlingsinformation, personalbehörighet och maskin.
  try {
    const flagPage = await svc.entities.FeatureFlag.filter({ clinic_id: booking.clinic_id }, { limit: 100 });
    const flags = Object.fromEntries((flagPage.items || []).map((f) => [f.key, f]));
    const active = (key) => flags[key]?.status === 'enabled';
    const config = (key) => {
      try { return typeof flags[key]?.config === 'string' ? JSON.parse(flags[key].config || '{}') : (flags[key]?.config || {}); } catch { return {}; }
    };
    const matches = (cfg) => {
      const ids = Array.isArray(cfg.treatment_ids) ? cfg.treatment_ids.map(String) : [];
      const names = Array.isArray(cfg.treatment_names) ? cfg.treatment_names.map(x => String(x).toLowerCase()) : [];
      return (!ids.length && !names.length) || ids.includes(String(treatment.id)) || names.includes(String(treatment.name || '').toLowerCase());
    };

    if (active('treatment_information') && matches(config('treatment_information'))) {
      const info = await svc.entities.TreatmentInformation.filter(
        { treatment_id: treatment.id, active: true }, { sort: '-created_date', limit: 1 }
      );
      requirements.push({ key: 'configured_treatment_information', label: 'Aktuell behandlingsinformation', required: true, completed: !!(info.items || []).length });
    }

    if (active('staff_licensing') && matches(config('staff_licensing'))) {
      const requiredTypes = Array.isArray(config('staff_licensing').required_license_types)
        ? config('staff_licensing').required_license_types.map(x => String(x).toLowerCase()) : [];
      if (requiredTypes.length) {
        const licenses = await svc.entities.StaffLicense.filter(
          { staff_id: booking.staff_id || '' }, { limit: 100 }
        );
        const staffName = String(booking.staff_name || '').toLowerCase();
        const fallback = await svc.entities.StaffLicense.filter({ staff_name: booking.staff_name || '' }, { limit: 100 });
        const ok = [...(licenses.items || []), ...(fallback.items || [])].some(x =>
          (x.status || 'active') === 'active' && requiredTypes.includes(String(x.license_type || '').toLowerCase())
        );
        requirements.push({ key: 'configured_staff_license', label: 'Personalens behörighet', required: true, completed: ok });
      }
    }

    if (active('radiation_compliance') && matches(config('radiation_compliance'))) {
      const equipmentId = treatment.equipment_id || treatment.machine_id || config('radiation_compliance').equipment_id;
      if (equipmentId) {
        const eq = await svc.entities.RadiationEquipment.filter({ equipment_id: equipmentId, status: 'active' }, { limit: 1 });
        const equipment = eq.items?.[0];
        requirements.push({ key: 'configured_radiation_equipment', label: 'Godkänd utrustning/maskin', required: true, completed: !!equipment });
        if (equipment) {
          requirements.push({ key: 'configured_ssm_notification', label: 'SSM-anmälan registrerad', required: true, completed: !!equipment.ssm_notification });
        }
      }
    }
  } catch {
    // Äldre installationer kan sakna de nya entiteterna; befintliga krav fortsätter fungera.
  }

  // 5. IVO-compliance för injektionsbehandlingar
  if (treatment.treatment_type === 'injektion' && cid) {
    // Ålderskontroll — IVO kräver 18+ för injektionsbehandlingar
    const minAge = Math.max(18, treatment.min_age || 0);
    if (minAge > 0) {
      const customer = await svc.entities.Customer.get(cid).catch(() => null);
      let ageOk = false;
      if (customer?.birth_date) {
        const age = Math.floor((Date.now() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        ageOk = age >= minAge;
      }
      requirements.push({ key: 'compliance_age', label: `Ålderskontroll (${minAge}+ år)`, required: true, completed: ageOk });
    }

    // Compliance-post (information, betänketid, samtycke)
    const cpQuery = bid ? { customer_id: cid, treatment_id: treatment.id, booking_id: bid } : { customer_id: cid, treatment_id: treatment.id };
    const cp = await svc.entities.TreatmentCompliance.filter(cpQuery, { sort: '-created_date', limit: 1 });
    const compliance = cp.items?.[0];

    requirements.push({
      key: 'compliance_info',
      label: 'Behandlingsinformation lämnad',
      required: true,
      completed: !!compliance?.information_given_at,
    });

    if (treatment.betanketid_hours > 0) {
      const betanketidPassed = !!(compliance?.betanketid_ends_at && new Date() >= new Date(compliance.betanketid_ends_at));
      requirements.push({
        key: 'compliance_betanketid',
        label: `Betänketid (${treatment.betanketid_hours}h)`,
        required: true,
        completed: betanketidPassed,
      });
    }

    if (treatment.requires_consent && compliance) {
      const consentOk = !!(compliance.consent_signed_at && compliance.consent_eligible_at &&
        new Date(compliance.consent_signed_at) >= new Date(compliance.consent_eligible_at));
      requirements.push({
        key: 'compliance_consent',
        label: 'Samtycke efter betänketid',
        required: true,
        completed: consentOk,
      });
    }
  }

  // Informella (visas men blockerar inte)
  if (treatment.requires_treatment_info) {
    requirements.push({ key: 'treatment_info', label: 'Behandlingsinformation & risker', required: false, completed: true });
  }
  if (treatment.requires_aftercare) {
    requirements.push({ key: 'aftercare', label: 'Eftervårdsinformation', required: false, completed: true });
  }

  const enforceable = requirements.filter((r) => r.required);
  const allCompleted = enforceable.every((r) => r.completed);
  const missing = enforceable.filter((r) => !r.completed).map((r) => r.label);

  return { requirements, allCompleted, missing, enforceableCount: enforceable.length };
}

// Statusar som kräver att alla obligatoriska krav är uppfyllda innan bokningen
// kan gå dit. pending/utkast/cancelled/no_show kräver inte komplettering.
export const ADVANCING_STATUSES = ['confirmed', 'checked_in', 'in_progress', 'completed'];