globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/createPaymentIntent/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
import { secrets } from "./runtime/secrets-shim.js";

// base44/shared/authz.ts
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

// base44/shared/hash.ts
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// base44/functions/createPaymentIntent/entry.ts
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { booking_id, payment_token } = body;
    if (!booking_id || typeof booking_id !== "string") {
      return Response.json({ error: "booking_id kr\xE4vs" }, { status: 400 });
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
      if (safeEqual(h, String(booking.pay_token_hash))) {
        allowed = true;
        viaToken = true;
      }
    }
    if (!allowed) {
      return Response.json({ error: "Du har inte beh\xF6righet att betala den h\xE4r bokningen" }, { status: 403 });
    }
    if (["cancelled", "no_show", "draft"].includes(booking.status) || viaToken && !["pending", "confirmed"].includes(booking.status)) {
      return Response.json({ error: "Bokningen kan inte betalas" }, { status: 409 });
    }
    const already = await svc.entities.Payment.filter({ booking_id, status: "paid" }, { limit: 1 });
    if ((already.items || []).length) {
      return Response.json({ error: "Bokningen \xE4r redan betald" }, { status: 409 });
    }
    const amount = Math.round((booking.price || 0) * 100);
    if (amount <= 0) {
      return Response.json({ error: "Belopp saknas p\xE5 bokningen" }, { status: 400 });
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
    params.append("metadata[customer_email]", booking.customer_email || booking.email || "");
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Stripe-Version": "2025-10-29.clover",
        "Content-Type": "application/x-www-form-urlencoded",
        // Samma bokning + belopp ger samma PaymentIntent vid omförsök: inga dubbla debiteringar.
        "Idempotency-Key": `lydia-pi-${booking_id}-${amount}`
      },
      body: params
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Stripe createPaymentIntent error:", data.error?.message);
      return Response.json({ error: data.error?.message || "Kunde inte skapa betalning" }, { status: 400 });
    }
    return Response.json({
      client_secret: data.client_secret,
      payment_intent_id: data.id,
      amount: booking.price
    });
  } catch (error) {
    console.error("createPaymentIntent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
