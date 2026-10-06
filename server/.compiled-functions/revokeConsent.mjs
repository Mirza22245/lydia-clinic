globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/revokeConsent/entry.ts
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
function isClinicalStaff(user) {
  const r = getStaffRole(user);
  return isPlatformAdmin(user) || r === "administrat\xF6r" || r === "behandlare";
}
function canAccessClinic(user, recordClinicId) {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}
function requireClinicalStaff(user) {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isClinicalStaff(user)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

// ../base44/functions/revokeConsent/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { consent_id, reason } = body;
    if (!consent_id) {
      return Response.json({ error: "consent_id kr\xE4vs" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const consent = await svc.entities.Consent.get(consent_id).catch(() => null);
    if (!consent) return Response.json({ error: "Samtycke saknas" }, { status: 404 });
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (!requireClinicalStaff(user).ok || !canAccessClinic(user, consent.clinic_id)) {
      return Response.json({ error: "\xC5tkomst nekad" }, { status: 403 });
    }
    if (consent.revoked_at) {
      return Response.json({ consent, message: "Samtycke redan \xE5terkallat" });
    }
    const updated = await svc.entities.Consent.update(consent_id, {
      revoked_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await recordAudit(base44, {
      event_type: "consent_revoked",
      entity_type: "Consent",
      entity_id: consent_id,
      description: `Samtycke (${consent.type}) \xE5terkallat f\xF6r ${consent.customer_name} av ${user.full_name || user.email}`,
      metadata: {
        customer_id: consent.customer_id,
        consent_type: consent.type,
        reason: reason || "",
        revoked_by: user.id
      }
    });
    return Response.json({ consent: updated });
  } catch (error) {
    console.error("revokeConsent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
