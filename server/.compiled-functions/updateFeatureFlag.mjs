globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/updateFeatureFlag/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function isPlatformAdmin(user) {
  return user?.role === "admin" && !getUserClinicId(user);
}
function canAccessClinic(user, recordClinicId) {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}

// ../base44/functions/updateFeatureFlag/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const isAdmin = user.role === "admin" || user.data?.staff_role === "administrat\xF6r";
    if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { flag_id, status } = body;
    if (!flag_id || !status) {
      return Response.json({ error: "flag_id och status kr\xE4vs" }, { status: 400 });
    }
    if (!["disabled", "test", "enabled"].includes(status)) {
      return Response.json({ error: "Ogiltig status. Anv\xE4nd: disabled, test eller enabled" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const flag = await svc.entities.FeatureFlag.get(flag_id).catch(() => null);
    if (!flag) return Response.json({ error: "Flaggan hittades inte" }, { status: 404 });
    if (!canAccessClinic(user, flag.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const prevStatus = flag.status;
    const updated = await base44.entities.FeatureFlag.update(flag_id, { status });
    try {
      await svc.entities.AuditLog.create({
        clinic_id: flag.clinic_id || "",
        event_type: "feature_flag_update",
        entity_type: "FeatureFlag",
        entity_id: flag_id,
        description: `Feature flag "${flag.key}" \xE4ndrad: ${prevStatus} \u2192 ${status}`,
        user_id: user.id,
        user_name: user.full_name || user.email || "",
        metadata: JSON.stringify({ key: flag.key, from: prevStatus, to: status })
      });
    } catch {
    }
    return Response.json({ flag: updated });
  } catch (error) {
    console.error("updateFeatureFlag error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
