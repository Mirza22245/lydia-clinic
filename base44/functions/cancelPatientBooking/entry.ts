import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

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

    const updated = await svc.entities.Booking.update(booking_id, { status: 'cancelled' });
    return Response.json({ booking: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}