// Behandlingsrutter — CRUD
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import { requireClinicAdmin } from "../auth/middleware.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const result = await db.filter("treatments", req.query, { sort: "-created_date", limit: 100, clinicId: req.user.clinic_id });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", async (req, res) => {
  try {
    const treatment = await db.get("treatments", req.params.id, req.user.clinic_id);
    if (!treatment) return res.status(404).json({ error: "Behandling saknas" });
    res.json(treatment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", requireClinicAdmin, async (req, res) => {
  try {
    const treatment = await db.create("treatments", { ...req.body, clinic_id: req.user.clinic_id }, req.user.clinic_id);
    await recordAudit(req, { event_type: "treatment_created", entity_type: "Treatment", entity_id: treatment.id, description: "Behandling skapad: " + treatment.name });
    res.json(treatment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", requireClinicAdmin, async (req, res) => {
  try {
    const treatment = await db.update("treatments", req.params.id, req.body, req.user.clinic_id);
    await recordAudit(req, { event_type: "treatment_changed", entity_type: "Treatment", entity_id: treatment.id, description: "Behandling uppdaterad: " + treatment.name });
    res.json(treatment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", requireClinicAdmin, async (req, res) => {
  try {
    await db.delete("treatments", req.params.id, req.user.clinic_id);
    await recordAudit(req, { event_type: "treatment_deleted", entity_type: "Treatment", entity_id: req.params.id, description: "Behandling borttagen" });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;