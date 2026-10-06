import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { resolveSMSConfig, sendSMS, normalizePhone } from "../../shared/sms.ts";
import { recordAudit } from "../../shared/audit.ts";
import { sha256 } from "../../shared/hash.ts";
import { findCustomerForUser } from "../../shared/portalCustomer.ts";

// Telefonverifiering för inloggad kund via SMS-engångskod.
//   { action: "send", phone? }   — skickar en 6-siffrig kod (giltig 10 min, max 3 per timme)
//   { action: "confirm", code }  — verifierar koden och sätter Customer.phone_verified = true
// Koden lagras ENDAST som SHA-256-hash och går aldrig tillbaka till klienten.
// Skickar inget om SMS-modulen är avstängd eller saknar leverantörsnycklar — då svarar
// funktionen tydligt "SMS inte aktiverat" i stället för att låtsas skicka.
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

function makeCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

export default async function (req) {
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

      // SMS måste vara aktiverat (feature flag) och konfigurerat (secrets).
      const flagPage = await svc.entities.FeatureFlag.filter({ clinic_id: customer.clinic_id, key: "sms" }, { limit: 1 });
      const flag = (flagPage.items || [])[0];
      const config = resolveSMSConfig((n) => secrets.get(n));
      if (!flag || flag.status === "disabled" || !config) {
        return Response.json({
          error: "SMS-verifiering är inte aktiverad ännu. Kontakta kliniken.",
          code: "sms_not_active",
        }, { status: 409 });
      }

      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await svc.entities.PhoneVerification.filter({ customer_id: customer.id, created_at: { $gte: since } }, { limit: 10 });
      if ((recent.items || []).length >= MAX_SENDS_PER_HOUR) {
        return Response.json({ error: "För många försök. Vänta en stund och försök igen.", code: "rate_limited" }, { status: 429 });
      }

      // Byte av nummer återställer verifieringen.
      if (customer.phone !== phone) {
        customer = await svc.entities.Customer.update(customer.id, { phone, phone_verified: false });
      }

      const code = makeCode();
      const rec = await svc.entities.PhoneVerification.create({
        clinic_id: customer.clinic_id,
        customer_id: customer.id,
        phone,
        code_hash: await sha256(`${customer.id}|${phone}|${code}`),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        consumed: false,
      });

      const result = await sendSMS(config, phone, `Lydia: Din verifieringskod är ${code}. Den gäller i 10 minuter. Dela den inte med någon.`);
      if (!result.success) {
        await svc.entities.PhoneVerification.delete(rec.id).catch(() => {});
        await recordAudit(base44, { event_type: "phone_verification_failed", entity_type: "Customer", entity_id: customer.id, clinic_id: customer.clinic_id, description: "SMS med verifieringskod kunde inte skickas" });
        return Response.json({ error: "Kunde inte skicka SMS just nu. Försök igen senare.", code: "sms_failed" }, { status: 502 });
      }
      await recordAudit(base44, { event_type: "phone_verification_sent", entity_type: "Customer", entity_id: customer.id, clinic_id: customer.clinic_id, description: "Verifieringskod skickad via SMS" });
      return Response.json({ ok: true, expires_in_seconds: CODE_TTL_MS / 1000 });
    }

    if (body.action === "confirm") {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return Response.json({ error: "Koden består av 6 siffror", code: "invalid_code" }, { status: 400 });

      const page = await svc.entities.PhoneVerification.filter({ customer_id: customer.id, consumed: false }, { sort: "-created_at", limit: 1 });
      const rec = (page.items || [])[0];
      if (!rec || new Date(rec.expires_at).getTime() < Date.now()) {
        return Response.json({ error: "Koden har gått ut. Begär en ny kod.", code: "expired" }, { status: 400 });
      }
      if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
        return Response.json({ error: "För många felaktiga försök. Begär en ny kod.", code: "too_many_attempts" }, { status: 429 });
      }
      if (rec.phone !== customer.phone) {
        return Response.json({ error: "Telefonnumret har ändrats. Begär en ny kod.", code: "phone_changed" }, { status: 400 });
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