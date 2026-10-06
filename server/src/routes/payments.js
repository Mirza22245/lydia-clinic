// Betalningsrutter — speglar createPaymentIntent + stripeWebhook
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import { sendEmail } from "../lib/email.js";

const router = Router();

// Skapa Stripe PaymentIntent
router.post("/intent", async (req, res) => {
  try {
    const { booking_id } = req.body;
    const booking = await db.get("bookings", booking_id, req.user.clinic_id);
    if (!booking) return res.status(404).json({ error: "Bokning saknas" });

    const amount = Math.round((booking.price || 0) * 100);
    if (amount <= 0) return res.status(400).json({ error: "Belopp saknas" });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: "Stripe inte konfigurerat" });

    const res2 = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2025-10-29.clover",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: new URLSearchParams({
        amount: String(amount),
        currency: "sek",
        "automatic_payment_methods[enabled]": "true",
        "metadata[booking_id]": booking_id,
        "metadata[clinic_id]": booking.clinic_id,
        "metadata[customer_name]": booking.customer_name,
        "metadata[base44_app_id]": process.env.BASE44_APP_ID || "",
      }).toString(),
    });

    if (!res2.ok) {
      const err = await res2.text();
      return res.status(502).json({ error: "Stripe error: " + err });
    }

    const intent = await res2.json();
    res.json({ client_secret: intent.client_secret, payment_intent_id: intent.id });
  } catch (err) {
    console.error("Payment intent error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook — verifierar betalning server-side
async function webhookHandler(req, res) {
  try {
    const sig = req.headers["stripe-signature"] || "";
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: "Webhook secret saknas" });

    // Verifiera signatur (HMAC-SHA256)
    const parts = sig.split(",").map((s) => s.trim());
    const tPart = parts.find((p) => p.startsWith("t="));
    const v1Part = parts.find((p) => p.startsWith("v1="));
    if (!tPart || !v1Part) return res.status(400).json({ error: "Ogiltig signatur" });

    const t = tPart.slice(2);
    const v1 = v1Part.slice(3);
    const signed = t + "." + JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");

    if (expected !== v1) return res.status(400).json({ error: "Ogiltig signatur" });

    const event = req.body;

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const bookingId = pi.metadata?.booking_id;
      const clinicId = pi.metadata?.clinic_id;
      const customerName = pi.metadata?.customer_name || "";
      const amount = (pi.amount_received ?? pi.amount) / 100;

      if (bookingId) {
        const booking = await db.get("bookings", bookingId, clinicId);
        const existing = await db.filter("payments", { booking_id: bookingId, status: "paid" }, { limit: 1, clinicId });
        if (!existing.items.length) {
          const year = new Date().getFullYear();
          const count = await db.count("payments", { clinic_id: clinicId }, clinicId);
          const seq = (count + 1).toString().padStart(4, "0");
          const vatRate = 25;
          const payment = await db.create("payments", {
            customer_id: booking?.customer_id || "",
            customer_name: customerName,
            booking_id: bookingId,
            treatment_name: booking?.treatment_name || "",
            amount,
            vat: Math.round((amount * vatRate) / (100 + vatRate)),
            vat_rate: vatRate,
            method: "card",
            status: "paid",
            paid_at: new Date().toISOString(),
            receipt_number: "R-" + year + "-" + seq,
            stripe_payment_intent_id: pi.id,
            clinic_id: clinicId,
          }, clinicId);

          await db.update("bookings", bookingId, { status: "confirmed", deposit_paid: (booking?.deposit_amount || 0) > 0 }, clinicId);

          // Skicka kvitto
          if (booking?.customer_id) {
            const customer = await db.get("customers", booking.customer_id, clinicId);
            if (customer?.email) {
              await sendEmail({
                to: customer.email,
                template_name: "Receipt",
                variables: {
                  customer_name: customer.name,
                  receipt_number: payment.receipt_number,
                  amount: amount.toLocaleString("sv-SE"),
                  treatment_name: payment.treatment_name,
                },
              }).catch(() => {});
            }
          }
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const bookingId = charge.metadata?.booking_id;
      if (bookingId) {
        // Markera betalning som refunded
        // TODO: updateMany
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
}

export default { router, webhookHandler };