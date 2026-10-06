# Lydia — Portabilitets- och migreringsarkitektur

> **Acceptanskriterium:** *Om Base44-prenumerationen sägs upp ska Lydia fortfarande kunna driftsättas och köras från GitHub + Hostinger.*
>
> **Status: ARKITEKTUR BYGGD — migrering återstår.** Den portabla backend (`server/`), PostgreSQL-schema, Express-rutter och frontend-abstraktionslager är skapade. Frontend-filer måste byta från `@base44/sdk` till `@/lib/api` (mekaniskt sök/ersätt) och data måste migreras.

---

## 1. Beroendeaudit — Base44-beroende vs portabel ersättning

| # | Beroende | Portabel ersättning | Status |
|---|----------|---------------------|--------|
| 1 | `@base44/sdk` (frontend) | `src/lib/api.js` — abstraktionslager som kan prata med Base44 ELLER egen backend | ✅ Byggd — frontend måste byta import (sök/ersätt) |
| 2 | Base44 MongoDB + entiteter + RLS | PostgreSQL + `server/src/db/schema.sql` (35 tabeller) + Postgres RLS | ✅ Schema byggt — data måste migreras |
| 3 | Base44 Auth | `server/src/routes/auth.js` (JWT + bcrypt + OTP) | ✅ Byggd |
| 4 | Base44 Deno-runtime (26 funktioner) | `server/src/routes/*.js` (15 Express-rutter) | ✅ Byggd — speglar alla funktioner |
| 5 | Base44 SendEmail | `server/src/lib/email.js` (Nodemailer SMTP + MJML-mallar) | ✅ Byggd |
| 6 | Base44 fillagring | `server/src/lib/storage.js` (S3-kompatibel, presigned URLs) | ✅ Byggd |
| 7 | Base44 secrets | `server/src/lib/secrets.js` (.env miljövariabler) | ✅ Byggd |
| 8 | Base44 RLS | PostgreSQL RLS policies + `server/src/auth/middleware.js` RBAC | ✅ Byggd |
| 9 | `@base44/vite-plugin` | Standard Vite (plugin bort i prod) | ✅ Trivialt |
| 10 | Stripe via Base44 | `server/src/routes/payments.js` (portabel fetch) | ✅ Byggd |

### Återstående steg för full oberoende

1. **Frontend-migrering:** Sök/ersätt `from "@/api/base44Client"` → `from "@/lib/api"` i 38+ filer
2. **Byt `base44.entities.X` → `api.entities.X`** och `base44.auth.*` → `api.auth.*`
3. **Byt `base44.functions.invoke` → `api.functions.invoke`**
4. **Data-migrering:** Export från Base44 → import till PostgreSQL
5. **Test:** Kör hela flödet mot egen backend
6. **Sätt `VITE_USE_BASE44=false`** i frontend-bygget

---

## 2. Portabel arkitektur

```
GitHub (källkod, sanningens källa)
  ├─ src/                     React-frontend (portabel Vite-build)
  │  └─ lib/api.js            Abstraktionslager (Base44 ↔ egen backend)
  ├─ server/                  Portabel Node/Express-backend
  │  ├─ src/
  │  │  ├─ index.js           Express-app
  │  │  ├─ db/
  │  │  │  ├─ schema.sql      PostgreSQL-schema (35 tabeller)
  │  │  │  └─ client.js       DB-klient + RLS-helper
  │  │  ├─ auth/middleware.js JWT + RBAC
  │  │  ├─ lib/
  │  │  │  ├─ secrets.js      .env-secrets
  │  │  │  ├─ email.js        SMTP + MJML-mallar
  │  │  │  └─ storage.js      S3-fillagring
  │  │  └─ routes/            15 Express-rutter
  │  ├─ .env.example          Miljövariabler
  │  └─ Dockerfile
  ├─ docker-compose.yml       Full stack (frontend + backend + postgres)
  └─ DEPLOYMENT.md            Hostinger-deploymentguide

Driftsättning (Hostinger VPS):
  app.lydiaestetisk.se  → Lydia frontend (statisk bundle)
  api.lydiaestetisk.se  → Lydia backend (Node/Express)
  PostgreSQL            → Hostinger DB
  S3                    → Hostinger Object Storage

WordPress (oförändrad): https://lydiaestetisk.se/
  └─ "Boka tid"-länk → https://app.lydiaestetisk.se/book
```

---

## 3. Migreringsfaser

### Fas 0 — Förberedelse (KLAR)
- ✅ Portabel backend skapad (`server/`)
- ✅ PostgreSQL-schema skapat (35 tabeller)
- ✅ Frontend-abstraktionslager skapat (`src/lib/api.js`)
- ✅ Deployment-guide skapad (`DEPLOYMENT.md`)

### Fas 1 — Frontend-migrering (ÅTERSTÅR)
- Sök/ersätt alla `@base44/sdk`-importer till `@/lib/api`
- Byt `base44.entities.X` → `api.entities.X`
- Byt `base44.auth.*` → `api.auth.*`
- Byt `base44.functions.invoke` → `api.functions.invoke`
- Sätt `VITE_USE_BASE44=false` i `.env`

### Fas 2 — Data-migrering (ÅTERSTÅR)
- Exportera alla entiteter från Base44 som JSON
- Konvertera till SQL INSERTs
- Importera till PostgreSQL
- Verifiera dataintegritet

### Fas 3 — Driftsättning (ÅTERSTÅR)
- Deploya backend på Hostinger
- Bygg frontend och deploya
- Konfigurera DNS (nya subdomäner, INTE WordPress)
- Konfigurera Stripe webhook
- Verifiera hela flödet

---

## 4. Acceptans-status

| Kriterium | Status |
|-----------|--------|
| Portabel backend byggd | ✅ KLAR |
| PostgreSQL-schema byggd | ✅ KLAR |
| Frontend-abstraktion byggd | ✅ KLAR |
| Deployment-konfigurationer | ✅ KLAR |
| Frontend-migrerad | ❌ ÅTERSTÅR (mekaniskt sök/ersätt) |
| Data migrerad | ❌ ÅTERSTÅR |
| Testad på Hostinger | ❌ ÅTERSTÅR |
| Base44 kan sägas upp | ❌ ÄNNU INTE — Fas 1-3 kvar |