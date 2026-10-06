#!/usr/bin/env node
// Importerar data från Base44 till PostgreSQL. Kräver en admin-token (LYDIA_ADMIN_TOKEN)
// och API-rot (LYDIA_API_BASE, t.ex. https://app.lydiaestetisk.se/api).
// Används EFTER att den portabla backend är igång och schema är skapat.
import { pool } from '../src/db/pool.js';
import { entities } from '../src/entities/registry.js';
import { signFileUri, saveFile, validateMime } from '../src/lib/storage.js';

const TOKEN = process.env.LYDIA_ADMIN_TOKEN;
const API = process.env.LYDIA_API_BASE || 'http://localhost:3001/api';
if (!TOKEN) { console.error('Sätt LYDIA_ADMIN_TOKEN'); process.exit(1); }

async function fetchAll(name) {
  const out = [];
  let cursor = null;
  do {
    const res = await fetch(`${API}/entities/${name}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `lydia_session=${TOKEN}`, 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ query: {}, opts: { limit: 500, cursor } }),
    });
    if (!res.ok) { console.warn(`${name}: ${res.status}`); return out; }
    const page = await res.json();
    out.push(...(page.items || []));
    cursor = page.next_cursor;
  } while (cursor);
  return out;
}

const report = {};
for (const e of entities.values()) {
  const rows = await fetchAll(e.name);
  report[e.name] = { source: rows.length };
  let inserted = 0;
  for (const r of rows) {
    const { id, created_date, updated_date, created_by_id, clinic_id, ...data } = r;
    // Migrera filer (file_uri) — hämta via Base44 signed URL, spara lokalt.
    for (const f of ['file_uri', 'file_url']) {
      if (data[f] && String(data[f]).startsWith('http')) {
        try {
          const buf = Buffer.from(await (await fetch(data[f])).arrayBuffer());
          const m = validateMime(buf);
          data[f] = saveFile({ buffer: buf, clinicId: clinic_id || '_global', ext: m.ext });
        } catch { /* behåll original-URL som referens */ }
      }
    }
    try {
      await pool.query(
        `INSERT INTO ${e.table} (id, data, clinic_id, created_by_id, created_date, updated_date)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, clinic_id = $3`,
        [id, JSON.stringify(data), clinic_id || null, created_by_id || null, created_date || new Date(), updated_date || new Date()]
      );
      inserted++;
    } catch (e2) { console.warn(`${e.name} rad ${id}: ${e2.message}`); }
  }
  report[e.name].imported = inserted;
}
console.log('Import klar:', JSON.stringify(report, null, 2));
console.log('NOTERA: Användarkonton kan inte migreras från Base44 (lösenordshash ej tillgänglig). Alla användare måste återställa lösenord via /forgot-password efter migrering.');
await pool.end();