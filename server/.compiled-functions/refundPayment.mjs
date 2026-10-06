globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/refundPayment/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
import { secrets } from "./runtime/secrets-shim.js";

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

// ../base44/shared/audit.ts
async function recordAudit(base44, evt) {
  try {
    const user = await base44.auth.me();
    const clinicId = evt.clinic_id || getUserClinicIdSafe(user);
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: evt.event_type,
      entity_type: evt.entity_type,
      entity_id: evt.entity_id || "",
      description: (evt.description || "").slice(0, 500),
      user_id: user?.id || "",
      user_name: user?.full_name || user?.email || "",
      metadata: evt.metadata ? JSON.stringify(evt.metadata).slice(0, 4e3) : "",
      clinic_id: clinicId || ""
    });
  } catch {
  }
}
function getUserClinicIdSafe(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}

// ../base44/functions/refundPayment/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const { payment_id, amount } = body;
    if (!payment_id) return Response.json({ error: "payment_id kr\xE4vs" }, { status: 400 });
    const svc = base44.asServiceRole;
    const payment = await svc.entities.Payment.get(payment_id).catch(() => null);
    if (!payment) return Response.json({ error: "Betalning saknas" }, { status: 404 });
    if (!canAccessClinic(user, payment.clinic_id)) return Response.json({ error: "\xC5tkomst nekad" }, { status: 403 });
    if (payment.status === "refunded") return Response.json({ payment, message: "Redan \xE5terbetalad" });
    const partialAmountOre = amount != null && amount !== "" ? Math.round(Number(amount) * 100) : null;
    if (payment.stripe_payment_intent_id) {
      const stripeKey = secrets.get("STRIPE_SECRET_KEY");
      if (!stripeKey) return Response.json({ error: "Stripe inte konfigurerad" }, { status: 503 });
      const params = new URLSearchParams();
      params.append("payment_intent", payment.stripe_payment_intent_id);
      if (partialAmountOre) params.append("amount", String(partialAmountOre));
      const res = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Stripe-Version": "2025-10-29.clover", "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": crypto.randomUUID() },
        body: params
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Stripe refund error:", data.error?.message);
        return Response.json({ error: data.error?.message || "Stripe refund misslyckades" }, { status: 400 });
      }
    }
    const updated = await svc.entities.Payment.update(payment_id, { status: "refunded" });
    await recordAudit(base44, {
      event_type: "payment_refund",
      entity_type: "Payment",
      entity_id: payment_id,
      description: `Betalning \xE5terbetalad (${payment.method || "ok\xE4nd"})${partialAmountOre ? ` ${partialAmountOre / 100} kr` : ""}`,
      clinic_id: payment.clinic_id,
      metadata: { payment_id, method: payment.method, amount: partialAmountOre, booking_id: payment.booking_id || "" }
    });
    return Response.json({ payment: updated });
  } catch (error) {
    console.error("refundPayment:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
