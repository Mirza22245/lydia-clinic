globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/signPatientConsent/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

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

// ../base44/shared/hash.ts
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ../base44/functions/signPatientConsent/entry.ts
var consentTypeLabels = {
  treatment: "Behandlingssamtycke",
  journal: "Journalsamtycke",
  photography: "Fotosamtycke",
  image_use: "Anv\xE4ndning av bilder",
  communication: "Kommunikationssamtycke",
  marketing: "Marknadsf\xF6ringssamtycke"
};
function getClientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "";
}
function getBaseUrl(req) {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return host ? `${proto}://${host}` : "";
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const consentId = body.consent_id;
    if (!consentId) return Response.json({ error: "consent_id required" }, { status: 400 });
    const email = (user.email || "").toLowerCase().trim();
    if (!email) return Response.json({ error: "No email on account" }, { status: 400 });
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const svc = base44.asServiceRole;
    const custPage = await svc.entities.Customer.filter(
      { email: { $regex: `^${escEmail}$`, $options: "i" } },
      { limit: 1 }
    );
    const customer = (custPage.items || [])[0];
    if (!customer) return Response.json({ error: "No patient profile" }, { status: 404 });
    const consent = await svc.entities.Consent.get(consentId);
    if (!consent || consent.customer_id !== customer.id) {
      return Response.json({ error: "Consent not found for this patient" }, { status: 404 });
    }
    if (consent.granted) {
      return Response.json({ error: "Samtycket \xE4r redan signerat och l\xE5st" }, { status: 409 });
    }
    const grantedAt = (/* @__PURE__ */ new Date()).toISOString();
    const ipAddress = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") || "").slice(0, 300);
    const signedText = consent.text || "";
    const documentVersion = consent.version || 1;
    const signatureHash = await sha256(`${consent.id}|${customer.id}|${documentVersion}|${signedText}|${grantedAt}`);
    const updated = await svc.entities.Consent.update(consentId, {
      granted: true,
      granted_at: grantedAt,
      granted_by: customer.name,
      signed_text: signedText,
      document_version: documentVersion,
      ip_address: ipAddress,
      device_info: deviceInfo,
      signature_hash: signatureHash
    });
    await recordAudit(base44, {
      event_type: "consent_sign",
      entity_type: "Consent",
      entity_id: consentId,
      description: `Samtycke (${consent.type || "ok\xE4nd"}) v${documentVersion} signerat av patient ${customer.name}`,
      metadata: {
        customer_id: customer.id,
        user_id: user.id,
        consent_type: consent.type,
        document_version: documentVersion,
        ip_address: ipAddress,
        device_info: deviceInfo,
        signature_hash: signatureHash,
        utc_timestamp: grantedAt
      }
    });
    try {
      const baseUrl = getBaseUrl(req);
      const portalUrl = baseUrl ? `${baseUrl}/portal` : "";
      let clinicName = "Klinik";
      if (customer.clinic_id) {
        const clinic = await svc.entities.Clinic.get(customer.clinic_id).catch(() => null);
        if (clinic) clinicName = clinic.name || clinicName;
      }
      await svc.integrations.Core.SendEmail({
        to: email,
        template_name: "ConsentConfirmation",
        variables: {
          customer_name: customer.name,
          consent_type: consentTypeLabels[consent.type] || consent.type || "Samtycke",
          document_version: String(documentVersion),
          signed_text: signedText,
          granted_at: new Date(grantedAt).toLocaleString("sv-SE", { timeZone: "UTC" }) + " (UTC)",
          ip_address: ipAddress || "Ej tillg\xE4nglig",
          portal_url: portalUrl,
          clinic_name: clinicName
        }
      });
    } catch {
    }
    return Response.json({ consent: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
