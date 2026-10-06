// Audit-rutter — speglar recordAuditEvent + logPatientAccess
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import { requireClinicAdmin } from "../auth/middleware.js";

const router = Router();

// Lista audit-logg (endast admin)
router.get("/", requireClinicAdmin, async (req, res) => {
  try {
    const result = await db.filter("audit_logs", req.query, { sort: "-created_date", limit: 100, clinicId: req.user.clinic_id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logga patientåtkomst (läsning)
router.post("/patient-access", async (req, res) => {
  try {
    await recordAudit(req, {
      event_type: "patient_access",
      entity_type: req.body.entity_type || "Customer",
      entity_id: req.body.entity_id || req.body.customer_id,
      description: req.body.description || `Personal läste patientdata: ${req.body.customer_name || ""}`,
      metadata: { customer_id: req.body.customer_id, access_type: req.body.access_type || "read" },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logga generell audit-händelse
router.post("/", async (req, res) => {
  try {
    await recordAudit(req, {
      event_type: req.body.event_type,
      entity_type: req.body.entity_type,
      entity_id: req.body.entity_id,
      description: req.body.description,
      metadata: req.body.metadata,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;