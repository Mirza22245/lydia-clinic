import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { recordAudit } from "../../shared/audit.ts";

// GDPR-rätt: exportera all patientdata för en specifik kund.
// Returnerar strukturerad JSON med alla relaterade poster.
// Endast personal med åtkomst till kunden kan exportera.
// Journaldata bevaras — export kopierar, raderar inget.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { customer_id } = body;
    if (!customer_id) {
      return Response.json({ error: "customer_id krävs" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!customer) return Response.json({ error: "Kund saknas" }, { status: 404 });

    // Klinikisolering
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (customer.clinic_id && userClinicId && customer.clinic_id !== userClinicId) {
      return Response.json({ error: "Åtkomst nekad" }, { status: 403 });
    }

    // Samla all patientdata
    const [
      bookings, journals, clinicalRecords, consents, healthDecls,
      forms, files, media, complications, payments, treatmentPlans,
    ] = await Promise.all([
      svc.entities.Booking.filter({ customer_id }, { limit: 1000 }),
      svc.entities.JournalEntry.filter({ customer_id }, { limit: 1000 }),
      svc.entities.ClinicalTreatmentRecord.filter({ customer_id }, { limit: 1000 }),
      svc.entities.Consent.filter({ customer_id }, { limit: 1000 }),
      svc.entities.HealthDeclaration.filter({ customer_id }, { limit: 1000 }),
      svc.entities.FormSubmission.filter({ customer_id }, { limit: 1000 }),
      svc.entities.PatientFile.filter({ customer_id }, { limit: 1000 }),
      svc.entities.TreatmentMedia.filter({ customer_id }, { limit: 1000 }),
      svc.entities.Complication.filter({ customer_id }, { limit: 1000 }),
      svc.entities.Payment.filter({ customer_id }, { limit: 1000 }),
      svc.entities.TreatmentPlan.filter({ customer_id }, { limit: 1000 }),
    ]);

    await recordAudit(base44, {
      event_type: "data_export",
      entity_type: "Customer",
      entity_id: customer_id,
      description: `Patientdata exporterad för ${customer.name} av ${user.full_name || user.email}`,
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
          treatment_plans: (treatmentPlans.items || []).length,
        },
      },
    });

    return Response.json({
      export_info: {
        exported_at: new Date().toISOString(),
        exported_by: user.full_name || user.email,
        exported_by_id: user.id,
        clinic_id: customer.clinic_id,
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
      treatment_plans: treatmentPlans.items || [],
    });
  } catch (error) {
    console.error("exportPatientData:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}