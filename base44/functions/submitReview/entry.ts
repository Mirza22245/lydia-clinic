import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.booking_id || '').trim();
    const rating = Number(body.rating);
    const text = String(body.text || '').trim().slice(0, 2000);
    const wouldRecommend = body.would_recommend !== false;

    if (!bookingId) return Response.json({ error: 'booking_id krävs' }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Response.json({ error: 'Betyget måste vara 1–5 stjärnor' }, { status: 400 });
    if (text.length < 3) return Response.json({ error: 'Skriv gärna ett kort omdöme' }, { status: 400 });

    const email = String(user.email || '').toLowerCase().trim();
    if (!email) return Response.json({ error: 'Kontot saknar e-postadress' }, { status: 400 });

    const svc = base44.asServiceRole;
    const customers = await svc.entities.Customer.filter({ email }, { limit: 2 });
    const customer = (customers.items || [])[0];
    if (!customer) return Response.json({ error: 'Ingen kundprofil hittades' }, { status: 404 });

    const booking = await svc.entities.Booking.get(bookingId).catch(() => null);
    if (!booking || booking.customer_id !== customer.id) {
      return Response.json({ error: 'Bokningen hör inte till ditt konto' }, { status: 403 });
    }
    if (booking.status !== 'completed') {
      return Response.json({ error: 'Omdöme kan lämnas efter genomförd behandling' }, { status: 409 });
    }

    const existing = await svc.entities.Review.filter({ booking_id: bookingId }, { limit: 1 });
    if ((existing.items || []).length) return Response.json({ error: 'Du har redan lämnat ett omdöme för denna behandling' }, { status: 409 });

    const review = await svc.entities.Review.create({
      customer_id: customer.id,
      customer_name: customer.name || user.full_name || 'Kund',
      booking_id: booking.id,
      treatment_name: booking.treatment_name || '',
      rating,
      text,
      would_recommend: wouldRecommend,
      published: false,
      clinic_id: booking.clinic_id,
    });

    return Response.json({ review, verified: true });
  } catch (error) {
    return Response.json({ error: error.message || 'Kunde inte spara omdömet' }, { status: 500 });
  }
}
