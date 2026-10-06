// Samtyckesrutter — speglar signPatientConsent + revokeConsent
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import crypto from "crypto";

const router = Router();

// Signera samtycke
router.post("/sign", async (req, res) => {
  try {
    const { customer_id, customer_name, type, text, signed_text } = req.body;
    const signedBy = req.user.full_name || req.user.email;
    const signedAt = new Date().toISOString();
    const signatureHash = crypto.createHash("sha256").update(signed_text || text || "").digest("hex");

    const consent = await db.create("consents", {
      customer_id,
      customer_name,
      type,
      version: 1,
      text,
      signed_text: signed_text || text,
      granted: true,
      granted_at: signedAt,
      granted_by: signedBy,
      signature_hash: signatureHash,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] || "",
      clinic_id: req.user.clinic_id,
    }, req.user.clinic_id);

    await recordAudit(req, {
      event_type: "consent_sign",
      entity_type: "Consent",
      entity_id: consent.id,
      description: `Samtycke (${type}) signerat för ${customer_name} av ${signedBy}`,
      metadata: { customer_id, signature_hash: signatureHash },
    });

    res.json({ consent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Återkalla samtycke
router.post("/:id/revoke", async (req, res) => {
  try {
    const consent = await db.get("consents", req.params.id, req.user.clinic_id);
    if (!consent) return res.status(404).json({ error: "Samtycke saknas" });
    if (consent.revoked_at) return res.json({ consent, message: "Redan återkallat" });

    const updated = await db.update("consents", consent.id, { revoked_at: new Date().toISOString() }, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "consent_revoked",
      entity_type: "Consent",
      entity_id: consent.id,
      description: `Samtycke (${consent.type}) återkallat för ${consent.customer_name}`,
      metadata: { customer_id: consent.customer_id, reason: req.body.reason || "" },
    });
    res.json({ consent: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;