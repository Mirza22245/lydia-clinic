import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Hämtar den inloggade patientens egna data för kundportalen.
// Accesskontroll sker i koden: patienten matchas mot en Customer-post via e-post,
// och endast den kundens poster returneras (service role kringgår RLS säkert).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const email = (user.email || '').toLowerCase().trim();
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });

    const svc = base44.asServiceRole;
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const custPage = await svc.entities.Customer.filter(
      { email: { $regex: `^${escEmail}$`, $options: 'i' } },
      { limit: 1 }
    );
    const customer = (custPage.items || [])[0];
    if (!customer) return Response.json({ customer: null });

    const cid = customer.id;
    const [bookings, journals, health, forms, consents, payments] = await Promise.all([
      svc.entities.Booking.filter({ customer_id: cid }, { sort: '-start_time', limit: 200 }),
      svc.entities.JournalEntry.filter({ customer_id: cid }, { sort: '-entry_date', limit: 200 }),
      svc.entities.HealthDeclaration.filter({ customer_id: cid }, { sort: '-submitted_at', limit: 50 }),
      svc.entities.FormSubmission.filter({ customer_id: cid }, { sort: '-submitted_at', limit: 50 }),
      svc.entities.Consent.filter({ customer_id: cid }, { sort: '-granted_at', limit: 100 }),
      svc.entities.Payment.filter({ customer_id: cid }, { sort: '-paid_at', limit: 200 }),
    ]);

    return Response.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        birth_date: customer.birth_date,
      },
      bookings: bookings.items || [],
      journals: journals.items || [],
      healthDeclarations: health.items || [],
      formSubmissions: forms.items || [],
      consents: consents.items || [],
      payments: payments.items || [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}