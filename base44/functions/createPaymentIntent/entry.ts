import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { isStaff, canAccessClinic } from "../../shared/authz.ts";
import { findCustomerForUser } from "../../shared/portalCustomer.ts";
import { sha256 } from "../../shared/hash.ts";

// Skapar en Stripe PaymentIntent för en bokning. Funktionen är nåbar utan inloggning (gästbokning),
// därför krävs ett av tre bevis på att anroparen får betala just den här bokningen:
//   1) personal i bokningens klinik,
//   2) den inloggade kund som äger bokningen,
//   3) gästens engångs-betalningstoken (returneras bara av createPublicBooking, lagras som hash).
// Belopp styrs alltid av bokningen, aldrig av anroparen.
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { booking_id, payment_token } = body;

    if (!booking_id || typeof booking_id !== "string") {
      return Response.json({ error: "booking_id krävs" }, { status: 400 });
    }

    const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
    if (!booking) {
      return Response.json({ error: "Bokning saknas" }, { status: 404 });
    }

    const user = await base44.auth.me().catch(() => null);
    let allowed = false;
    let viaToken = false;
    if (user && isStaff(user) && canAccessClinic(user, booking.clinic_id)) {
      allowed = true;
    } else if (user) {
      const customer = await findCustomerForUser(svc, user);
      if (customer && booking.customer_id && customer.id === booking.customer_id) allowed = true;
    }
    if (!allowed && payment_token && booking.pay_token_hash) {
      const h = await sha256(String(payment_token));
      if (safeEqual(h, String(booking.pay_token_hash))) { allowed = true; viaToken = true; }
    }
    if (!allowed) {
      return Response.json({ error: "Du har inte behörighet att betala den här bokningen" }, { status: 403 });
    }

    if (["cancelled", "no_show", "draft"].includes(booking.status) || (viaToken && !["pending", "confirmed"].includes(booking.status))) {
      return Response.json({ error: "Bokningen kan inte betalas" }, { status: 409 });
    }

    const already = await svc.entities.Payment.filter({ booking_id, status: "paid" }, { limit: 1 });
    if ((already.items || []).length) {
      return Response.json({ error: "Bokningen är redan betald" }, { status: 409 });
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

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": "2025-10-29.clover",
        "Content-Type": "application/x-www-form-urlencoded",
        // Samma bokning + belopp ger samma PaymentIntent vid omförsök: inga dubbla debiteringar.
        "Idempotency-Key": `lydia-pi-${booking_id}-${amount}`,
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