import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";

// Skapar en Stripe PaymentIntent för en bokning. Aktiverar automatiska
// betalningsmetoder (kort, Apple Pay/Google Pay, Klarna) och binder metadata
// till bokningen så webhook:en kan uppdatera orderstatus.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { booking_id } = body;

    if (!booking_id) {
      return Response.json({ error: "booking_id krävs" }, { status: 400 });
    }

    const booking = await svc.entities.Booking.get(booking_id);
    if (!booking) {
      return Response.json({ error: "Bokning saknas" }, { status: 404 });
    }

    // Inga betalningar för inställda/uteblivna bokningar (funktionen är offentlig; belopp styrs alltid av bokningen).
    if (['cancelled', 'no_show'].includes(booking.status)) {
      return Response.json({ error: "Bokningen är inställd" }, { status: 409 });
    }

    const amount = Math.round((booking.price || 0) * 100); // kr -> öre
    if (amount <= 0) {
      return Response.json({ error: "Belopp saknas på bokningen" }, { status: 400 });
    }

    const stripeKey = secrets.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return Response.json({ error: "Stripe secret key saknas" }, { status: 500 });
    }

    const params = new URLSearchParams();
    params.append("amount", String(amount));
    params.append("currency", "sek");
    params.append("automatic_payment_methods[enabled]", "true");
    params.append("metadata[booking_id]", booking_id);
    params.append("metadata[clinic_id]", booking.clinic_id || "");
    params.append("metadata[customer_name]", booking.customer_name || "");
    params.append("metadata[customer_email]", "");
    params.append("metadata[base44_app_id]", (typeof process !== "undefined" && process.env ? process.env.BASE44_APP_ID : "") || "");

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": "2025-10-29.clover",
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: params,
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe createPaymentIntent error:", data.error?.message);
      return Response.json({ error: data.error?.message || "Kunde inte skapa betalning" }, { status: 400 });
    }

    return Response.json({
      client_secret: data.client_secret,
      payment_intent_id: data.id,
      amount: booking.price,
    });
  } catch (error) {
    console.error("createPaymentIntent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}