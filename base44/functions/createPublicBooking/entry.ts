import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fetchAvailabilityData, isSlotFree, parseResourceIds } from '../../shared/availability.ts';

// Skapar en offentlig bokning utan inloggning. Validerar behandling, kontrollerar
// alla schemakonflikter (behandlare, rum, resurser, buffertider, framförhållning),
// hittar/skapar kund via e-post och skapar en pending-bokning.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { clinic_id, treatment_id, staff_name, start_time, customer } = body;

    if (!clinic_id || !treatment_id || !staff_name || !start_time || !customer?.name || !customer?.email) {
      return Response.json({ error: 'Alla obligatoriska fält måste fyllas i' }, { status: 400 });
    }

    const treatment = await svc.entities.Treatment.get(treatment_id);
    if (!treatment || treatment.clinic_id !== clinic_id) {
      return Response.json({ error: 'Ogiltig behandling' }, { status: 400 });
    }
    const duration = treatment.duration || 30;
    const start = new Date(start_time);
    const end = new Date(start.getTime() + duration * 60000);

    // --- Behandlingsspecifika arbetsflödesregler (FAS 6/10) ---
    // Väntetid: tidigaste tillåtna behandling är nu + waiting_period_days.
    if ((treatment.waiting_period_days || 0) > 0) {
      const earliest = new Date(Date.now() + treatment.waiting_period_days * 86400000);
      if (start < earliest) {
        return Response.json({
          error: `Denna behandling har en väntetid på ${treatment.waiting_period_days} dagar. Tidigaste möjliga datum är ${earliest.toLocaleDateString('sv-SE')}.`,
          code: 'waiting_period',
          earliest: earliest.toISOString(),
        }, { status: 400 });
      }
    }
    // Ålderskontroll baserat på kundens födelsedatum.
    // Injektionsbehandlingar kräver alltid minst 18 år (IVO), även om min_age är 0.
    const minAge = treatment.treatment_type === 'injektion' ? Math.max(18, treatment.min_age || 0) : (treatment.min_age || 0);
    if (minAge > 0) {
      if (!customer.birth_date) {
        return Response.json({ error: `Denna behandling kräver att du är minst ${minAge} år. Ange ditt födelsedatum.`, code: 'age_required' }, { status: 400 });
      }
      const ageAtStart = Math.floor((start.getTime() - new Date(customer.birth_date).getTime()) / (365.25 * 86400000));
      if (ageAtStart < minAge) {
        return Response.json({ error: `Denna behandling kräver att du är minst ${minAge} år gammal.`, code: 'under_age' }, { status: 400 });
      }
    }

    // Full schemavalidering: behandlarens schema, frånvaro, buffertider,
    // minsta/max framförhållning, rum och resurser. Motorn garanterar att ingen
    // tid kan bokas om någon dimension är upptagen (race-skydd innan create).
    const dateStr = start.toISOString().slice(0, 10);
    const requireRoomId = treatment.room_id || undefined;
    const requireResourceIds = parseResourceIds(treatment.required_resource_ids);
    const availData = await fetchAvailabilityData(svc, { clinic_id, staff_name, date: dateStr, requireRoomId, requireResourceIds });
    const free = isSlotFree({
      date: dateStr,
      durationMin: duration,
      bufferBeforeMin: treatment.buffer_before || 0,
      bufferAfterMin: treatment.buffer_after || 0,
      minLeadHours: treatment.min_lead_hours || 0,
      maxLeadDays: treatment.max_lead_days || 0,
      schedule: availData.schedule,
      timeOff: availData.timeOff,
      staffBookings: availData.staffBookings,
      roomBookings: availData.roomBookings,
      resourceBookings: availData.resourceBookings,
      resourceQuantities: availData.resourceQuantities,
      requireRoomId,
      requireResourceIds,
    }, start.getTime());
    if (!free) {
      return Response.json({ error: 'Tiden är tyvärr inte tillgänglig. Välj en annan tid.' }, { status: 409 });
    }

    // Hitta eller skapa kund inom kliniken
    const email = customer.email.toLowerCase().trim();
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const custPage = await svc.entities.Customer.filter(
      { clinic_id, email: { $regex: `^${escEmail}$`, $options: 'i' } },
      { limit: 1 }
    );
    let cust = (custPage.items || [])[0];
    if (!cust) {
      cust = await svc.entities.Customer.create({
        clinic_id, name: customer.name, email: customer.email, phone: customer.phone, birth_date: customer.birth_date, personnummer: customer.personnummer, status: 'lead',
      });
    } else {
      const patch = {};
      if (!cust.phone && customer.phone) patch.phone = customer.phone;
      if (!cust.name && customer.name) patch.name = customer.name;
      if (!cust.birth_date && customer.birth_date) patch.birth_date = customer.birth_date;
      if (!cust.personnummer && customer.personnummer) patch.personnummer = customer.personnummer;
      if (Object.keys(patch).length) cust = await svc.entities.Customer.update(cust.id, patch);
    }

    const booking = await svc.entities.Booking.create({
      clinic_id,
      customer_id: cust.id,
      customer_name: cust.name,
      treatment_id: treatment.id,
      treatment_name: treatment.name,
      staff_name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'pending',
      price: treatment.price,
      room_id: treatment.room_id || '',
      resource_ids: treatment.required_resource_ids || '[]',
      deposit_amount: treatment.deposit_amount || 0,
    });

    // Auto-skapa placeholder-journalpost — INTE en falsk behandlingsanteckning.
    // Status "Väntar på behandling" — personal fyller i faktiska anteckningar
    // under/efter behandlingen. Kopplas till patient, bokning, behandling, behandlare.
    try {
      await svc.entities.JournalEntry.create({
        clinic_id,
        customer_id: cust.id,
        customer_name: cust.name,
        treatment_id: treatment.id,
        treatment_name: treatment.name,
        booking_id: booking.id,
        provider: staff_name,
        entry_date: start.toISOString(),
        notes: 'Väntar på behandling',
        is_signed: false,
        version: 1,
      });
    } catch { /* swallow — journal creation must not block booking */ }

    // Kravlista som kunden måste komplettera i kundportalen innan behandling.
    const requirements = [];
    if (treatment.requires_health_declaration) requirements.push('Hälsodeklaration');
    if (treatment.requires_consent) requirements.push('Samtycke');
    if (treatment.requires_treatment_info) requirements.push('Behandlingsinformation & risker');
    if (treatment.requires_aftercare) requirements.push('Eftervårdsinformation');
    if (treatment.requires_payment) requirements.push('Betalning');
    try {
      const formIds = JSON.parse(treatment.required_form_ids || '[]');
      if (Array.isArray(formIds) && formIds.length > 0) requirements.push(`${formIds.length} formulär`);
    } catch { /* ignore */ }

    // Bekräftelse via e-post — får inte blockera bokningen om det misslyckas.
    try {
      const proto = req.headers.get('x-forwarded-proto') || 'https';
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
      const baseUrl = host ? `${proto}://${host}` : '';
      const portalUrl = baseUrl ? `${baseUrl}/portal` : '';
      const clinic = await svc.entities.Clinic.get(clinic_id).catch(() => null);
      const clinicName = clinic?.name || 'Klinik';
      const fmtTime = (d) => new Date(d).toLocaleString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      await svc.integrations.Core.SendEmail({
        to: customer.email,
        template_name: 'BookingConfirmation',
        variables: {
          customer_name: cust.name,
          treatment_name: treatment.name,
          staff_name,
          start_time: fmtTime(start),
          price: String(treatment.price || ''),
          portal_url: portalUrl,
          clinic_name: clinicName,
        },
      });
    } catch {
      // Swallow: e-post får inte blockera bokningen.
    }

    return Response.json({
      booking: {
        id: booking.id,
        treatment_name: treatment.name,
        staff_name,
        start_time: booking.start_time,
        end_time: booking.end_time,
        price: treatment.price,
      },
      requirements,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}