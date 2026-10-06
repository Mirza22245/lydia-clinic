globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/signJournalEntry/entry.ts
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

// ../base44/functions/signJournalEntry/entry.ts
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const journalId = body.journal_id;
    if (!journalId) return Response.json({ error: "journal_id required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const journal = await svc.entities.JournalEntry.get(journalId);
    if (!journal) return Response.json({ error: "Journal not found" }, { status: 404 });
    if (!requireClinicalStaff(user).ok || !canAccessClinic(user, journal.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (journal.is_signed) {
      return Response.json({ journal });
    }
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (journal.clinic_id && userClinicId && journal.clinic_id !== userClinicId) {
      return Response.json({ error: "Journal belongs to another clinic" }, { status: 403 });
    }
    const signedBy = user?.full_name || user?.email || "Ok\xE4nd";
    const signedAt = (/* @__PURE__ */ new Date()).toISOString();
    const content = [
      journal.id,
      journal.customer_id || "",
      journal.customer_name || "",
      journal.treatment_name || "",
      journal.provider || "",
      journal.entry_date || "",
      journal.notes || "",
      journal.observations || "",
      journal.assessment || "",
      journal.treatment_performed || "",
      journal.aftercare || "",
      journal.recommendations || "",
      String(journal.version || 1),
      signedAt
    ].join("|");
    const signatureHash = await sha256(content);
    const updated = await svc.entities.JournalEntry.update(journalId, {
      is_signed: true,
      signed_at: signedAt,
      signed_by: signedBy,
      signature_hash: signatureHash
    });
    await recordAudit(base44, {
      event_type: "journal_sign",
      entity_type: "JournalEntry",
      entity_id: journalId,
      description: `Journal f\xF6r ${journal.customer_name} signerad och l\xE5st av ${signedBy}`,
      metadata: {
        customer_id: journal.customer_id,
        user_id: user.id,
        version: journal.version || 1,
        signature_hash: signatureHash,
        utc_timestamp: signedAt
      }
    });
    return Response.json({ journal: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
