import { pool } from '../db/pool.js';

// Server-side audit-logg. Används av auth-rutter och gateway för händelser
// som inte går via en backend-funktion (t.ex. inloggning, filåtkomst).
export async function audit(evt, user = null) {
  try {
    await pool.query(
      `INSERT INTO e_audit_log (data, clinic_id, created_by_id) VALUES ($1::jsonb, $2, $3)`,
      [JSON.stringify({
        event_type: evt.event_type,
        entity_type: evt.entity_type || '',
        entity_id: evt.entity_id || '',
        description: (evt.description || '').slice(0, 500),
        user_id: user?.id || evt.user_id || '',
        user_name: user?.full_name || user?.email || evt.user_name || '',
        metadata: typeof evt.metadata === 'string' ? evt.metadata.slice(0, 4000) : JSON.stringify(evt.metadata || {}).slice(0, 4000),
        clinic_id: evt.clinic_id || user?.clinic_id || '',
      }), evt.clinic_id || user?.clinic_id || null, user?.id || null]
    );
  } catch (e) { console.error('audit failed:', e.message); }
}