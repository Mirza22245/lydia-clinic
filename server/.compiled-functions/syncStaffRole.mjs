globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/syncStaffRole/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}

// base44/functions/syncStaffRole/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").toString().toLowerCase().trim();
    const staff_role = (body?.staff_role || "").toString().trim();
    if (!email) return Response.json({ error: "E-post kr\xE4vs" }, { status: 400 });
    const allowed = ["administrat\xF6r", "behandlare", "reception", ""];
    if (!allowed.includes(staff_role)) return Response.json({ error: "Ogiltig roll" }, { status: 400 });
    const page = await base44.asServiceRole.entities.User.filter({ email });
    const target = (page.items || [])[0];
    if (!target) return Response.json({ error: "Anv\xE4ndare hittades inte \u2014 inbjuden \xE4nnu?" }, { status: 404 });
    const adminClinic = getUserClinicId(user);
    const targetClinic = getUserClinicId(target);
    if (adminClinic && targetClinic && targetClinic !== adminClinic) {
      return Response.json({ error: "Anv\xE4ndaren tillh\xF6r en annan klinik" }, { status: 403 });
    }
    if (staff_role && target.email_verified === false) {
      return Response.json({ error: "Anv\xE4ndarens e-postadress \xE4r inte verifierad \xE4nnu" }, { status: 400 });
    }
    if (staff_role) {
      await base44.asServiceRole.entities.User.update(target.id, adminClinic ? { staff_role, clinic_id: adminClinic } : { staff_role });
    } else {
      await base44.asServiceRole.entities.User.updateMany({ id: target.id }, { $unset: adminClinic ? { staff_role: "", clinic_id: "" } : { staff_role: "" } });
    }
    return Response.json({ ok: true, user_id: target.id, staff_role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
