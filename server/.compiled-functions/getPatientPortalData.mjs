globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/getPatientPortalData/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// base44/shared/portalCustomer.ts
function normalizeEmail(user) {
  return (user?.email || "").toLowerCase().trim();
}
async function findCustomerForUser(svc, user) {
  const email = normalizeEmail(user);
  if (!email) return null;
  const esc = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = await svc.entities.Customer.filter(
    { email: { $regex: `^${esc}$`, $options: "i" } },
    { limit: 1 }
  );
  return (page.items || [])[0] || null;
}

// base44/shared/featureFlags.ts
function parseFlagConfig(flag) {
  try {
    const value = typeof flag?.config === "string" ? JSON.parse(flag.config || "{}") : flag?.config || {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
async function getClinicRule(svc, clinic_id, key) {
  const page = await svc.entities.FeatureFlag.filter({ clinic_id, key }, { limit: 1 });
  const flag = (page.items || [])[0];
  const status = flag?.status === "enabled" || flag?.status === "test" ? flag.status : "disabled";
  return {
    status,
    config: parseFlagConfig(flag),
    active: status !== "disabled",
    enforce: status === "enabled"
  };
}
async function isFlagActive(svc, clinic_id, key) {
  const rule = await getClinicRule(svc, clinic_id, key);
  return rule.active;
}

// base44/functions/getPatientPortalData/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!normalizeEmail(user)) return Response.json({ error: "No email on account" }, { status: 400 });
    const svc = base44.asServiceRole;
    const customer = await findCustomerForUser(svc, user);
    if (!customer) return Response.json({ customer: null });
    const cid = customer.id;
    const [msgOn, plansOn, smsOn] = await Promise.all([
      isFlagActive(svc, customer.clinic_id, "messages"),
      isFlagActive(svc, customer.clinic_id, "treatment_plans"),
      isFlagActive(svc, customer.clinic_id, "sms")
    ]);
    const none = Promise.resolve({ items: [] });
    const [bookings, journals, health, forms, consents, payments, plans, messages] = await Promise.all([
      svc.entities.Booking.filter({ customer_id: cid }, { sort: "-start_time", limit: 200 }),
      svc.entities.JournalEntry.filter({ customer_id: cid }, { sort: "-entry_date", limit: 200 }),
      svc.entities.HealthDeclaration.filter({ customer_id: cid }, { sort: "-submitted_at", limit: 50 }),
      svc.entities.FormSubmission.filter({ customer_id: cid }, { sort: "-submitted_at", limit: 50 }),
      svc.entities.Consent.filter({ customer_id: cid }, { sort: "-granted_at", limit: 100 }),
      svc.entities.Payment.filter({ customer_id: cid }, { sort: "-paid_at", limit: 200 }),
      plansOn ? svc.entities.TreatmentPlan.filter({ customer_id: cid }, { sort: "-created_date", limit: 50 }) : none,
      msgOn ? svc.entities.Message.filter({ customer_id: cid }, { sort: "-sent_at", limit: 100 }) : none
    ]);
    return Response.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        birth_date: customer.birth_date,
        email_verified: !!customer.email_verified,
        phone_verified: !!customer.phone_verified
      },
      features: { messages: msgOn, treatment_plans: plansOn, sms: smsOn },
      treatmentPlans: (plans.items || []).map((p) => ({
        id: p.id,
        treatment_name: p.treatment_name,
        recommended_interval_days: p.recommended_interval_days,
        next_recommended_date: p.next_recommended_date,
        status: p.status,
        notes: p.notes
      })),
      messages: (messages.items || []).map((m) => ({
        id: m.id,
        direction: m.direction,
        subject: m.subject,
        body: m.body,
        sent_at: m.sent_at,
        staff_name: m.staff_name
      })),
      bookings: bookings.items || [],
      journals: journals.items || [],
      healthDeclarations: health.items || [],
      formSubmissions: forms.items || [],
      consents: consents.items || [],
      payments: payments.items || []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
