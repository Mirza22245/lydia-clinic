// Kundrutter — CRUD + GDPR-export
import { Router } from "express";
import { db, pool } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";

const router = Router();

// Lista kunder
router.get("/", async (req, res) => {
  try {
    const result = await db.filter("customers", req.query, { sort: "-created_date", limit: 50, clinicId: req.user.clinic_id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hämta kund
router.get("/:id", async (req, res) => {
  try {
    const customer = await db.get("customers", req.params.id, req.user.clinic_id);
    if (!customer) return res.status(404).json({ error: "Kund saknas" });

    // Logga patientåtkomst
    await recordAudit(req, {
      event_type: "patient_access",
      entity_type: "Customer",
      entity_id: customer.id,
      description: `Personal läste patientdata: ${customer.name}`,
      metadata: { customer_id: customer.id, access_type: "read" },
    });

    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Skapa kund
router.post("/", async (req, res) => {
  try {
    const customer = await db.create("customers", { ...req.body, clinic_id: req.user.clinic_id }, req.user.clinic_id);
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Uppdatera kund
router.put("/:id", async (req, res) => {
  try {
    const customer = await db.update("customers", req.params.id, req.body, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "patient_data_changed",
      entity_type: "Customer",
      entity_id: req.params.id,
      description: `Patientdata uppdaterad: ${customer.name}`,
    });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ta bort kund (ej journal — bevaranderegler)
router.delete("/:id", async (req, res) => {
  try {
    // TODO: kontrollera att journaldata bevaras enligt patientdatalagen
    await db.delete("customers", req.params.id, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "customer_deleted",
      entity_type: "Customer",
      entity_id: req.params.id,
      description: "Kund borttagen (journal bevarad enligt patientdatalagen)",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;