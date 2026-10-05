import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";

// Tar emot Stripe-webhooks. Validerar signaturen med STRIPE_WEBHOOK_SECRET
// (Web Crypto, asynkron) och uppdaterar bokning + betalning vid lyckad betalning.
async function verifySignature(rawBody, sigHeader, secret) {
  const parts = (sigHeader || "").split(",").map((s) => s.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !v1Part) return null;
  const t = tPart.slice(2);
  const v1 = v1Part.slice(3);
  const signed = `${t}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signed));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== v1.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0 ? Number(t) : null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const sig = req.headers.get("stripe-signature") || "";
    const secret = secrets.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) {
      return Response.json({ error: "Webhook-secret saknas" }, { status: 500 });
    }
    const rawBody = await req.text();
    const ts = await verifySignature(rawBody, sig, secret);
    if (!ts) {
      return Response.json({ error: "Ogiltig signatur" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const bookingId = pi.metadata?.booking_id;
      const clinicId = pi.metadata?.clinic_id || "";
      const customerName = pi.metadata?.customer_name || "";
      const amount = (pi.amount_received ?? pi.amount) / 100;

      if (bookingId) {
        const booking = await svc.entities.Booking.get(bookingId).catch(() => null);
        const treatmentName = booking?.treatment_name || "";
        const customerId = booking?.customer_id || "";

        // Undvik dublettregistrering om webhook:en levereras flera gånger.
        const existing = await svc.entities.Payment.filter(
          { booking_id: bookingId, status: "paid" },
          { limit: 1 }
        );
        if (!(existing.items || []).length) {
          const year = new Date().getFullYear();
          const countRes = await svc.entities.Payment.count({ clinic_id: clinicId });
          const seq = (countRes + 1).toString().padStart(4, "0");
          const vatRate = 25;
          await svc.entities.Payment.create({
            customer_id: customerId,
            customer_name: customerName,
            booking_id: bookingId,
            treatment_name: treatmentName,
            amount,
            vat: Math.round((amount * vatRate) / (100 + vatRate)),
            vat_rate: vatRate,
            method: "card",
            status: "paid",
            paid_at: new Date().toISOString(),
            receipt_number: `R-${year}-${seq}`,
            clinic_id: clinicId,
          });
          await svc.entities.Booking.update(bookingId, { status: "confirmed" });
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const bookingId = charge.metadata?.booking_id;
      if (bookingId) {
        await svc.entities.Payment.updateMany(
          { booking_id: bookingId, status: "paid" },
          { $set: { status: "refunded" } }
        ).catch(() => {});
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("stripeWebhook:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}