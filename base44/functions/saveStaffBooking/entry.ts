import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { fetchAvailabilityData, isSlotFree, parseResourceIds, clinicDateOf } from '../../shared/availability.ts';
import { computeBookingRequirements, ADVANCING_STATUSES } from '../../shared/bookingRequirements.ts';
import { checkStaffBookable } from '../../shared/staffCompetence.ts';
import { requireStaff, getUserClinicId, canAccessClinic } from '../../shared/authz.ts';
import { recordAudit } from '../../shared/audit.ts';

// Skapar eller ändrar en bokning från personalvyn. ALL bokningsvalidering sker här,
// server-side, så att personal inte kan kringgå reglerna via formuläret:
//   - behandlaren måste vara aktiv och behörig för behandlingen
//   - dubbelbokning, arbetsschema, frånvaro, rum och resurser (samma motor som onlinebokningen)
//   - status confirmed/checked_in/in_progress/completed kräver att behandlingens krav är uppfyllda
// Personal får (till skillnad från kunder) boka inom minsta framförhållning och bakåt i tiden.
//
// Body: { booking_id?, customer_id, treatment_id, staff_name, start_time, status?, notes? }
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });

    const body = await req.json().catch(() => ({}));
    const { booking_id, customer_id, treatment_id, staff_name, start_time, notes } = body;
    if (!customer_id || !treatment_id || !start_time) {
      return Response.json({ error: 'Kund, behandling och starttid krävs' }, { status: 400 });
    }
    if (!staff_name) return Response.json({ error: 'Välj en behandlare' }, { status: 400 });

    const svc = base44.asServiceRole;
    const existing = booking_id ? await svc.entities.Booking.get(booking_id).catch(() => null) : null;
    if (booking_id && !existing) return Response.json({ error: 'Bokning hittades inte' }, { status: 404 });
    if (existing && !canAccessClinic(user, existing.clinic_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const treatment = await svc.entities.Treatment.get(treatment_id).catch(() => null);
    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!treatment || !customer) return Response.json({ error: 'Ogiltig kund eller behandling' }, { status: 400 });
    if (!canAccessClinic(user, treatment.clinic_id) || !canAccessClinic(user, customer.clinic_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const clinic_id = existing?.clinic_id || getUserClinicId(user) || treatment.clinic_id;
    if (treatment.clinic_id !== clinic_id || customer.clinic_id !== clinic_id) {
      return Response.json({ error: 'Kund och behandling måste tillhöra samma klinik' }, { status: 400 });
    }

    const start = new Date(start_time);
    if (isNaN(start.getTime())) return Response.json({ error: 'Ogiltig starttid' }, { status: 400 });
    const durationMin = treatment.duration || 30;
    const end = new Date(start.getTime() + durationMin * 60000);

    const scheduleChanged = !existing
      || existing.treatment_id !== treatment_id
      || existing.staff_name !== staff_name
      || new Date(existing.start_time).getTime() !== start.getTime();

    if (scheduleChanged) {
      const bookable = await checkStaffBookable(svc, { clinic_id, staff_name, treatment_id });
      if (!bookable.ok) return Response.json({ error: bookable.error, code: bookable.code }, { status: bookable.status });

      const dateStr = clinicDateOf(start.getTime());
      const requireRoomId = treatment.room_id || undefined;
      const requireResourceIds = parseResourceIds(treatment.required_resource_ids);
      const avail = await fetchAvailabilityData(svc, {
        clinic_id, staff_name, date: dateStr, requireRoomId, requireResourceIds, excludeBookingId: existing?.id,
      });
      const free = isSlotFree({
        date: dateStr,
        durationMin,
        bufferBeforeMin: treatment.buffer_before || 0,
        bufferAfterMin: treatment.buffer_after || 0,
        minLeadHours: 0,
        maxLeadDays: 0,
        now: 0, // personal får registrera även bakåt i tiden
        schedule: avail.schedule,
        timeOff: avail.timeOff,
        staffBookings: avail.staffBookings,
        roomBookings: avail.roomBookings,
        resourceBookings: avail.resourceBookings,
        resourceQuantities: avail.resourceQuantities,
        requireRoomId,
        requireResourceIds,
      }, start.getTime());
      if (!free) {
        return Response.json({
          error: 'Tiden är inte tillgänglig för den här behandlaren (utanför arbetstid, frånvaro eller krock med annan bokning, rum eller utrustning).',
          code: 'slot_unavailable',
        }, { status: 409 });
      }
    }

    const requestedStatus = body.status || existing?.status || 'pending';
    const statusChanging = !existing || requestedStatus !== existing.status;
    const needsGate = statusChanging && ADVANCING_STATUSES.includes(requestedStatus);

    // Ändring av befintlig bokning: kravkontroll FÖRE skrivning så att inget sparas om den nekas.
    if (existing && needsGate) {
      const check = await computeBookingRequirements(svc, { ...existing, treatment_id }, treatment);
      if (check.enforceableCount > 0 && !check.allCompleted) {
        return Response.json({
          error: 'Bokningen kan inte gå till ' + requestedStatus + ' — ofullständiga krav.',
          code: 'requirements_incomplete', missing: check.missing, requirements: check.requirements,
        }, { status: 409 });
      }
    }

    const fields: any = {
      clinic_id,
      customer_id,
      customer_name: customer.name,
      treatment_id,
      treatment_name: treatment.name,
      staff_name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      room_id: treatment.room_id || '',
      resource_ids: treatment.required_resource_ids || '[]',
      notes: notes || '',
    };
    if (!existing || existing.treatment_id !== treatment_id) {
      fields.price = treatment.price ?? 0;
      fields.deposit_amount = treatment.deposit_amount || 0;
    }

    let booking;
    let statusBlocked: any = null;
    if (existing) {
      booking = await svc.entities.Booking.update(existing.id, { ...fields, status: requestedStatus });
    } else {
      // Ny bokning skapas alltid som "pending"; en avancerande status sätts först efter kravkontroll.
      booking = await svc.entities.Booking.create({ ...fields, status: 'pending' });
      if (requestedStatus !== 'pending') {
        if (needsGate) {
          const check = await computeBookingRequirements(svc, booking, treatment);
          if (check.enforceableCount > 0 && !check.allCompleted) {
            statusBlocked = { status: requestedStatus, missing: check.missing };
          }
        }
        if (!statusBlocked) booking = await svc.entities.Booking.update(booking.id, { status: requestedStatus });
      }
    }

    await recordAudit(base44, {
      event_type: existing ? 'booking_update' : 'booking_create',
      entity_type: 'Booking',
      entity_id: booking.id,
      clinic_id,
      description: `Bokning för ${customer.name} (${treatment.name}, ${staff_name}) ${existing ? 'uppdaterad' : 'skapad'}`,
      metadata: { status: booking.status, from_status: existing?.status || null, staff_name, start_time: booking.start_time },
    });

    return Response.json({ booking, status_blocked: statusBlocked });
  } catch (error) {
    console.error('saveStaffBooking:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}