#!/usr/bin/env node
// Skapar/uppdaterar databasschemat (tabeller, index, FORCE RLS-policyer).
// Körs med ägar-/admin-rollen — aldrig med appens DML-roll lydia_app.
//   MIGRATE_DATABASE_URL=postgresql://lydia:<pw>@host:5432/lydia npm run migrate
import pg from 'pg';
import { ensureSchema } from '../src/db/schema.js';

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Sätt MIGRATE_DATABASE_URL (ägar-/admin-roll, inte lydia_app).');
  process.exit(1);
}
const db = new pg.Pool({ connectionString: url, max: 1 });
try {
  await ensureSchema(db);

  // Bootstrap the public clinic record so a fresh Hostinger/Supabase deployment
  // can render the booking page before an admin has seeded clinic data.
  await db.query(`
    INSERT INTO e_clinic (id, data, clinic_id)
    VALUES (
      'lydia-estetisk',
      '{"name":"Lydia Estetisk","brand_name":"Lydia Estetisk","clinic_id":"lydia-estetisk","description":"","opening_hours":""}'::jsonb,
      'lydia-estetisk'
    )
    ON CONFLICT (id) DO NOTHING
  `);
} finally {
  await db.end();
}