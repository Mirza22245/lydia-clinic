globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/exportPatientData/entry.ts
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

// ../base44/functions/exportPatientData/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { customer_id } = body;
    if (!customer_id) {
      return Response.json({ error: "customer_id kr\xE4vs" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!customer) return Response.json({ error: "Kund saknas" }, { status: 404 });
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (!requireClinicalStaff(user).ok || !canAccessClinic(user, customer.clinic_id)) {
      return Response.json({ error: "\xC5tkomst nekad" }, { status: 403 });
    }
    const [
      bookings,
      journals,
      clinicalRecords,
      consents,
      healthDecls,
      forms,
      files,
      media,
      complications,
      payments,
      treatmentPlans
    ] = await Promise.all([
      svc.entities.Booking.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.JournalEntry.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.ClinicalTreatmentRecord.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.Consent.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.HealthDeclaration.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.FormSubmission.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.PatientFile.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.TreatmentMedia.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.Complication.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.Payment.filter({ customer_id }, { limit: 1e3 }),
      svc.entities.TreatmentPlan.filter({ customer_id }, { limit: 1e3 })
    ]);
    await recordAudit(base44, {
      event_type: "data_export",
      entity_type: "Customer",
      entity_id: customer_id,
      description: `Patientdata exporterad f\xF6r ${customer.name} av ${user.full_name || user.email}`,
      metadata: {
        customer_id,
        customer_name: customer.name,
        record_counts: {
          bookings: (bookings.items || []).length,
          journals: (journals.items || []).length,
          clinical_records: (clinicalRecords.items || []).length,
          consents: (consents.items || []).length,
          health_declarations: (healthDecls.items || []).length,
          form_submissions: (forms.items || []).length,
          patient_files: (files.items || []).length,
          treatment_media: (media.items || []).length,
          complications: (complications.items || []).length,
          payments: (payments.items || []).length,
          treatment_plans: (treatmentPlans.items || []).length
        }
      }
    });
    return Response.json({
      export_info: {
        exported_at: (/* @__PURE__ */ new Date()).toISOString(),
        exported_by: user.full_name || user.email,
        exported_by_id: user.id,
        clinic_id: customer.clinic_id
      },
      customer,
      bookings: bookings.items || [],
      journals: journals.items || [],
      clinical_records: clinicalRecords.items || [],
      consents: consents.items || [],
      health_declarations: healthDecls.items || [],
      form_submissions: forms.items || [],
      patient_files: files.items || [],
      treatment_media: media.items || [],
      complications: complications.items || [],
      payments: payments.items || [],
      treatment_plans: treatmentPlans.items || []
    });
  } catch (error) {
    console.error("exportPatientData:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
