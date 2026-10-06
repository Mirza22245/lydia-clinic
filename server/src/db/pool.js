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

// Kör ett block inom en transaktion. Sätter app.clinic_id / app.bypass_rls
// per request så PostgreSQL FORCE RLS isolerar per klinik (defense-in-depth).
export async function withTx(fn, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (opts.bypassRls) {
      await client.query("SET LOCAL app.bypass_rls = '1'");
    } else if (opts.clinicId) {
      await client.query(`SET LOCAL app.clinic_id = '${opts.clinicId.replace(/'/g, "''")}'`);
    } else {
      await client.query("SET LOCAL app.clinic_id = ''");
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