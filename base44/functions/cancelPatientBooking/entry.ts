import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { notifyWaitingListOnCancellation } from '../../shared/waitingList.ts';

// Låter en inloggad patient avboka sin egen kommande bokning via kundportalen.
// Accesskontroll: patienten matchas mot Customer via e-post, bokningen måste
// tillhöra den kunden och ligga i framtiden samt vara avbokningsbar.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { booking_id } = body;
    if (!booking_id) return Response.json({ error: 'booking_id krävs' }, { status: 400 });

    const email = (user.email || '').toLowerCase().trim();
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });

    const svc = base44.asServiceRole;
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const custPage = await svc.entities.Customer.filter(
      { email: { $regex: `^${escEmail}$`, $options: 'i' } },
      { limit: 1 }
    );
    const customer = (custPage.items || [])[0];
    if (!customer) return Response.json({ error: 'Ingen kundprofil hittades' }, { status: 404 });

    const booking = await svc.entities.Booking.get(booking_id);
    if (!booking || booking.customer_id !== customer.id) {
      return Response.json({ error: 'Bokningen hör inte till ditt konto' }, { status: 403 });
    }
    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      return Response.json({ error: 'Bokningen kan inte avbokas' }, { status: 409 });
    }
    const start = new Date(booking.start_time);
    if (start.getTime() < Date.now()) {
      return Response.json({ error: 'Bokningen har redan passerat' }, { status: 409 });
    }

    // --- Avbokningsregler: cancellation_hours och no_show_fee ---
    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
    const hoursUntilStart = (start.getTime() - Date.now()) / 3600000;
    const cancellationHours = treatment?.cancellation_hours ?? 24;
    const noShowFee = treatment?.no_show_fee ?? 0;
    const withinCancellationWindow = hoursUntilStart < cancellationHours;

    // Om avbokning sker för sent och en no-show/avbokningsavgift finns, notera detta
    let feeInfo = null;
    if (withinCancellationWindow && noShowFee > 0) {
      feeInfo = {
        applies: true,
        amount: noShowFee,
        reason: `Avbokning inom ${cancellationHours}h — avgift om ${noShowFee} kr kan debiteras`,
      };
    }

    // Deposition: markera som ej återbetalbar om avbokning sker för sent
    let depositInfo = null;
    if (booking.deposit_amount > 0 && booking.deposit_paid) {
      if (withinCancellationWindow) {
        depositInfo = { refunded: false, amount: booking.deposit_amount, reason: 'Deposition behålls — avbokning inom avbokningsfönstret' };
      } else {
        depositInfo = { refunded: true, amount: booking.deposit_amount, reason: 'Deposition återbetalas — avbokning i tid' };
      }
    }

    const updated = await svc.entities.Booking.update(booking_id, { status: 'cancelled' });

    // Audit-logg för avbokning med avgiftsinformation
    try {
      await svc.entities.AuditLog.create({
        clinic_id: booking.clinic_id,
        event_type: 'booking_cancellation',
        entity_type: 'Booking',
        entity_id: booking_id,
        description: `Avbokning för ${booking.customer_name || ''}${feeInfo ? ` — avgift: ${feeInfo.amount} kr` : ''}`,
        user_id: user.id,
        user_name: user.full_name || user.email || '',
        metadata: JSON.stringify({ feeInfo, depositInfo, hoursUntilStart }),
      });
    } catch { /* swallow */ }

    // Frigjord tid → erbjud automatiskt plats till matchande väntelistekunder.
    // Får inte blockera avbokningen om det misslyckas.
    try {
      await notifyWaitingListOnCancellation(svc, updated);
    } catch { /* swallow */ }

    return Response.json({ booking: updated, feeInfo, depositInfo });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}