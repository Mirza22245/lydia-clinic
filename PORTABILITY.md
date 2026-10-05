# Lydia — Portabilitets- och migreringsarkitektur

> **Acceptanskriterium:** *Om Base44-prenumerationen sägs upp ska Lydia fortfarande kunna driftsätt och köras från GitHub + egen hosting/infrastruktur (Hostinger).*
>
> **Status: ÄR INTE UPPFYLLT ännu.** Detta dokument är den konkreta planen för att uppfylla det. Se [Acceptans-status](#acceptans-status) i slutet.

Lydia byggs i Base44 som utvecklings-/byggmiljö. Produktion ska vara oberoende: GitHub → Hostinger → Lydia frontend/backend → PostgreSQL → externa betal-/e-post-/SMS-tjänster. WordPress (`https://lydiaestetisk.se/`) förblir oförändrad och länkar till Lydias bokning på `https://app.lydiaestetisk.se/` (ingen DNS-ändring än).

---

## 1. Beroendeaudit — varje Base44-beroende idag

| # | Beroende | Var det används | Portabel ersättning | Migreringsväg | Status |
|---|----------|----------------|---------------------|---------------|--------|
| 1 | **`@base44/sdk` (frontend)** | `src/api/base44Client.js` + ~38 filer i `src/` — alla `base44.entities.*`, `base44.auth.*` | Egen API-klient mot egen backend (fetch till `/api/*`) | Bygg ett tunt datalager (`src/lib/api.js`) som i dev anropar Base44 och i prod anropar egen backend; byt ut entitetsanrop stegvis | Öppen |
| 2 | **Databas — Base44 MongoDB + entiteter + RLS** | 15 entiteter i `base44/entities/*.jsonc`; RLS-regler per entitet | **PostgreSQL** på Hostinger + app-lager tenant-filter (`clinic_id`) och/eller Postgres RLS | Mappa varje `.jsonc` till en SQL-tabell; RLS-regler → Postgres RLS-policies eller强制 `WHERE clinic_id = $1` i datalager; skriv migreringsskript (export från Base44 → import till Postgres) | Öppen |
| 3 | **Autentisering — Base44 Auth** | `base44.auth.{me,loginViaEmailPassword,register,verifyOtp,resendOtp,resetPasswordRequest,resetPassword,loginWithProvider,isAuthenticated,logout,redirectToLogin,setToken}` i Login/Register/ForgotPassword/ResetPassword/AuthContext | Standard session/JWT-auth i egen backend (Node + Postgres), eller extern IdP (Auth0/Clerk/Supabase Auth) | Behåll flödena (OTP, reset, Google) men byt SDK-anrop mot egna endpoints; sessionscookie/JWT istället för Base44-token | Öppen |
| 4 | **Backend-funktioner — Base44 Deno-runtime** | 16 funktioner i `base44/functions/*/entry.ts`; använder `npm:@base44/sdk`, `base44:runtime` (secrets), `Deno.env`, global `Response` | Egen Node/Express (eller Bun/Deno standalone) backend på Hostinger | Flytta logiken till `server/src/routes/*`; `secrets.get()` → `process.env`; `Deno.env` → `process.env`; `Response.json` → Express-svar; Stripe-`fetch` är redan portabel | Öppen |
| 5 | **E-post — `integrations.Core.SendEmail`** | 4 backend-funktioner (sendBookingConfirmation, sendReceiptEmail, signPatientConsent, signJournalEntry) + mallar i `base44/emails/*.html` | SMTP / Resend / SendGrid / Postmark via egen backend | Mallarna är MJML/HTML (portabla); byt `SendEmail(...)` mot ett `sendEmail()`-wrapper som anropar vald provider; variabler (`{{first_name}}` etc.) oförändrade | Öppen |
| 6 | **Fillagring — `UploadPrivateFile` + `CreateFileSignedUrl`** | `src/components/PatientFilesPanel.jsx` (klient) + `PatientFile`-entitet | S3-kompatibel objektlagring (Hostinger Object Storage / AWS S3 / MinIO) med presigned URLs | Klient laddar upp till egen backend → S3; spara `s3://`-URI i `PatientFile.file_uri`; presigned URL istället för `CreateFileSignedUrl` | Öppen |
| 7 | **Hemligheter — Base44 Secrets** | `secrets.get("STRIPE_SECRET_KEY"|"STRIPE_WEBHOOK_SECRET")` i funktioner; Base44 Secrets-dashboard | Miljövariabler på Hostinger (`.env` / panel) | `secrets.get(X)` → `process.env.X`; samma namn behålls; rotera vid migrering | Öppen |
| 8 | **Vite-plugin — `@base44/vite-plugin`** | `vite.config.js` (hmrNotifier, navigationNotifier, analyticsTracker, visualEditAgent) | Standard Vite + React (plugin bort) | Plugin är byggtids-stöd för preview; tas bort i prod-build; ingen runtime-effekt | Öppen (låg risk) |
| 9 | **Betalning — Stripe via Base44-integration** | `createPaymentIntent` + `stripeWebhook` använder standard `fetch` till `api.stripe.com` (portabel); webhook-URL pekar på `base44.app/functions/*` | Stripe direkt mot egen backend | Endast runtime-omslag är Base44-specifikt; Stripe-logiken är redan portabel; peka om webhook till `https://app.lydiaestetisk.se/api/webhooks/stripe` | Öppen (logik portabel) |
| 10 | **Schemalagda jobb / arbetsflöden** | `base44/workflows/` (tomt idag) | node-cron / systemd-timer / Hostinger cron + egen backend | Inga existerande jobb att migrera; framtida påminnelser byggs direkt i egen backend | N/A (inget att migrera) |
| 11 | **Analytics — `base44.analytics.track`** | Ej påträffat i src (SDK-metod finns) | Ta bort eller byt mot Posthog/Plausible | Borttagning vid datalager-byte | Öppen (obefintlig/användning minimal) |
| 12 | **Realtids-prenumerationer — `base44.entities.*.subscribe`** | Ej påträffat i src (SDK-metod finns) | WebSocket / Postgres LISTEN-notify / Soketi | Bygg vid behov; inget att migrera nu | N/A |
| 13 | **Push-notiser — `SendPushNotification`** | Ej påträffat i funktioner | FCM/APNs via egen backend | Bygg vid behov | N/A |
| 14 | **LLM-bilder/tal/video — `InvokeLLM/GenerateImage/GenerateSpeech/GenerateVideo/TranscribeAudio/ExtractDataFromUploadedFile`** | Ej påträffat i funktioner eller src (förutom UploadPrivateFile/CreateFileSignedUrl) | Direkt mot OpenAI/Anthropic/Google/Whisper vid behov | Inget att migrera nu | N/A |

### Sammanfattning av kritiska beroenden (måste lösas för uppsägning)
De enda som faktiskt blockerar oberoende drift idag är **#1–#7**: frontend-SDK, databas, auth, backend-runtime, e-post, fillagring, hemligheter. #8 (Vite-plugin) är trivialt. #9 (Stripe) är redan portabel i logiken — bara runtime-omlaget och webhook-URL byts. #10–#14 finns inte i användning ännu.

---

## 2. Målarkitektur

```
GitHub (källkod, sanningens källa)
  │
  ├─ src/                     (React-frontend, portabel Vite-build)
  └─ server/                  (NY: Node/Express-backend, portabel)
        ├─ src/routes/        (ersätter base44/functions)
        ├─ src/db/            (PostgreSQL-schema + datalager med clinic_id-filter)
        ├─ src/auth/          (session/JWT, OTP, reset, Google)
        ├─ src/services/      (email, storage, stripe)
        └─ src/jobs/           (cron-påminnelser)

Driftsättning:
  Hostinger (VPS eller Node-hosting)
    ├─ Lydia frontend  (byggd statisk bundle, serverad av Node/CDN)
    ├─ Lydia backend  (Node-process)
    ├─ PostgreSQL      (Hostinger DB eller extern)
    └─ .env            (STRIPE_*, SMTP_*, S3_*, JWT_SECRET, ...)

WordPress (oförändrad): https://lydiaestetisk.se/
  └─ länkar till bokning: https://app.lydiaestetisk.se/book
```

**Inga DNS-ändringar nu.** `app.lydiaestetisk.se` planeras som subdomän (A/CNAME till Hostinger) när produktion aktiveras — görs separat, inte i detta steg.

---

## 3. Migreringsfaser

### Fas 0 — Förberedelse (nuvarande)
- Behåll Base44 som dev/build under migreringen.
- Introducera ett **datalager-gränssnitt** i frontend (`src/lib/api.js`) så att entitets-/auth-anrop går genom ett tunt lager, inte direkt till `@base44/sdk`. Det gör byte mot egen backend mekaniskt, inte en omskrivning av 38 filer.

### Fas 1 — Backend-port (server/)
- Skapa `server/` med Express-rutter som speglar de 16 backend-funktionerna.
- Portera Stripe-logiken 1:1 (redan `fetch`-baserad); `secrets.get` → `process.env`.
- Portera `base44/shared/*` (bookingRequirements, audit) oförändrat — det är ren TS utan Base44-beroende.

### Fas 2 — Databas till PostgreSQL
- Mappa 15 entiteter till SQL-tabeller; bevara alla fält och index.
- Implementera tenant-isolering: antingen Postgres RLS-policies per `clinic_id` eller强制 `WHERE clinic_id = $1` i datalagret (rekommenderas för enkelhet + säkerhet).
- Skriv engångs-migreringsskript: export från Base44 → JSON → import till Postgres.

### Fas 3 — Auth
- Byt `base44.auth.*` mot egna endpoints: `/auth/login`, `/auth/register`, `/auth/otp`, `/auth/reset`, `/auth/google`.
- Session via httpOnly-cookie/JWT i Postgres-backed `users`-tabell.
- Behåll alla flöden (OTP, reset, Google) och alla auth-sidor — bara SDK-anropen byts i datalagret.

### Fas 4 — E-post, fillagring, hemligheter
- E-post: `sendEmail()`-wrapper mot Resend/SMTP; mallar flyttas till `server/emails/` oförändrade.
- Filer: S3-kompatibel lagring + presigned URLs; `PatientFile.file_uri` → S3-URI.
- Hemligheter: `.env` på Hostinger.

### Fas 5 — Stripe webhook + domän
- Peka om Stripe webhook till `https://app.lydiaestetisk.se/api/webhooks/stripe`.
- Konfigurera `app.lydiaestetisk.se` → Hostinger (subdomän, separat steg).
- WordPress länkar bokningsknappen till `https://app.lydiaestetisk.se/book`.

### Fas 6 — Verifiering av uppsägningsbarhet
- Bygg och kör Lydia uteslutande från `GitHub + Hostinger + Postgres + externa tjänster`, utan Base44 SDK importerad.
- Om bygget och alla flöden (bokning, betalning, journal, auth, e-post, filer) fungerar → kriteriet uppfyllt.

---

## 4. Acceptans-status

| Kriterium | Uppfyllt? |
|-----------|-----------|
| Frontend bygger utan `@base44/sdk` | ❌ Nej |
| Backend körs på Hostinger utan Base44-runtime | ❌ Nej |
| Databas är PostgreSQL (inte Base44 MongoDB) | ❌ Nej |
| Auth är oberoende av Base44 | ❌ Nej |
| E-post/filer/hemligheter använder portabla tjänster | ❌ Nej |
| Stripe webhook pekar på egen host | ❌ Nej |
| WordPress oförändrad, länkar till `app.`-subdomän | ⏳ Plan, ingen DNS ännu |
| GitHub är komplett källkod + sanningens källa | ⏳ Delvis (frontend + funktioner + entiteter finns; `server/` saknas) |

**Slutsats:** Migreringsarkitekturen är **inte komplett**. Ovanstående fasplan är den concreta vägen dit. Nästa steg är Fas 0 (datalager-gränssnitt) + Fas 1 (portabel `server/`), som kan påbörjas utan att störa nuvarande Base44-drift.