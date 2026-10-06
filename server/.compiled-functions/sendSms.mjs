globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/sendSms/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
import { secrets } from "./runtime/secrets-shim.js";

// ../base44/shared/sms.ts
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
var SMS_TEMPLATES = {
  booking_confirmation: (date, time) => `Lydia: Din bokning \xE4r bekr\xE4ftad. V\xE4lkommen ${date} kl ${time}. Se detaljer i din kundportal.`,
  booking_reminder_24h: (date, time) => `Lydia: P\xE5minnelse om din tid ${date} kl ${time}. Avboka senast 24h i f\xF6rv\xE4g om behov.`,
  booking_reminder_2h: (time) => `Lydia: Din tid b\xF6rjar om 2 timmar (kl ${time}). V\xE4lkommen!`,
  booking_cancelled: () => `Lydia: Din bokning har avbokats. Boka ny tid i kundportalen n\xE4r du \xF6nskar.`,
  booking_rescheduled: (date, time) => `Lydia: Din tid har ombokats till ${date} kl ${time}.`,
  form_reminder: () => `Lydia: Du har ett formul\xE4r att fylla i inf\xF6r ditt bes\xF6k. Logga in i kundportalen.`,
  consent_reminder: () => `Lydia: Ett samtycke v\xE4ntar din signering. Logga in i kundportalen f\xF6r att slutf\xF6ra.`,
  follow_up: () => `Lydia: Vi hoppas du \xE4r n\xF6jd med din behandling. Logga in i kundportalen f\xF6r att l\xE4mna feedback.`
};

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
function requireStaff(user) {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isStaff(user)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

// ../base44/functions/sendSms/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const { to, template, template_args, message, customer_id, booking_id } = body;
    if (!to) {
      return Response.json({ error: "to kr\xE4vs" }, { status: 400 });
    }
    const config = resolveSMSConfig((n) => secrets.get(n));
    if (!config) {
      return Response.json(
        { error: "SMS inte konfigurerat. Kontakta administrat\xF6r." },
        { status: 503 }
      );
    }
    let text = message;
    if (template) {
      const fn = SMS_TEMPLATES[template];
      if (!fn) {
        return Response.json({ error: "Ok\xE4nd mall: " + template }, { status: 400 });
      }
      text = fn(...template_args || []);
    }
    if (!text) {
      return Response.json({ error: "Meddelande saknas" }, { status: 400 });
    }
    if (String(text).length > 480) {
      return Response.json({ error: "Meddelandet \xE4r f\xF6r l\xE5ngt (max 480 tecken)" }, { status: 400 });
    }
    const result = await sendSMS(config, to, text);
    const tplName = template || "custom";
    const desc = result.success ? "SMS skickat (" + tplName + ")" : "SMS misslyckades: " + (result.error || "");
    await recordAudit(base44, {
      event_type: result.success ? "sms_sent" : "sms_failed",
      entity_type: "Customer",
      entity_id: customer_id || "",
      description: desc,
      metadata: {
        to,
        template: tplName,
        booking_id: booking_id || "",
        message_id: result.messageId || "",
        error: result.error || ""
      }
    });
    if (!result.success) {
      return Response.json(result, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    console.error("sendSms:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
