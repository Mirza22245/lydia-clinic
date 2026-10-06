// GDPR-export-rutter — speglar exportPatientData
import { Router } from "express";
import { db, pool } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";

const router = Router();

router.post("/patient", async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ error: "customer_id krävs" });

    const customer = await db.get("customers", customer_id, req.user.clinic_id);
    if (!customer) return res.status(404).json({ error: "Kund saknas" });

    const [bookings, journals, clinicalRecords, consents, healthDecls, forms, files, media, complications, payments, treatmentPlans] = await Promise.all([
      db.filter("bookings", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("journal_entries", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("clinical_treatment_records", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("consents", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("health_declarations", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("form_submissions", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("patient_files", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("treatment_media", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("complications", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("payments", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
      db.filter("treatment_plans", { customer_id }, { limit: 1000, clinicId: req.user.clinic_id }),
    ]);

    await recordAudit(req, {
      event_type: "data_export",
      entity_type: "Customer",
      entity_id: customer_id,
      description: "Patientdata exporterad för " + customer.name,
      metadata: { customer_id },
    });

    res.json({
      export_info: { exported_at: new Date().toISOString(), exported_by: req.user.full_name || req.user.email },
      customer,
      bookings: bookings.items,
      journals: journals.items,
      clinical_records: clinicalRecords.items,
      consents: consents.items,
      health_declarations: healthDecls.items,
      form_submissions: forms.items,
      patient_files: files.items,
      treatment_media: media.items,
      complications: complications.items,
      payments: payments.items,
      treatment_plans: treatmentPlans.items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;