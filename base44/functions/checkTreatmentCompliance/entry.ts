import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Kontrollerar och hanterar behandlingscompliance för IVO-reglerade
// injektionsbehandlingar. Kan både kontrollera status (action: "check" eller
// ingen action) och registrera att patientinformation har lämnats (action:
// "record_information"), vilket startar betänketiden.
//
// IVO-regler som kontrolleras:
//   1. Åldersgräns 18+ för injektionsbehandlingar
//   2. Behandlingsinformation lämnad (information_given_at registrerad)
//   3. Betänketid uppfylld (betanketid_ends_at <= nu)
//   4. Samtycke signerat EFTER betänketidens slut
//   5. Kontroll av tidigare behandling av samma typ inom N månader
//
// Endast personal kan anropa.
import { canAccessClinic } from '../../shared/authz.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isStaff = user.role === 'admin' || !!user.data?.staff_role;
    if (!isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { customer_id, treatment_id, booking_id, action } = body;
    if (!customer_id || !treatment_id) {
      return Response.json({ error: 'customer_id och treatment_id krävs' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const treatment = await svc.entities.Treatment.get(treatment_id).catch(() => null);
    if (!treatment) return Response.json({ error: 'Behandling hittades inte' }, { status: 404 });

    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!customer) return Response.json({ error: 'Kund hittades inte' }, { status: 404 });

    // Klinikisolering
    if (!canAccessClinic(user, treatment.clinic_id) || !canAccessClinic(user, customer.clinic_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isInjection = ['injektion', 'filler', 'botox'].includes(String(treatment.treatment_type || '').toLowerCase());
    const checks = [];
    const now = new Date();

    // --- Ålderskontroll ---
    const minAge = isInjection ? Math.max(18, treatment.min_age || 0) : (treatment.min_age || 0);
    if (minAge > 0) {
      let agePassed = false;
      let ageDetail = 'Födelsedatum saknas på kunden';
      if (customer.birth_date) {
        const birth = new Date(customer.birth_date);
        const ageMs = now.getTime() - birth.getTime();
        const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
        agePassed = age >= minAge;
        ageDetail = agePassed
          ? `${age} år (krav: ${minAge})`
          : `${age} år — krav är ${minAge} år`;
      }
      checks.push({ key: 'age', label: `Ålderskontroll (${minAge}+ år)`, passed: agePassed, detail: ageDetail });
    }

    // --- Ladda existerande compliance-post ---
    let compliance = null;
    const query = booking_id
      ? { customer_id, treatment_id, booking_id }
      : { customer_id, treatment_id };
    const cp = await svc.entities.TreatmentCompliance.filter(query, { sort: '-created_date', limit: 1 });
    if (cp.items && cp.items.length > 0) compliance = cp.items[0];

    // --- Action: registrera information lämnad ---
    if (action === 'record_information') {
      const betanketidHours = treatment.betanketid_hours || 0;
      const infoGivenAt = new Date();
      const betanketidEndsAt = betanketidHours > 0
        ? new Date(infoGivenAt.getTime() + betanketidHours * 3600000)
        : infoGivenAt;

      // Åldersverifiering vid informationstillfället
      let ageOk = true;
      if (minAge > 0 && customer.birth_date) {
        const age = Math.floor((now.getTime() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        ageOk = age >= minAge;
      } else if (minAge > 0) {
        ageOk = false;
      }

      const complianceData = {
        customer_id,
        customer_name: customer.name,
        treatment_id,
        treatment_name: treatment.name,
        treatment_type: treatment.treatment_type || 'annan',
        booking_id: booking_id || '',
        information_given_at: infoGivenAt.toISOString(),
        information_version: treatment.information_version || '',
        information_given_by: user.full_name || user.email || '',
        betanketid_hours: betanketidHours,
        betanketid_ends_at: betanketidEndsAt.toISOString(),
        consent_eligible_at: betanketidEndsAt.toISOString(),
        age_verified: ageOk,
        age_verified_at: ageOk ? infoGivenAt.toISOString() : '',
        status: betanketidHours > 0 ? 'betanketid_active' : 'consent_eligible',
        block_reason: ageOk ? '' : `Ålderskontroll misslyckades (krav: ${minAge} år)`,
        clinic_id: treatment.clinic_id || customer.clinic_id || '',
      };

      if (compliance) {
        await base44.entities.TreatmentCompliance.update(compliance.id, complianceData);
        compliance = { ...compliance, ...complianceData };
      } else {
        compliance = await base44.entities.TreatmentCompliance.create(complianceData);
      }

      // Audit-logg
      try {
        await svc.entities.AuditLog.create({
          clinic_id: treatment.clinic_id || customer.clinic_id || '',
          event_type: 'compliance_info_given',
          entity_type: 'TreatmentCompliance',
          entity_id: compliance.id || '',
          description: `Behandlingsinformation lämnad till ${customer.name} för ${treatment.name}`,
          user_id: user.id,
          user_name: user.full_name || user.email || '',
          metadata: JSON.stringify({ information_version: complianceData.information_version, betanketid_hours: betanketidHours }),
        });
      } catch { /* swallow */ }
    }

    // --- Information lämnad ---
    const infoPassed = !!(compliance && compliance.information_given_at);
    checks.push({
      key: 'information',
      label: 'Behandlingsinformation lämnad',
      passed: infoPassed,
      detail: infoPassed
        ? new Date(compliance.information_given_at).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })
        : 'Ej registrerad — klicka "Registrera information"',
    });

    // --- Betänketid ---
    if (treatment.betanketid_hours > 0) {
      const betanketidEnds = compliance?.betanketid_ends_at ? new Date(compliance.betanketid_ends_at) : null;
      const betanketidPassed = !!(betanketidEnds && now >= betanketidEnds);
      checks.push({
        key: 'betanketid',
        label: `Betänketid (${treatment.betanketid_hours}h)`,
        passed: betanketidPassed,
        detail: betanketidEnds
          ? (betanketidPassed
            ? `Uppfylld sedan ${betanketidEnds.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`
            : `Uppfylls ${betanketidEnds.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`)
          : 'Ej startad',
      });
    }

    // --- Samtycke efter betänketid ---
    if (treatment.requires_consent) {
      const consentSigned = compliance?.consent_signed_at ? new Date(compliance.consent_signed_at) : null;
      const consentEligible = compliance?.consent_eligible_at ? new Date(compliance.consent_eligible_at) : null;
      let consentPassed = false;
      let consentDetail = 'Ej signerat';
      if (consentSigned && consentEligible) {
        consentPassed = consentSigned >= consentEligible;
        consentDetail = consentPassed
          ? `Signerat ${consentSigned.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}`
          : `Signerat FÖRE betänketidens slut — ogiltigt`;
      }
      checks.push({
        key: 'consent_after_betanketid',
        label: 'Samtycke efter betänketid',
        passed: consentPassed,
        detail: consentDetail,
      });
    }

    // --- 6-månadersregel (upprepad injektion) ---
    if (isInjection && (treatment.repeat_treatment_months || 0) > 0) {
      const months = treatment.repeat_treatment_months;
      const cutoff = new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
      const prevJournals = await svc.entities.JournalEntry.filter(
        { customer_id, treatment_id, is_signed: true, entry_date: { $gte: cutoff.toISOString() } },
        { sort: '-entry_date', limit: 1 }
      );
      const prevFound = !!(prevJournals.items && prevJournals.items.length);
      const prevDate = prevFound ? prevJournals.items[0].entry_date : null;
      checks.push({
        key: 'previous_treatment',
        label: `Kontroll: tidigare behandling (${months} mån)`,
        passed: true, // flaggar men blockerar inte — kliniken måste vara medveten
        detail: prevFound
          ? `Tidigare behandling ${new Date(prevDate).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} — dokumentera upprepning`
          : `Ingen tidigare behandling inom ${months} månader`,
      });

      // Uppdatera compliance-post med kontrollen
      if (compliance && !compliance.previous_treatment_checked) {
        await base44.entities.TreatmentCompliance.update(compliance.id, {
          previous_treatment_checked: true,
          previous_treatment_checked_at: now.toISOString(),
          previous_treatment_found: prevFound,
          previous_treatment_date: prevDate || '',
        }).catch(() => {});
      }
    }

    // --- Identitetsverifiering (flaggas) ---
    if (treatment.requires_identity_verification) {
      checks.push({
        key: 'identity',
        label: 'Identitetsverifiering krävs',
        passed: false,
        detail: 'BankID-verifiering ej implementerad ännu',
      });
    }

    // --- Ordination (flaggas) ---
    if (treatment.requires_ordination) {
      checks.push({
        key: 'ordination',
        label: 'Läkarordination krävs',
        passed: false,
        detail: 'Ordination ej registrerad',
      });
    }

    const blockReasons = checks.filter((c) => !c.passed).map((c) => c.label);
    const eligible = checks.every((c) => c.passed);

    // Uppdatera compliance-status (ej vid record_information — redan uppdaterad)
    if (compliance && action !== 'record_information') {
      const newStatus = eligible ? 'consent_eligible' : (compliance.information_given_at ? 'betanketid_active' : 'pending');
      await base44.entities.TreatmentCompliance.update(compliance.id, {
        status: newStatus,
        block_reason: eligible ? '' : blockReasons.join(', '),
      }).catch(() => {});
    }

    return Response.json({ eligible, checks, block_reasons: blockReasons, compliance });
  } catch (error) {
    console.error('checkTreatmentCompliance error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}