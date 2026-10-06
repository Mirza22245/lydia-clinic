import { entities } from '../entities/registry.js';

// Skapar alla tabeller, index och FORCE RLS-policyer utifrån entitets-
// definitionerna i base44/entities/. Idempotent. Körs via `npm run migrate` med
// ägar-/admin-rollen (MIGRATE_DATABASE_URL) — INTE av appens DML-roll lydia_app.
export async function ensureSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      full_name TEXT,
      clinic_id TEXT,
      staff_role TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      token_version INT NOT NULL DEFAULT 0,
      failed_login INT NOT NULL DEFAULT 0,
      lockout_until TIMESTAMPTZ,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS integration_tokens (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT,
      expires_at TIMESTAMPTZ,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider)
    );
  `);

  const clinicMatch = `clinic_id IS NOT NULL AND clinic_id <> '' AND clinic_id = current_setting('app.clinic_id', true)`;
  for (const e of entities.values()) {
    const t = e.table;
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${t} (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        clinic_id TEXT,
        created_by_id UUID,
        created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ${t}_clinic_idx ON ${t} (clinic_id);
      CREATE INDEX IF NOT EXISTS ${t}_created_idx ON ${t} (created_date DESC);
      CREATE INDEX IF NOT EXISTS ${t}_data_gin ON ${t} USING gin (data);
      ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS ${t}_clinic ON ${t};
      CREATE POLICY ${t}_clinic ON ${t}
        USING (${clinicMatch})
        WITH CHECK (${clinicMatch});
      DROP POLICY IF EXISTS ${t}_bypass ON ${t};
      CREATE POLICY ${t}_bypass ON ${t}
        USING (current_setting('app.bypass_rls', true) = '1')
        WITH CHECK (current_setting('app.bypass_rls', true) = '1');
    `);
  }

  // Appens DML-roll (om den finns) får läsa/skriva men aldrig ändra schema/policyer.
  await db.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lydia_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lydia_app;
      END IF;
    END $$;
  `);
  console.log(`[schema] ${entities.size} entitetstabeller + auth-tabeller klara.`);
}