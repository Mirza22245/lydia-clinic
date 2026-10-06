#!/usr/bin/env node
// Skapar den första admin-användaren (klinikägare) i en tom databas.
// Användning: LYDIA_ADMIN_EMAIL=... LYDIA_ADMIN_PASSWORD=... npm run create-admin
// Valfritt: LYDIA_CLINIC_NAME, LYDIA_CLINIC_ID (uuid).
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/auth/password.js';
import { randomUUID } from 'node:crypto';

const email = process.env.LYDIA_ADMIN_EMAIL;
const password = process.env.LYDIA_ADMIN_PASSWORD;
const clinicName = process.env.LYDIA_CLINIC_NAME || 'Lydia Estetisk';
if (!email || !password) { console.error('Sätt LYDIA_ADMIN_EMAIL och LYDIA_ADMIN_PASSWORD'); process.exit(1); }

const clinicId = process.env.LYDIA_CLINIC_ID || randomUUID();
await pool.query(`INSERT INTO e_clinic (data, clinic_id) VALUES ($1::jsonb, $2)
  ON CONFLICT DO NOTHING`, [JSON.stringify({ name: clinicName, id: clinicId }), clinicId]);

const hash = await hashPassword(password);
const u = await pool.query(
  `INSERT INTO users (email, password_hash, role, full_name, clinic_id, staff_role, email_verified)
   VALUES ($1, $2, 'admin', $3, $4, 'administratör', true)
   ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin', clinic_id = $4, staff_role = 'administratör', email_verified = true
   RETURNING id`,
  [email.toLowerCase(), hash, process.env.LYDIA_ADMIN_NAME || 'Admin', clinicId]
);
console.log(`Admin skapad: ${email} (id ${u.rows[0].id}, klinik ${clinicId})`);
await pool.end();