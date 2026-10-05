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
        { customer_id: cid, type: 'treatment', granted: true, revoked_at: { $exists: false } },
        { limit: 1 }
      );
      completed = !!(c.items && c.items.length);
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