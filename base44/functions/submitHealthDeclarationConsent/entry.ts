import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Tar emot det kombinerade hälsodeklarations- och samtyckeformuläret
// från kundportalen. Skapar:
// 1. En HealthDeclaration-post med strukturerade svar
// 2. Ett behandlingssamtycke (Consent type=treatment) — signerat
// 3. Ett fotosamtycke (Consent type=photography) om fotodokumentation godkänts
// Allt signeras med digital signatur (canvas data URL) + SHA-256-hash.
// Auditas i AuditLog för spårbarhet enligt Socialstyrelsens krav.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      name, personnummer, phone, email, booking_id,
      treatment_type, treatment_type_other, treatment_name,
      pregnant_breastfeeding, skin_infection, blood_thinning,
      neuromuscular, previous_reactions, strong_skincare,
      betanketid_acknowledged, risks_acknowledged, photo_consent,
      signature,
    } = body;

    // Validering
    if (!name || !treatment_type || !signature) {
      return Response.json({ error: 'Namn, behandlingstyp och signatur krävs' }, { status: 400 });
    }

    // Hitta kundprofil via e-post
    const svc = base44.asServiceRole;
    const customerPage = await svc.entities.Customer.filter(
      { email: user.email },
      { limit: 1 }
    );
    const customer = (customerPage.items || [])[0];
    if (!customer) {
      return Response.json({ error: 'Kundprofil hittades inte' }, { status: 404 });
    }

    const clinic_id = customer.clinic_id || '';

    // En hälsodeklaration får bara kopplas till kundens egen bokning.
    // Det hindrar att en manipulerad booking_id korskopplar patientdata mellan kunder.
    let treatmentName = '';
    if (booking_id) {
      const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
      if (!booking || booking.customer_id !== customer.id || booking.clinic_id !== clinic_id) {
        return Response.json({ error: 'Bokningen hör inte till ditt patientkonto' }, { status: 403 });
      }
      treatmentName = booking.treatment_name || '';
    }

    const informationGivenAt = new Date();
    const waitingPeriodUntil = treatment_type === 'injektion' ? new Date(informationGivenAt.getTime() + 48 * 60 * 60 * 1000) : null;

    // Strukturerade svar som JSON (lagras i other-fältet)
    const structuredAnswers = {
      personnummer,
      phone,
      email,
      treatment_type,
      treatment_type_other: treatment_type_other || '',
      treatment_name: treatmentName || treatment_name || '',
      information_given_at: informationGivenAt.toISOString(),
      waiting_period_until: waitingPeriodUntil?.toISOString() || null,
      form_version: 'aesthetic-1.0',
      pregnant_breastfeeding,
      skin_infection,
      blood_thinning,
      neuromuscular,
      previous_reactions,
      strong_skincare,
      betanketid_acknowledged,
      risks_acknowledged,
      photo_consent,
      signature_present: !!signature,
      submitted_at: new Date().toISOString(),
    };

    // 1. Skapa HealthDeclaration
    const healthDecl = await base44.entities.HealthDeclaration.create({
      customer_id: customer.id,
      customer_name: customer.name,
      booking_id: booking_id || undefined,
      treatment_name: treatmentName || treatment_name || undefined,
      treatment_category: ['filler', 'botox', 'injektion'].includes(treatment_type) ? treatment_type : (treatment_type || 'annan'),
      information_given_at: informationGivenAt.toISOString(),
      waiting_period_until: waitingPeriodUntil?.toISOString(),
      form_version: 'aesthetic-1.0',
      submitted_at: new Date().toISOString(),
      submitted_by: customer.name,
      status: 'submitted',
      pregnant: pregnant_breastfeeding === true,
      breastfeeding: pregnant_breastfeeding === true,
      skin_condition: skin_infection === true,
      conditions: neuromuscular === true
        ? 'Neuromuskulär sjukdom, keloidbildning eller nedsatt immunförsvar'
        : undefined,
      allergies: previous_reactions === true
        ? 'Tidigare reaktion på fillers/botox/bedövning/laser'
        : undefined,
      medications: blood_thinning === true
        ? 'Blodförtunnande mediciner'
        : undefined,
      other: JSON.stringify(structuredAnswers),
      clinic_id,
    });

    // 2. Skapa behandlingssamtycke (signerat)
    const treatmentTypeLabel = {
      filler: 'Fillers',
      botox: 'Botox / botulinumtoxin',
      injektion: 'Annan injektionsbehandling',
      hudvard: 'Avancerad hudvård / CO2-laser / Peeling',
      apparat: 'Apparatbehandling (HIFU / Radiofrekvens / Fettreducering)',
      annan: `Annan behandling: ${treatment_type_other || ''}`,
    }[treatment_type] || treatment_type;

    const consentText = [
      'Jag intygar att ovanstående hälsouppgifter är korrekta och fullständiga.',
      'Jag har tagit del av informationen inför behandlingen och förstår att slutligt behandlingssamtycke lämnas först efter betänketiden.',
      '',
      `Behandlingstyp: ${treatmentTypeLabel}`,
      `Betänketid: ${betanketid_acknowledged ? 'Bekräftad' : 'Ej aktuellt'}`,
      `Risker & biverkningar: ${risks_acknowledged ? 'Bekräftad' : 'Ej bekräftad'}`,
      `Fotodokumentation: ${photo_consent ? 'Godkänd' : 'Ej godkänd'}`,
    ].join('\n');

    // SHA-256 hash av consent text + signatur + timestamp
    const encoder = new TextEncoder();
    const hashData = encoder.encode(consentText + signature + new Date().toISOString());
    const hashBuffer = await crypto.subtle.digest('SHA-256', hashData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signatureHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const treatmentConsent = await base44.entities.Consent.create({
      customer_id: customer.id,
      customer_name: customer.name,
      type: 'treatment',
      version: 1,
      text: consentText,
      granted: false,
      granted_at: undefined,
      granted_by: undefined,
      signed_text: undefined,
      booking_id: booking_id || undefined,
      waiting_period_until: waitingPeriodUntil?.toISOString(),
      signature_hash: undefined,
      ip_address: req.headers.get('x-forwarded-for') || '',
      device_info: req.headers.get('user-agent') || '',
      clinic_id,
    });

    // 3. Skapa fotosamtycke om godkänt
    let photoConsentRecord = null;
    if (photo_consent) {
      const photoText = 'Jag godkänner att före/efter-bilder tas för dokumentation i min patientjournal.';
      const photoHashData = encoder.encode(photoText + signature + new Date().toISOString());
      const photoHashBuffer = await crypto.subtle.digest('SHA-256', photoHashData);
      const photoHashArray = Array.from(new Uint8Array(photoHashBuffer));
      const photoHash = photoHashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      photoConsentRecord = await base44.entities.Consent.create({
        customer_id: customer.id,
        customer_name: customer.name,
        type: 'photography',
        version: 1,
        text: photoText,
        granted: true,
        granted_at: new Date().toISOString(),
        granted_by: customer.name,
        signed_text: photoText,
        signature_hash: photoHash,
        ip_address: req.headers.get('x-forwarded-for') || '',
        device_info: req.headers.get('user-agent') || '',
        clinic_id,
      });
    }

    // Audit-logg för spårbarhet
    try {
      await svc.entities.AuditLog.create({
        clinic_id,
        event_type: 'health_declaration_submit',
        entity_type: 'HealthDeclaration',
        entity_id: healthDecl.id,
        description: `Hälsodeklaration och samtycke inlämnat av ${customer.name} (${treatmentTypeLabel})`,
        user_id: user.id,
        user_name: customer.name,
        metadata: JSON.stringify({
          treatment_type,
          booking_id: booking_id || null,
          photo_consent: !!photo_consent,
          consent_id: treatmentConsent.id,
        }),
      });
    } catch { /* swallow audit errors */ }

    return Response.json({
      healthDeclaration: healthDecl,
      treatmentConsent,
      photoConsent: photoConsentRecord,
    });
  } catch (error) {
    console.error('submitHealthDeclarationConsent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}