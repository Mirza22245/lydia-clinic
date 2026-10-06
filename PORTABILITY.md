# Lydia — Portabilitet: status

> **Mål:** Om Base44 sägs upp ska Lydia kunna byggas och köras från GitHub + Hostinger.
> **Status: kod klar, driftsättning ej verifierad.** Se `DEPLOYMENT.md` för stegen.

## Vad som ersätter Base44

| Base44 | Portabel ersättning | Status |
|---|---|---|
| `@base44/sdk` i frontend | `src/lib/api.js` (aktiveras med `VITE_USE_BASE44=false`, alias i `vite.config.js`) | Portabelt bygge går igenom; inga Base44-adresser i bundlen |
| `@base44/vite-plugin` | Utelämnas i portabelt bygge | Klart |
| Entiteter + RLS (MongoDB) | PostgreSQL, schema genereras från `base44/entities/*.jsonc` (`server/src/db/schema.js`), `FORCE ROW LEVEL SECURITY`, app-roll utan BYPASSRLS | Skrivet, ej körd mot Postgres här |
| Entity-API | `server/src/entities/*` (klinikfilter, rollområden, skyddade fält) | Skrivet, ej körd här |
| Auth | `server/src/auth/*` (JWT-cookie, bcrypt, OTP, återställning) | Verifierat: 17 auth-tester gröna mot PostgreSQL (session.js-bugg åtgärdad) |
| Backend-funktioner (Deno) | Samma källkod, kompileras med esbuild till Node (`server/scripts/build-functions.mjs`) mot SDK-shim | Alla 31 funktioner kompilerar |
| SendEmail + MJML-mallar | Nodemailer + `mjml` (`server/src/lib/email.js`) | Skrivet; kräver SMTP |
| Filer | `server/src/lib/storage.js` (LOCAL eller S3, signerade länkar) | Skrivet, ej körd här |
| Secrets | Miljövariabler (`server/src/runtime/secrets-shim.js`) | Klart |
| Google Calendar-connector | `server/src/routes/google.js` (egen OAuth) | Kräver Google-nycklar |
| Datamigrering | `exportAllData` (Base44) + `server/scripts/import-from-base44.mjs` | **Ej körd** |

## Kvarvarande Base44-koppling i repot (ej i produktion)

- `package.json`: `@base44/sdk`, `@base44/vite-plugin` (används bara i builder-läget).
- `src/api/base44Client.js`, `src/lib/app-params.js` (ersätts via alias i portabelt bygge).
- Katalognamnet `base44/` (funktioner, entiteter, mejlmallar, delad logik) och `npm:@base44/sdk`-importer i funktionerna — omskrivs vid bygget till lokal SDK-shim.
- Engångsfunktionen `exportAllData` på Base44-sidan (tas bort efter export, finns inte i portabelt bygge).

## Acceptans

| Kriterium | Status |
|---|---|
| Portabel frontend bygger utan Base44 | Ja |
| Backend-funktioner kompilerar för Node | Ja (31/31) |
| Serverkod syntaxkontrollerad | Ja |
| Auth-flöde verifierat (registrering → OTP → session → `/me`) | Ja (17 tester) |
| Server körd mot PostgreSQL + RLS-test | **Nej** (kör `npm run test:security` på VPS) |
| Data migrerad och jämförd | **Nej** |
| Körd på Hostinger med skarp domän | **Nej** |
| Base44 kan sägas upp | **Inte än** — först när ovanstående tre är klara |