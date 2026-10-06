#!/bin/sh
# Körs automatiskt EN gång när Postgres-containern initieras (docker-entrypoint-initdb.d).
# Skapar appens DML-roll lydia_app: ingen superuser, ingen BYPASSRLS, kan inte ändra schema.
# Tabellerna skapas senare av `npm run migrate` (ägar-rollen) som även ger lydia_app rättigheter.
set -e
: "${LYDIA_APP_PASSWORD:?Sätt LYDIA_APP_PASSWORD (starkt lösenord)}"

psql -v ON_ERROR_STOP=1 -v pw="$LYDIA_APP_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE lydia_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lydia_app') \gexec
SELECT format('ALTER ROLE lydia_app PASSWORD %L', :'pw') \gexec
GRANT CONNECT ON DATABASE lydia TO lydia_app;
GRANT USAGE ON SCHEMA public TO lydia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lydia_app;
SQL
echo "Rollen lydia_app skapad."