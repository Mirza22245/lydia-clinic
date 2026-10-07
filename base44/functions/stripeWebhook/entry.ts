import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { sendReceiptForPayment } from "../../shared/receipt.ts";
import { computeBookingRequirements } from "../../shared/bookingRequirements.ts";

// Tar emot Stripe-webhooks. Validerar signaturen med STRIPE_WEBHOOK_SECRET
// (Web Crypto, asynkron) och uppdaterar bokning + betalning vid lyckad betalning.
// Skapar automatiskt ett kvitto och skickar det via e-post efter godkänd betalning.
async function verifySignature(rawBody, sigHeader, secret) {
  const parts = (sigHeader || "").split(",").map((s) => s.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3)).filter(Boolean);
  if (!tPart || !v1Parts.length) return null;
  const t = tPart.slice(2);
  const timestamp = Number(t);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return null;
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
  const expectedBytes = new TextEncoder().encode(expected);
  for (const v1 of v1Parts) {
    if (v1.length !== expected.length) continue;
    const candidateBytes = new TextEncoder().encode(v1);
    if (candidateBytes.length !== expectedBytes.length) continue;
    let diff = 0;
    for (let i = 0; i < expectedBytes.length; i++) diff |= expectedBytes[i] ^ candidateBytes[i];
    if (diff === 0) return timestamp;
  }
  return null;
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
        const expectedAmount = Math.round(Number(booking?.price || 0) * 100);
        if (!expectedAmount || Math.round(Number(pi.amount_received ?? pi.amount ?? 0)) !== expectedAmount) {
          console.error("Stripe webhook amount mismatch", { bookingId, expectedAmount, received: pi.amount_received ?? pi.amount });
          return Response.json({ error: "Betalningsbeloppet stämmer inte med bokningen" }, { status: 400 });
        }

        // Deduplicera på Stripe PaymentIntent-ID först. Webhooks kan levereras
        // flera gånger eller samtidigt från Stripe.
        const existingByIntent = await svc.entities.Payment.filter(
          { stripe_payment_intent_id: pi.id },
          { limit: 1 }
        );
        const existing = existingByIntent.items?.length
          ? existingByIntent
          : await svc.entities.Payment.filter({ booking_id: bookingId, status: "paid" }, { limit: 1 });
        if (!(existing.items || []).length) {
          const year = new Date().getFullYear();
          const countRes = await svc.entities.Payment.count({ clinic_id: clinicId });
          const seq = (countRes + 1).toString().padStart(4, "0");
          const vatRate = 25;
          const created = await svc.entities.Payment.create({
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
            stripe_payment_intent_id: pi.id,
            clinic_id: clinicId,
          });
          // Betalning bekräftar bara bokningen om alla övriga obligatoriska krav (hälsodeklaration,
          // samtycke, formulär) också är uppfyllda — annars förbigås Requirement Engine med ett kort.
          if (booking) {
            const patch = { deposit_paid: (booking.deposit_amount || 0) > 0 };
            if (booking.status === "pending") {
              const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
              const check = await computeBookingRequirements(svc, booking, treatment);
              if (!treatment || check.enforceableCount === 0 || check.allCompleted) patch.status = "confirmed";
            }
            await svc.entities.Booking.update(bookingId, patch);
          }
          // Skicka kvitto automatiskt — fel fångas tyst så att webhook:en
          // aldrig misslyckas på grund av e-postproblem.
          await sendReceiptForPayment(svc, created.id).catch((e) => {
            console.error("Receipt email failed:", e.message);
          });
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const bookingId = charge.metadata?.booking_id;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
      if (bookingId) {
        await svc.entities.Payment.updateMany(
          { booking_id: bookingId, status: "paid" },
          { $set: { status: "refunded" } }
        ).catch(() => {});
      } else if (paymentIntentId) {
        await svc.entities.Payment.updateMany(
          { stripe_payment_intent_id: paymentIntentId, status: "paid" },
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