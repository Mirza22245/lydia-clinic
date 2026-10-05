import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Låter en patient eller personal omboka en bokning till en ny tid.
// Bevarar befintliga formulär, samtycken och betalningar. Kontrollerar
// tillgänglighet (inga överlappande bokningar för samma behandlare) och
// behandlingens min_lead_hours.
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

    // Bokningen måste vara avbokningsbar (ej redan genomförd/inställd)
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

    // Minsta framförhållning
    if (treatment?.min_lead_hours > 0) {
      const minStart = new Date(Date.now() + treatment.min_lead_hours * 3600000);
      if (newStart < minStart) {
        return Response.json({ error: `Minsta framförhållning är ${treatment.min_lead_hours} timmar` }, { status: 400 });
      }
    }

    // Beräkna ny sluttid
    const durationMin = treatment?.duration || 30;
    const bufferBefore = treatment?.buffer_before || 0;
    const bufferAfter = treatment?.buffer_after || 0;
    const newEnd = new Date(newStart.getTime() + durationMin * 60000);

    // Kontrollera konflikter: inga andra bokningar för samma behandlare som överlappar
    // (inklusive buffertider)
    if (booking.staff_name) {
      const blockStart = new Date(newStart.getTime() - bufferBefore * 60000);
      const blockEnd = new Date(newEnd.getTime() + bufferAfter * 60000);
      const conflicts = await svc.entities.Booking.filter({
        staff_name: booking.staff_name,
        status: { $nin: ['cancelled', 'no_show'] },
        start_time: { $lt: blockEnd.toISOString() },
        end_time: { $gt: blockStart.toISOString() },
      }, { limit: 50 });
      const hasConflict = (conflicts.items || []).some((b) => b.id !== booking_id);
      if (hasConflict) {
        return Response.json({ error: 'Tiden är inte tillgänglig — kollision med annan bokning' }, { status: 409 });
      }
    }

    const prevStart = booking.start_time;
    const updated = await base44.entities.Booking.update(booking_id, {
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
          const dateStr = newStart.toLocaleString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
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