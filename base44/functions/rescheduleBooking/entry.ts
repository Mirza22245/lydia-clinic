import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fetchAvailabilityData, isSlotFree, parseResourceIds, clinicDateOf } from '../../shared/availability.ts';
import { checkStaffBookable } from '../../shared/staffCompetence.ts';

// Låter en patient eller personal omboka en bokning till en ny tid.
// Bevarar befintliga formulär, samtycken och betalningar. Den nya tiden valideras
// av samma tillgänglighetsmotor som onlinebokningen: behandlarens arbetsschema,
// frånvaro, dubbelbokning, buffertider, rum, resurser, framförhållning och
// behandlarens behörighet för behandlingen.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { booking_id, new_start_time } = body;
    if (!booking_id || !new_start_time) {
      return Response.json({ error: 'booking_id och new_start_time krävs' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
    if (!booking) return Response.json({ error: 'Bokning hittades inte' }, { status: 404 });

    // Behandlingens regler
    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;

    // Auktorisering: personal (klinikmatch) eller kund (egen bokning via e-post)
    const isStaff = user.role === 'admin' || !!user.data?.staff_role;
    if (isStaff) {
      if (user.role !== 'admin' && booking.clinic_id && user.data?.clinic_id && booking.clinic_id !== user.data.clinic_id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const email = (user.email || '').toLowerCase().trim();
      if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });
      if (!booking.customer_id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
      if (!customer || (customer.email || '').toLowerCase().trim() !== email) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Bokningen måste vara ombokningsbar (ej redan genomförd/inställd)
    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      return Response.json({ error: 'Bokningen kan inte ombokas' }, { status: 409 });
    }

    const newStart = new Date(new_start_time);
    if (isNaN(newStart.getTime())) {
      return Response.json({ error: 'Ogiltigt datumformat' }, { status: 400 });
    }
    if (newStart.getTime() < Date.now()) {
      return Response.json({ error: 'Kan inte boka tid i det förflutna' }, { status: 400 });
    }

    const durationMin = treatment?.duration || 30;
    const newEnd = new Date(newStart.getTime() + durationMin * 60000);

    // Full validering mot tillgänglighetsmotorn (om bokningen har en behandlare).
    if (booking.staff_name && booking.clinic_id) {
      if (booking.treatment_id) {
        const bookable = await checkStaffBookable(svc, {
          clinic_id: booking.clinic_id, staff_name: booking.staff_name, treatment_id: booking.treatment_id,
        });
        if (!bookable.ok) return Response.json({ error: bookable.error, code: bookable.code }, { status: bookable.status });
      }
      const dateStr = clinicDateOf(newStart.getTime());
      const requireRoomId = treatment?.room_id || booking.room_id || undefined;
      const requireResourceIds = parseResourceIds(treatment?.required_resource_ids || booking.resource_ids);
      const avail = await fetchAvailabilityData(svc, {
        clinic_id: booking.clinic_id, staff_name: booking.staff_name, date: dateStr,
        requireRoomId, requireResourceIds, excludeBookingId: booking_id,
      });
      const free = isSlotFree({
        date: dateStr,
        durationMin,
        bufferBeforeMin: treatment?.buffer_before || 0,
        bufferAfterMin: treatment?.buffer_after || 0,
        minLeadHours: treatment?.min_lead_hours || 0,
        maxLeadDays: treatment?.max_lead_days || 0,
        schedule: avail.schedule,
        timeOff: avail.timeOff,
        staffBookings: avail.staffBookings,
        roomBookings: avail.roomBookings,
        resourceBookings: avail.resourceBookings,
        resourceQuantities: avail.resourceQuantities,
        requireRoomId,
        requireResourceIds,
      }, newStart.getTime());
      if (!free) {
        return Response.json({ error: 'Tiden är inte tillgänglig. Välj en annan tid.', code: 'slot_unavailable' }, { status: 409 });
      }
    }

    const prevStart = booking.start_time;
    // Skrivs som service-role: start/sluttid är skyddade fält på entity-API:t, så att
    // bokningstider endast kan ändras via validerade funktioner.
    const updated = await svc.entities.Booking.update(booking_id, {
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
    });

    // Audit-logg
    try {
      await svc.entities.AuditLog.create({
        clinic_id: booking.clinic_id,
        event_type: 'booking_reschedule',
        entity_type: 'Booking',
        entity_id: booking_id,
        description: `Ombokning för ${booking.customer_name || ''}: ${prevStart} → ${newStart.toISOString()}`,
        user_id: user.id,
        user_name: user.full_name || user.email || '',
        metadata: JSON.stringify({ from: prevStart, to: newStart.toISOString() }),
      });
    } catch { /* swallow */ }

    // Skicka bekräftelse (får inte blockera)
    try {
      if (booking.customer_id) {
        const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
        if (customer?.email) {
          const dateStr = newStart.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: customer.email,
            subject: 'Bokning ombokad — ny tid bekräftad',
            body: `Din bokning för ${booking.treatment_name || 'behandling'} har ombokats till ${dateStr}.`,
          });
        }
      }
    } catch { /* swallow */ }

    return Response.json({ booking: updated });
  } catch (error) {
    console.error('rescheduleBooking error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}