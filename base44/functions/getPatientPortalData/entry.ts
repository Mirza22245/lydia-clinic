import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { findCustomerForUser, normalizeEmail } from '../../shared/portalCustomer.ts';

// Hämtar den inloggade patientens egna data för kundportalen.
// Accesskontroll sker i koden: patienten matchas mot en Customer-post via e-post,
// och endast den kundens poster returneras (service role kringgår RLS säkert).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!normalizeEmail(user)) return Response.json({ error: 'No email on account' }, { status: 400 });

    const svc = base44.asServiceRole;
    const customer = await findCustomerForUser(svc, user);
    if (!customer) return Response.json({ customer: null });

    const cid = customer.id;
    const [bookings, journals, health, forms, consents, payments, plans, messages] = await Promise.all([
      svc.entities.Booking.filter({ customer_id: cid }, { sort: '-start_time', limit: 200 }),
      svc.entities.JournalEntry.filter({ customer_id: cid }, { sort: '-entry_date', limit: 200 }),
      svc.entities.HealthDeclaration.filter({ customer_id: cid }, { sort: '-submitted_at', limit: 50 }),
      svc.entities.FormSubmission.filter({ customer_id: cid }, { sort: '-submitted_at', limit: 50 }),
      svc.entities.Consent.filter({ customer_id: cid }, { sort: '-granted_at', limit: 100 }),
      svc.entities.Payment.filter({ customer_id: cid }, { sort: '-paid_at', limit: 200 }),
      svc.entities.TreatmentPlan.filter({ customer_id: cid }, { sort: '-created_date', limit: 50 }),
      svc.entities.Message.filter({ customer_id: cid }, { sort: '-sent_at', limit: 100 }),
    ]);

    return Response.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        birth_date: customer.birth_date,
        email_verified: !!customer.email_verified,
        phone_verified: !!customer.phone_verified,
      },
      treatmentPlans: (plans.items || []).map((p) => ({
        id: p.id, treatment_name: p.treatment_name, recommended_interval_days: p.recommended_interval_days,
        next_recommended_date: p.next_recommended_date, status: p.status, notes: p.notes,
      })),
      messages: (messages.items || []).map((m) => ({
        id: m.id, direction: m.direction, subject: m.subject, body: m.body, sent_at: m.sent_at, staff_name: m.staff_name,
      })),
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