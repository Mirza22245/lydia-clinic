// Personalrutter — CRUD + RBAC
import { Router } from "express";
import { db } from "../db/client.js";
import { requireClinicAdmin } from "../auth/middleware.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const result = await db.filter("staff", req.query, { sort: "-created_date", limit: 100, clinicId: req.user.clinic_id });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", requireClinicAdmin, async (req, res) => {
  try {
    const staff = await db.create("staff", { ...req.body, clinic_id: req.user.clinic_id }, req.user.clinic_id);
    res.json(staff);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/:id", requireClinicAdmin, async (req, res) => {
  try {
    const staff = await db.update("staff", req.params.id, req.body, req.user.clinic_id);
    res.json(staff);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", requireClinicAdmin, async (req, res) => {
  try {
    await db.delete("staff", req.params.id, req.user.clinic_id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;