import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Skapar en offentlig bokning utan inloggning. Validerar behandling, kontrollerar
// krockar, hittar/skapar kund via e-post och skapar en pending-bokning.
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
    if ((treatment.min_age || 0) > 0) {
      if (!customer.birth_date) {
        return Response.json({ error: `Denna behandling kräver att du är minst ${treatment.min_age} år. Ange ditt födelsedatum.`, code: 'age_required' }, { status: 400 });
      }
      const ageAtStart = Math.floor((start.getTime() - new Date(customer.birth_date).getTime()) / (365.25 * 86400000));
      if (ageAtStart < treatment.min_age) {
        return Response.json({ error: `Denna behandling kräver att du är minst ${treatment.min_age} år gammal.`, code: 'under_age' }, { status: 400 });
      }
    }

    // Krockkontroll för vald behandlare samma dag
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);
    const existing = await svc.entities.Booking.filter(
      {
        clinic_id, staff_name,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ['cancelled', 'no_show'] },
      },
      { limit: 200 }
    );
    const conflict = (existing.items || []).some((b) => {
      const bs = new Date(b.start_time);
      const be = b.end_time ? new Date(b.end_time) : new Date(bs.getTime() + (b.duration || 30) * 60000);
      return start < be && end > bs;
    });
    if (conflict) {
      return Response.json({ error: 'Tiden är tyvärr redan bokad. Välj en annan tid.' }, { status: 409 });
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
        clinic_id, name: customer.name, email: customer.email, phone: customer.phone, birth_date: customer.birth_date, status: 'lead',
      });
    } else {
      const patch = {};
      if (!cust.phone && customer.phone) patch.phone = customer.phone;
      if (!cust.name && customer.name) patch.name = customer.name;
      if (!cust.birth_date && customer.birth_date) patch.birth_date = customer.birth_date;
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
    });

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