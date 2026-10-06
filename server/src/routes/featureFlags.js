// Feature flag-rutter — speglar updateFeatureFlag
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import { requireClinicAdmin } from "../auth/middleware.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const result = await db.filter("feature_flags", req.query, { limit: 100, clinicId: req.user.clinic_id });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", requireClinicAdmin, async (req, res) => {
  try {
    const flag = await db.update("feature_flags", req.params.id, { status: req.body.status }, req.user.clinic_id);
    await recordAudit(req, { event_type: "feature_flag_update", entity_type: "FeatureFlag", entity_id: req.params.id, description: "Feature flag uppdaterad: " + (flag.key || "") + " → " + req.body.status });
    res.json(flag);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;