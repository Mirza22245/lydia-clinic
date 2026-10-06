import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { computeBookingRequirements, ADVANCING_STATUSES } from '../../shared/bookingRequirements.ts';

// Advancerar en boknings status och blockerar övergång till bekräftad/
// incheckad/pågår/klar om behandlingens obligatoriska krav (hälsodeklaration,
// samtycke, formulär, betalning) inte är uppfyllda. Endast personal kan anropa.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isStaff = user.role === 'admin' || !!user.data?.staff_role;
    if (!isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { booking_id, status } = body;
    if (!booking_id || !status) return Response.json({ error: 'booking_id och status krävs' }, { status: 400 });

    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
    if (!booking) return Response.json({ error: 'Bokning hittades inte' }, { status: 404 });

    if (user.role !== 'admin' && booking.clinic_id && user.data?.clinic_id && booking.clinic_id !== user.data.clinic_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Kravkontroll vid status som kräver komplettering.
    if (ADVANCING_STATUSES.includes(status)) {
      const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
      const check = await computeBookingRequirements(svc, booking, treatment);
      if (treatment && check.enforceableCount > 0 && !check.allCompleted) {
        return Response.json({
          error: 'Bokningen kan inte gå till ' + status + ' — ofullständiga krav.',
          code: 'requirements_incomplete',
          missing: check.missing,
          requirements: check.requirements,
        }, { status: 409 });
      }
    }

    const prev = booking.status;
    // Service-role: status är ett skyddat fält på entity-API:t så att kravkontrollen ovan inte kan förbigås.
    await svc.entities.Booking.update(booking_id, { status });

    // Audit-logg (får inte blockera).
    try {
      await svc.entities.AuditLog.create({
        clinic_id: booking.clinic_id,
        event_type: 'booking_status',
        entity_type: 'Booking',
        entity_id: booking_id,
        description: `Bokning för ${booking.customer_name || ''} status: ${prev} → ${status}`,
        user_id: user.id,
        user_name: user.full_name || user.email || '',
        metadata: JSON.stringify({ from: prev, to: status }),
      });
    } catch { /* swallow */ }

    return Response.json({ ok: true, booking_id, status, from: prev });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}