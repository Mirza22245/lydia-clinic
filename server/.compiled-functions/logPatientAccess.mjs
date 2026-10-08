globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/logPatientAccess/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const isStaff = user.role === "admin" || !!user.data?.staff_role;
    if (!isStaff) return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { customer_id, customer_name, access_type, entity_type, entity_id, description } = body;
    if (!customer_id) return Response.json({ error: "customer_id kr\xE4vs" }, { status: 400 });
    const svc = base44.asServiceRole;
    let clinicId = "";
    if (user.data?.clinic_id) {
      clinicId = user.data.clinic_id;
    } else {
      const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
      clinicId = customer?.clinic_id || "";
    }
    await svc.entities.AuditLog.create({
      clinic_id: clinicId,
      event_type: "patient_access",
      entity_type: entity_type || "Customer",
      entity_id: entity_id || customer_id,
      description: description || `Personal l\xE4ste patientdata: ${customer_name || customer_id}`,
      user_id: user.id,
      user_name: user.full_name || user.email || "",
      metadata: JSON.stringify({
        customer_id,
        customer_name: customer_name || "",
        access_type: access_type || "read",
        entity_type: entity_type || "Customer"
      })
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("logPatientAccess error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
