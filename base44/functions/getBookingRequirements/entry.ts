import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { computeBookingRequirements } from '../../shared/bookingRequirements.ts';

// Returnerar behandlingsspecifik kravlista för en bokning med completed-flagga
// per krav. Används av personal på bokningsdetaljen och av kunden i portalen.
// Auktorisering: personal ser bokningar i sin klinik; kund ser endast egna
// bokningar (matchning via e-post).
import { canAccessClinic } from '../../shared/authz.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = body.booking_id || new URL(req.url).searchParams.get('booking_id');
    if (!bookingId) return Response.json({ error: 'booking_id krävs' }, { status: 400 });

    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(bookingId).catch(() => null);
    if (!booking) return Response.json({ error: 'Bokning hittades inte' }, { status: 404 });

    // Auktorisering: personal (klinikmatch) eller kund (egen bokning via e-post).
    const isStaff = user.role === 'admin' || !!user.data?.staff_role;
    if (isStaff) {
      if (!canAccessClinic(user, booking.clinic_id)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      if (!booking.customer_id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
      const email = (user.email || '').toLowerCase().trim();
      if (!customer || (customer.email || '').toLowerCase().trim() !== email) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
    const result = await computeBookingRequirements(svc, booking, treatment);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}