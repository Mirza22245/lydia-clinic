#!/usr/bin/env node
// Importerar all data från Base44 till PostgreSQL via funktionen exportAllData
// (deploya den på Base44-appen, kör som app-admin, ta bort den efteråt).
//
//   BASE44_FUNCTIONS_URL=https://<din-app>.base44.app/functions \
//   BASE44_ADMIN_TOKEN=<admin-token från webbläsarens localStorage "base44_access_token"> \
//   DATABASE_URL=postgresql://lydia:<pw>@host:5432/lydia   (ÄGAR-rollen, inte lydia_app) \
//   npm run import
//
// Idempotent: samma id skrivs över (ON CONFLICT). Privata filer kopieras till Lydias fillagring
// och file_uri skrivs om till lydia://. Användarkonton migreras INTE (lösenordshashar finns
// inte tillgängliga): personal registrerar sig på nytt och kopplas via Staff-posten (syncStaffRole).
import { withTx, pool } from '../src/db/pool.js';
import { entities } from '../src/entities/registry.js';
import { saveFile, validateMime } from '../src/lib/storage.js';

const BASE = (process.env.BASE44_FUNCTIONS_URL || '').replace(/\/$/, '');
const TOKEN = process.env.BASE44_ADMIN_TOKEN;
if (!BASE || !TOKEN) { console.error('Sätt BASE44_FUNCTIONS_URL och BASE44_ADMIN_TOKEN'); process.exit(1); }

const BUILTIN = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample', '_signed_url']);

async function fetchPage(entity, cursor) {
  const res = await fetch(`${BASE}/exportAllData`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ entity, cursor }),
  });
  if (!res.ok) throw new Error(`${entity}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function copyFile(rec, clinicId) {
  if (!rec._signed_url) return rec.file_uri;
  const buf = Buffer.from(await (await fetch(rec._signed_url)).arrayBuffer());
  const m = validateMime(buf);
  return saveFile({ buffer: buf, clinicId: clinicId || '_global', ext: m.ext });
}

const report = {};
for (const e of entities.values()) {
  if (e.name === 'User') continue;
  report[e.name] = { exported: 0, imported: 0, failed: 0 };
  let cursor = null;
  do {
    const page = await fetchPage(e.name, cursor);
    for (const rec of page.items || []) {
      report[e.name].exported++;
      try {
        const data = {};
        for (const [k, v] of Object.entries(rec)) if (!BUILTIN.has(k)) data[k] = v;
        const clinicId = e.name === 'Clinic' ? rec.id : (rec.clinic_id || null);
        if (rec._signed_url) data.file_uri = await copyFile(rec, clinicId);
        await withTx((c) => c.query(
          `INSERT INTO ${e.table} (id, data, clinic_id, created_by_id, created_date, updated_date)
           VALUES ($1, $2::jsonb, $3, NULL, $4, $5)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, clinic_id = EXCLUDED.clinic_id, updated_date = EXCLUDED.updated_date`,
          [rec.id, JSON.stringify(data), clinicId, rec.created_date || new Date(), rec.updated_date || new Date()]
        ), { bypassRls: true });
        report[e.name].imported++;
      } catch (err) {
        report[e.name].failed++;
        console.warn(`${e.name} ${rec.id}: ${err.message}`);
      }
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
}

console.table(report);
const failed = Object.values(report).reduce((n, r) => n + r.failed, 0);
const mismatch = Object.entries(report).filter(([, r]) => r.exported !== r.imported + r.failed);
console.log(failed || mismatch.length ? 'KLAR MED FEL — granska ovan.' : 'KLAR — alla poster importerade.');
await pool.end();
process.exit(failed ? 1 : 0);