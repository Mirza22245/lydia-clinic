// Delad audit-helper för portabel backend — ersätter base44/shared/audit.ts
import { pool } from "../db/client.js";

export async function recordAudit(req, evt) {
  try {
    const user = req.user;
    await pool.query(
      `INSERT INTO audit_logs (event_type, entity_type, entity_id, description, user_id, user_name, metadata, clinic_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        evt.event_type,
        evt.entity_type || "",
        evt.entity_id || "",
        evt.description || "",
        user?.id || "",
        user?.full_name || user?.email || "",
        JSON.stringify(evt.metadata || {}),
        user?.clinic_id || "",
      ]
    );
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}