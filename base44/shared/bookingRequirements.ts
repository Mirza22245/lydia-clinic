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

  // 5. Klinikregler: behandlingsinformation, personalbehörighet, maskin,
  // ålder och väntetid. TEST utvärderar men blockerar inte; PÅ blockerar.
  try {
    const clinicId = booking?.clinic_id;
    if (clinicId) {
      const infoRule = await getClinicRule(svc, clinicId, 'treatment_information');
      if (infoRule.active && configMatches(infoRule.config, treatment)) {
        const info = await svc.entities.TreatmentInformation.filter(
          { treatment_id: treatment.id, active: true }, { sort: '-created_date', limit: 1 }
        );
        requirements.push({
          key: 'configured_treatment_information',
          label: 'Aktuell behandlingsinformation',
          required: infoRule.enforce,
          completed: !!(info.items || []).length,
          mode: infoRule.status,
        });
      }

      const licenseRule = await getClinicRule(svc, clinicId, 'staff_licensing');
      if (licenseRule.active && configMatches(licenseRule.config, treatment, { staff_name: booking.staff_name })) {
        const requiredTypes = Array.isArray(licenseRule.config.required_license_types)
          ? licenseRule.config.required_license_types.map(x => String(x).toLowerCase()).filter(Boolean) : [];
        if (requiredTypes.length) {
          const licenses = await svc.entities.StaffLicense.filter({ staff_id: booking.staff_id || '' }, { limit: 100 });
          const fallback = await svc.entities.StaffLicense.filter({ staff_name: booking.staff_name || '' }, { limit: 100 });
          const ok = [...(licenses.items || []), ...(fallback.items || [])].some(x =>
            (x.status || 'active') === 'active' &&
            (!x.valid_until || new Date(x.valid_until) >= new Date()) &&
            requiredTypes.includes(String(x.license_type || '').toLowerCase())
          );
          requirements.push({
            key: 'configured_staff_license',
            label: 'Personalens behörighet',
            required: licenseRule.enforce,
            completed: ok,
            mode: licenseRule.status,
          });
        }
      }

      const radiationRule = await getClinicRule(svc, clinicId, 'radiation_compliance');
      if (radiationRule.active && configMatches(radiationRule.config, treatment)) {
        const equipmentId = treatment.equipment_id || treatment.machine_id || radiationRule.config.equipment_id;
        if (equipmentId) {
          const eq = await svc.entities.RadiationEquipment.filter({ equipment_id: equipmentId, status: 'active' }, { limit: 1 });
          const equipment = eq.items?.[0];
          const notificationOk = !!equipment?.ssm_notification;
          requirements.push({
            key: 'configured_radiation_equipment',
            label: 'Godkänd utrustning/maskin',
            required: radiationRule.enforce,
            completed: !!equipment && notificationOk,
            mode: radiationRule.status,
          });
        }
      }

      const ageRule = await getClinicRule(svc, clinicId, 'age_verification');
      if (ageRule.active && configMatches(ageRule.config, treatment) && cid) {
        const minimumAge = Number(ageRule.config.minimum_age || 0);
        if (minimumAge > 0) {
          const customer = await svc.entities.Customer.get(cid).catch(() => null);
          const age = customer?.birth_date
            ? Math.floor((Date.now() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : -1;
          requirements.push({
            key: 'configured_age_verification',
            label: `Åldersverifiering (${minimumAge}+ år)`,
            required: ageRule.enforce,
            completed: age >= minimumAge,
            mode: ageRule.status,
          });
        }
      }

      // Estetiska injektioner: betänketiden räknas från när patientinformationen faktiskt lämnades,
      // inte från när bokningen skapades. En tidigare behandling av samma typ kan hanteras som undantag
      // genom klinikens konfiguration; annars krävs ny information och ny väntetid.
      if (['injektion', 'filler', 'botox'].includes(String(treatment?.treatment_type || '').toLowerCase()) && treatment.requires_health_declaration) {
        const declarations = await svc.entities.HealthDeclaration.filter(
          { clinic_id: clinicId, customer_id: booking.customer_id, status: 'submitted' },
          { sort: '-submitted_at', limit: 20 }
        );
        const latest = (declarations.items || []).find((x) =>
          !x.booking_id || x.booking_id === booking.id || String(x.treatment_name || '').toLowerCase() === String(treatment.name || '').toLowerCase()
        );
        const waitingUntil = latest?.waiting_period_until ? new Date(latest.waiting_period_until).getTime() : NaN;
        let repeatSameTypeWithinSixMonths = false;
        try {
          const since = new Date(Date.now() - 183 * 86400000).toISOString();
          const previous = await svc.entities.ClinicalTreatmentRecord.filter(
            { clinic_id: clinicId, customer_id: booking.customer_id, treatment_name: treatment.name },
            { sort: '-record_date', limit: 20 }
          );
          repeatSameTypeWithinSixMonths = (previous.items || []).some((x) => {
            const ts = new Date(x.record_date || 0).getTime();
            return ts > 0 && new Date(ts).toISOString() >= since;
          });
        } catch { /* äldre installationer kan sakna journalposter */ }
        requirements.push({
          key: 'aesthetic_waiting_period',
          label: 'Lagstadgad betänketid är klar',
          required: true,
          completed: repeatSameTypeWithinSixMonths || (Number.isFinite(waitingUntil) && Date.now() >= waitingUntil),
          mode: 'enabled',
          waiting_period_until: repeatSameTypeWithinSixMonths ? null : (latest?.waiting_period_until || null),
          repeat_treatment_exception: repeatSameTypeWithinSixMonths,
        });
      }

      const waitRule = await getClinicRule(svc, clinicId, 'waiting_periods');
      if (waitRule.active && configMatches(waitRule.config, treatment)) {
        const days = Number(waitRule.config.days || 0);
        if (days > 0) {
          const earliest = new Date(Date.now() + days * 86400000);
          const scheduled = booking?.start_time ? new Date(booking.start_time) : null;
          const completed = !!scheduled && scheduled.getTime() >= earliest.getTime();
          requirements.push({
            key: 'configured_waiting_period',
            label: `Betänketid/väntetid (${days} dagar)`,
            required: waitRule.enforce,
            completed,
            mode: waitRule.status,
          });
        }
      }

      const incidentRule = await getClinicRule(svc, clinicId, 'incident_management');
      if (incidentRule.active && configMatches(incidentRule.config, treatment)) {
        const open = await svc.entities.Incident.filter(
          { clinic_id: clinicId, booking_id: booking.id, status: { $in: ['open', 'investigating'] } }, { limit: 20 }
        );
        const hasOpen = (open.items || []).length > 0;
        requirements.push({
          key: 'configured_incident_check',
          label: 'Öppna avvikelser måste hanteras',
          required: incidentRule.enforce,
          completed: !hasOpen,
          mode: incidentRule.status,
        });
      }

      const hygieneRule = await getClinicRule(svc, clinicId, 'hygiene_checks');
      if (hygieneRule.active && configMatches(hygieneRule.config, treatment)) {
        const areas = Array.isArray(hygieneRule.config.areas) ? hygieneRule.config.areas.map(String).filter(Boolean) : [];
        const maxAgeHours = Number(hygieneRule.config.max_age_hours || 24);
        const query: any = { clinic_id: clinicId, result: 'ok' };
        if (areas.length === 1) query.area = areas[0];
        const checks = await svc.entities.HygieneCheck.filter(query, { sort: '-last_checked', limit: 100 });
        const now = Date.now();
        const valid = (checks.items || []).some((x) => {
          if (areas.length > 1 && !areas.includes(String(x.area || ''))) return false;
          const ts = new Date(x.last_checked || x.created_date || 0).getTime();
          return ts > 0 && now - ts <= maxAgeHours * 3600000;
        });
        requirements.push({
          key: 'configured_hygiene_check',
          label: 'Aktuell hygienkontroll',
          required: hygieneRule.enforce,
          completed: valid,
          mode: hygieneRule.status,
        });
      }

      const inventoryRule = await getClinicRule(svc, clinicId, 'inventory_lots');
      if (inventoryRule.active && configMatches(inventoryRule.config, treatment)) {
        const productIds = Array.isArray(inventoryRule.config.product_ids) ? inventoryRule.config.product_ids.map(String).filter(Boolean) : [];
        if (productIds.length) {
          const lots = await svc.entities.InventoryLot.filter(
            { clinic_id: clinicId, product_id: { $in: productIds }, status: 'available' }, { limit: 200 }
          );
          const today = Date.now();
          const available = (lots.items || []).some((x) =>
            Number(x.quantity || 0) > 0 && (!x.expires_at || new Date(x.expires_at).getTime() >= today)
          );
          requirements.push({
            key: 'configured_inventory_lot',
            label: 'Spårbar lagerbatch tillgänglig',
            required: inventoryRule.enforce,
            completed: available,
            mode: inventoryRule.status,
          });
        }
      }

      const attendanceRule = await getClinicRule(svc, clinicId, 'staff_attendance');
      if (attendanceRule.active && configMatches(attendanceRule.config, treatment, { staff_name: booking.staff_name })) {
        const workDate = new Date(booking.start_time || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
        const attendance = await svc.entities.StaffAttendance.filter(
          { clinic_id: clinicId, staff_name: booking.staff_name, work_date: workDate }, { limit: 20 }
        );
        const clockedIn = (attendance.items || []).some((x) => !!x.clock_in && !x.clock_out);
        requirements.push({
          key: 'configured_staff_attendance',
          label: 'Personalliggare: personal incheckad',
          required: attendanceRule.enforce,
          completed: clockedIn,
          mode: attendanceRule.status,
        });
      }

      const bookingRule = await getClinicRule(svc, clinicId, 'booking_rules');
      if (bookingRule.active && configMatches(bookingRule.config, treatment, { staff_name: booking.staff_name })) {
        const minLeadHours = Number(bookingRule.config.min_lead_hours || 0);
        const maxDays = Number(bookingRule.config.max_days || 0);
        const scheduled = booking?.start_time ? new Date(booking.start_time) : null;
        const leadHours = scheduled ? (scheduled.getTime() - Date.now()) / 3600000 : -1;
        const minOk = !minLeadHours || leadHours >= minLeadHours;
        const maxOk = !maxDays || (scheduled && scheduled.getTime() <= Date.now() + maxDays * 86400000);
        requirements.push({
          key: 'configured_booking_rule',
          label: 'Konfigurerade bokningsregler',
          required: bookingRule.enforce,
          completed: minOk && maxOk,
          mode: bookingRule.status,
        });
      }
    }
  } catch {
    // Nya klinikregler får aldrig slå ut äldre bokningsflöden vid schema-/dataavvikelser.
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