// Hälsodeklarationsrutter — speglar submitHealthDeclarationConsent
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import crypto from "crypto";

const router = Router();

// Lämna hälsodeklaration
router.post("/submit", async (req, res) => {
  try {
    const { customer_id, customer_name, booking_id, treatment_id, treatment_name, answers, signed_text } = req.body;
    const submittedAt = new Date().toISOString();
    const signatureHash = crypto.createHash("sha256").update(signed_text || JSON.stringify(answers || {})).digest("hex");

    const decl = await db.create("health_declarations", {
      customer_id,
      customer_name,
      booking_id,
      treatment_id,
      treatment_name,
      answers: JSON.stringify(answers || {}),
      signed_text: signed_text || "",
      signature_hash: signatureHash,
      ip_address: req.ip,
      submitted_at: submittedAt,
      submitted_by: req.user?.full_name || "Kund",
      clinic_id: req.user?.clinic_id || req.body.clinic_id,
    }, req.user?.clinic_id || req.body.clinic_id);

    await recordAudit(req, {
      event_type: "health_declaration_submit",
      entity_type: "HealthDeclaration",
      entity_id: decl.id,
      description: `Hälsodeklaration inlämnad för ${customer_name}`,
      metadata: { customer_id, booking_id },
    });

    res.json({ declaration: decl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;