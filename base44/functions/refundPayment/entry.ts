import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { requireStaff, canAccessClinic } from "../../shared/authz.ts";
import { recordAudit } from "../../shared/audit.ts";

// Återbetalar en betalning. Kortbetalningar (med stripe_payment_intent_id) återbetalas
// via Stripe Refunds API (idempotent via Idempotency-Key). Kontant/faktura markeras
// bara som refunded lokalt. Endast personal i betalningens klinik kan anropa.
function envGet(n) {
  try { if (typeof Deno !== "undefined") return Deno.env.get(n); } catch {}
  return (typeof process !== "undefined" && process.env ? process.env[n] : undefined) || undefined;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });

    const body = await req.json().catch(() => ({}));
    const { payment_id, amount } = body;
    if (!payment_id) return Response.json({ error: "payment_id krävs" }, { status: 400 });

    const svc = base44.asServiceRole;
    const payment = await svc.entities.Payment.get(payment_id).catch(() => null);
    if (!payment) return Response.json({ error: "Betalning saknas" }, { status: 404 });
    if (!canAccessClinic(user, payment.clinic_id)) return Response.json({ error: "Åtkomst nekad" }, { status: 403 });
    if (payment.status === "refunded") return Response.json({ payment, message: "Redan återbetalad" });

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
        body: params,
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
      description: `Betalning återbetalad (${payment.method || "okänd"})${partialAmountOre ? ` ${partialAmountOre / 100} kr` : ""}`,
      clinic_id: payment.clinic_id,
      metadata: { payment_id, method: payment.method, amount: partialAmountOre, booking_id: payment.booking_id || "" },
    });

    return Response.json({ payment: updated });
  } catch (error) {
    console.error("refundPayment:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}