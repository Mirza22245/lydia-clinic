globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/sendReceiptEmail/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/receipt.ts
var methodLabels = {
  card: "Kort",
  swish: "Swish",
  cash: "Kontant",
  invoice: "Faktura"
};
var fmtDateTime = (d) => d ? new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
var fmtSEK = (n) => new Intl.NumberFormat("sv-SE").format(n || 0);
async function sendReceiptForPayment(svc, paymentId) {
  const payment = await svc.entities.Payment.get(paymentId);
  if (!payment) throw new Error("Payment not found");
  let email = "";
  let customerName = payment.customer_name || "";
  if (payment.customer_id) {
    const customer = await svc.entities.Customer.get(payment.customer_id).catch(() => null);
    if (customer) {
      email = customer.email || "";
      customerName = customer.name || customerName;
    }
  }
  if (!email) throw new Error("Customer has no email");
  let clinicName = "Klinik";
  let clinicAddress = "";
  let clinicOrgNumber = "";
  let clinicPhone = "";
  let clinicEmail = "";
  if (payment.clinic_id) {
    const clinic = await svc.entities.Clinic.get(payment.clinic_id).catch(() => null);
    if (clinic) {
      clinicName = clinic.name || clinicName;
      clinicAddress = clinic.address || "";
      clinicOrgNumber = clinic.org_number || "";
      clinicPhone = clinic.phone || "";
      clinicEmail = clinic.email || "";
    }
  }
  await svc.integrations.Core.SendEmail({
    to: email,
    template_name: "Receipt",
    variables: {
      customer_name: customerName,
      treatment_name: payment.treatment_name || "",
      receipt_number: payment.receipt_number || "",
      amount: fmtSEK(payment.amount),
      vat: fmtSEK(payment.vat),
      method: methodLabels[payment.method] || payment.method || "",
      paid_at: fmtDateTime(payment.paid_at),
      clinic_name: clinicName,
      clinic_address: clinicAddress,
      clinic_org_number: clinicOrgNumber,
      clinic_phone: clinicPhone,
      clinic_email: clinicEmail
    }
  });
  return { sent: true, to: email };
}

// ../base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function getStaffRole(user) {
  if (user?.role === "admin") return "administrat\xF6r";
  const v = user?.staff_role ?? user?.data?.staff_role ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function isPlatformAdmin(user) {
  return user?.role === "admin" && !getUserClinicId(user);
}
function isStaff(user) {
  return isPlatformAdmin(user) || !!getStaffRole(user);
}
function canAccessClinic(user, recordClinicId) {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}
function requireStaff(user) {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isStaff(user)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

// ../base44/functions/sendReceiptEmail/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const paymentId = body.payment_id;
    if (!paymentId) return Response.json({ error: "payment_id required" }, { status: 400 });
    const payment = await base44.asServiceRole.entities.Payment.get(paymentId).catch(() => null);
    if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });
    if (!requireStaff(user).ok || !canAccessClinic(user, payment.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await sendReceiptForPayment(base44.asServiceRole, paymentId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
