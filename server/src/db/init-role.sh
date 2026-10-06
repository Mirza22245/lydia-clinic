#!/bin/sh
# Skapar en icke-superuser app-role för PostgreSQL så FORCE RLS träder i kraft.
# Körs EN gång vid initial databasuppsättning (superuser-execution).
# Används INTE av appen vid drift — appen ansluter som lydia_app.
set -e
APP_PASS="${LYDIA_APP_PASSWORD:?Sätt LYDIA_APP_PASSWORD (starkt lösenord)}"
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lydia_app') THEN
    CREATE ROLE lydia_app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END \$\$;
ALTER ROLE lydia_app WITH PASSWORD :'pw';
GRANT CONNECT ON DATABASE lydia TO lydia_app;
GRANT USAGE ON SCHEMA public TO lydia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lydia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lydia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lydia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lydia_app;
SQL
echo "lydia_app roll skapad. Använd DATABASE_URL=postgresql://lydia_app:<pw>@host:5432/lydia"