#!/usr/bin/env node
// Skapar klinik + första administratören i en tom databas.
//   LYDIA_ADMIN_EMAIL=... LYDIA_ADMIN_PASSWORD=... npm run create-admin
// Valfritt: LYDIA_CLINIC_NAME, LYDIA_ADMIN_NAME, LYDIA_CLINIC_ID (uuid).
import { randomUUID } from 'node:crypto';
import { pool, withTx } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';

const email = process.env.LYDIA_ADMIN_EMAIL;
const password = process.env.LYDIA_ADMIN_PASSWORD;
if (!email || !password) { console.error('Sätt LYDIA_ADMIN_EMAIL och LYDIA_ADMIN_PASSWORD'); process.exit(1); }
if (password.length < 12) { console.error('Lösenordet måste vara minst 12 tecken.'); process.exit(1); }

const clinicId = process.env.LYDIA_CLINIC_ID || randomUUID();
const clinicName = process.env.LYDIA_CLINIC_NAME || 'Lydia Estetisk';

// Kliniken får id = clinic_id så att RLS-policyn (clinic_id = app.clinic_id) matchar den egna raden.
await withTx(async (c) => {
  await c.query(
    `INSERT INTO e_clinic (id, data, clinic_id) VALUES ($1, $2::jsonb, $1::text)
     ON CONFLICT (id) DO UPDATE SET data = e_clinic.data || EXCLUDED.data`,
    [clinicId, JSON.stringify({ name: clinicName, clinic_id: clinicId })]
  );
}, { bypassRls: true });

const hash = await hashPassword(password);
const u = await pool.query(
  `INSERT INTO users (email, password_hash, role, full_name, clinic_id, staff_role, email_verified)
   VALUES ($1, $2, 'admin', $3, $4, 'administratör', true)
   ON CONFLICT (email) DO UPDATE
     SET password_hash = $2, role = 'admin', clinic_id = $4, staff_role = 'administratör', email_verified = true
   RETURNING id`,
  [email.toLowerCase(), hash, process.env.LYDIA_ADMIN_NAME || 'Admin', clinicId]
);
console.log(`Klar. Admin: ${email} (id ${u.rows[0].id}) i klinik ${clinicId}`);
await pool.end();