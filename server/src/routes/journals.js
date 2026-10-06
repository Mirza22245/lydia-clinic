// Journalrutter — speglar signJournalEntry + journal CRUD
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import crypto from "crypto";

const router = Router();

// Skapa journalanteckning
router.post("/", async (req, res) => {
  try {
    const journal = await db.create("journal_entries", {
      ...req.body,
      is_signed: false,
      version: 1,
      clinic_id: req.user.clinic_id,
    }, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "journal_create",
      entity_type: "JournalEntry",
      entity_id: journal.id,
      description: `Journal skapad för ${req.body.customer_name}`,
    });
    res.json({ journal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Signera journal (lås)
router.post("/:id/sign", async (req, res) => {
  try {
    const journal = await db.get("journal_entries", req.params.id, req.user.clinic_id);
    if (!journal) return res.status(404).json({ error: "Journal saknas" });
    if (journal.is_signed) return res.json({ journal });

    const signedBy = req.user.full_name || req.user.email;
    const signedAt = new Date().toISOString();

    // SHA-256 content hash
    const content = [journal.id, journal.customer_id, journal.customer_name, journal.treatment_name, journal.provider, journal.entry_date, journal.notes, journal.observations, journal.assessment, journal.treatment_performed, journal.aftercare, journal.recommendations, String(journal.version), signedAt].join("|");
    const signatureHash = crypto.createHash("sha256").update(content).digest("hex");

    const updated = await db.update("journal_entries", journal.id, {
      is_signed: true,
      signed_at: signedAt,
      signed_by: signedBy,
      signature_hash: signatureHash,
    }, req.user.clinic_id);

    await recordAudit(req, {
      event_type: "journal_sign",
      entity_type: "JournalEntry",
      entity_id: journal.id,
      description: `Journal för ${journal.customer_name} signerad av ${signedBy}`,
      metadata: { signature_hash: signatureHash },
    });

    res.json({ journal: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rättelse — skapa ny version (bevarar original)
router.post("/:id/amend", async (req, res) => {
  try {
    const original = await db.get("journal_entries", req.params.id, req.user.clinic_id);
    if (!original) return res.status(404).json({ error: "Journal saknas" });

    const amended = await db.create("journal_entries", {
      ...req.body,
      customer_id: original.customer_id,
      customer_name: original.customer_name,
      treatment_id: original.treatment_id,
      treatment_name: original.treatment_name,
      booking_id: original.booking_id,
      version: (original.version || 1) + 1,
      parent_id: original.id,
      is_signed: false,
      clinic_id: req.user.clinic_id,
    }, req.user.clinic_id);

    await recordAudit(req, {
      event_type: "journal_amend",
      entity_type: "JournalEntry",
      entity_id: amended.id,
      description: `Journal rättad (ny version) för ${original.customer_name}`,
      metadata: { parent_id: original.id, version: amended.version },
    });

    res.json({ journal: amended });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;