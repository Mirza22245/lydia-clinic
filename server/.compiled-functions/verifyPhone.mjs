globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/verifyPhone/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
import { secrets } from "./runtime/secrets-shim.js";

// base44/shared/sms.ts
function resolveSMSConfig(secretGetter) {
  const provider = secretGetter("SMS_PROVIDER");
  if (!provider) return null;
  const api_key = secretGetter("SMS_API_KEY");
  const api_secret = secretGetter("SMS_API_SECRET");
  const sender = secretGetter("SMS_SENDER") || "Lydia";
  if (!api_key || !api_secret) return null;
  return { provider, api_key, api_secret, sender };
}
function normalizePhone(phone) {
  let p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("0")) p = "+46" + p.slice(1);
  if (p.startsWith("+") && !p.startsWith("+46")) return p;
  if (!p.startsWith("+")) p = "+46" + p;
  return p;
}
async function sendSMS(config, to, message) {
  const phone = normalizePhone(to);
  switch (config.provider.toLowerCase()) {
    case "twilio":
      return sendViaTwilio(config, phone, message);
    case "46elks":
      return sendVia46Elks(config, phone, message);
    case "smsapi":
      return sendViaSmsApi(config, phone, message);
    default:
      return { success: false, error: `Ok\xE4nd SMS-provider: ${config.provider}` };
  }
}
async function sendViaTwilio(config, to, message) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.api_key}/Messages.json`;
  const auth = btoa(`${config.api_key}:${config.api_secret}`);
  const body = new URLSearchParams({ From: config.sender, To: to, Body: message });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Twilio error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.sid };
}
async function sendVia46Elks(config, to, message) {
  const res = await fetch("https://api.46elks.com/a1/sms", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.api_key}:${config.api_secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ from: config.sender, to, message }).toString()
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `46elks error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.id };
}
async function sendViaSmsApi(config, to, message) {
  const res = await fetch("https://api.smsapi.com/sms.do", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.api_secret}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      to: to.replace("+", ""),
      from: config.sender,
      message,
      format: "json"
    }).toString()
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `SMSAPI error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.message_id };
}

// base44/shared/audit.ts
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

// base44/shared/hash.ts
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

// base44/functions/verifyPhone/entry.ts
var CODE_TTL_MS = 10 * 60 * 1e3;
var MAX_SENDS_PER_HOUR = 3;
var MAX_ATTEMPTS = 5;
function makeCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1e6).padStart(6, "0");
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;
    let customer = await findCustomerForUser(svc, user);
    if (!customer) return Response.json({ error: "Ingen kundprofil hittades" }, { status: 404 });
    if (body.action === "send") {
      let phone = body.phone ? String(body.phone) : customer.phone;
      if (!phone || normalizePhone(phone).replace(/\D/g, "").length < 8) {
        return Response.json({ error: "Ange ett giltigt telefonnummer", code: "invalid_phone" }, { status: 400 });
      }
      phone = normalizePhone(phone);
      const flagPage = await svc.entities.FeatureFlag.filter({ clinic_id: customer.clinic_id, key: "sms" }, { limit: 1 });
      const flag = (flagPage.items || [])[0];
      const config = resolveSMSConfig((n) => secrets.get(n));
      if (!flag || flag.status === "disabled" || !config) {
        return Response.json({
          error: "SMS-verifiering \xE4r inte aktiverad \xE4nnu. Kontakta kliniken.",
          code: "sms_not_active"
        }, { status: 409 });
      }
      const since = new Date(Date.now() - 3600 * 1e3).toISOString();
      const recent = await svc.entities.PhoneVerification.filter({ customer_id: customer.id, created_at: { $gte: since } }, { limit: 10 });
      if ((recent.items || []).length >= MAX_SENDS_PER_HOUR) {
        return Response.json({ error: "F\xF6r m\xE5nga f\xF6rs\xF6k. V\xE4nta en stund och f\xF6rs\xF6k igen.", code: "rate_limited" }, { status: 429 });
      }
      if (customer.phone !== phone) {
        customer = await svc.entities.Customer.update(customer.id, { phone, phone_verified: false });
      }
      const code = makeCode();
      const rec = await svc.entities.PhoneVerification.create({
        clinic_id: customer.clinic_id,
        customer_id: customer.id,
        phone,
        code_hash: await sha256(`${customer.id}|${phone}|${code}`),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        consumed: false
      });
      const result = await sendSMS(config, phone, `Lydia: Din verifieringskod \xE4r ${code}. Den g\xE4ller i 10 minuter. Dela den inte med n\xE5gon.`);
      if (!result.success) {
        await svc.entities.PhoneVerification.delete(rec.id).catch(() => {
        });
        await recordAudit(base44, { event_type: "phone_verification_failed", entity_type: "Customer", entity_id: customer.id, clinic_id: customer.clinic_id, description: "SMS med verifieringskod kunde inte skickas" });
        return Response.json({ error: "Kunde inte skicka SMS just nu. F\xF6rs\xF6k igen senare.", code: "sms_failed" }, { status: 502 });
      }
      await recordAudit(base44, { event_type: "phone_verification_sent", entity_type: "Customer", entity_id: customer.id, clinic_id: customer.clinic_id, description: "Verifieringskod skickad via SMS" });
      return Response.json({ ok: true, expires_in_seconds: CODE_TTL_MS / 1e3 });
    }
    if (body.action === "confirm") {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return Response.json({ error: "Koden best\xE5r av 6 siffror", code: "invalid_code" }, { status: 400 });
      const page = await svc.entities.PhoneVerification.filter({ customer_id: customer.id, consumed: false }, { sort: "-created_at", limit: 1 });
      const rec = (page.items || [])[0];
      if (!rec || new Date(rec.expires_at).getTime() < Date.now()) {
        return Response.json({ error: "Koden har g\xE5tt ut. Beg\xE4r en ny kod.", code: "expired" }, { status: 400 });
      }
      if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
        return Response.json({ error: "F\xF6r m\xE5nga felaktiga f\xF6rs\xF6k. Beg\xE4r en ny kod.", code: "too_many_attempts" }, { status: 429 });
      }
      if (rec.phone !== customer.phone) {
        return Response.json({ error: "Telefonnumret har \xE4ndrats. Beg\xE4r en ny kod.", code: "phone_changed" }, { status: 400 });
      }
      const hash = await sha256(`${customer.id}|${rec.phone}|${code}`);
      if (hash !== rec.code_hash) {
        await svc.entities.PhoneVerification.update(rec.id, { attempts: (rec.attempts || 0) + 1 });
        return Response.json({ error: "Fel kod", code: "invalid_code" }, { status: 400 });
      }
      await svc.entities.PhoneVerification.update(rec.id, { consumed: true });
      await svc.entities.Customer.update(customer.id, { phone_verified: true });
      await recordAudit(base44, { event_type: "phone_verified", entity_type: "Customer", entity_id: customer.id, clinic_id: customer.clinic_id, description: "Telefonnummer verifierat" });
      return Response.json({ ok: true, phone_verified: true });
    }
    return Response.json({ error: "Ogiltig action" }, { status: 400 });
  } catch (error) {
    console.error("verifyPhone:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
