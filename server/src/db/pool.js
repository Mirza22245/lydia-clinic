import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  ssl: config.isProd && /sslmode=/i.test(config.databaseUrl) ? { rejectUnauthorized: true } : false,
});

// Kör ett block i en transaktion med RLS-kontext. ALLA datafrågor ska gå hit:
// FORCE RLS-policyerna läser app.clinic_id / app.bypass_rls, så en fråga utan
// kontext returnerar inga rader och nekas vid skrivning (fail-closed).
export async function withTx(fn, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (opts.bypassRls) {
      await client.query("SELECT set_config('app.bypass_rls', '1', true)");
    } else {
      await client.query("SELECT set_config('app.clinic_id', $1, true)", [opts.clinicId || '']);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function query(text, params) {
  return pool.query(text, params);
}