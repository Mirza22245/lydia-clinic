# Lydia — driftsättning på Hostinger

> Lydia kör som en fristående Node/Express-app med React/Vite och PostgreSQL. Produktionen använder inte Base44 som runtime.

## Produktionsarkitektur

```
app.lydiaestetisk.se
        │
        └── Hostingers reverse proxy
                │
                └── Node 20 → server/src/index.js
                         ├── /api/*
                         └── dist/*
                              │
                              └── PostgreSQL
```

Frontend och API använder samma origin. Webbläsaren anropar `/api`, och sessionscookien är HttpOnly.

## Hostinger

- Framework: **Other**
- Branch: **main**
- Node: **20.x**
- Root: `./`
- Build command: `npm run build`
- Entry point: `server/src/index.js`
- Build output: lämnas tomt
- Start command: `npm start` / Hostinger använder entry point ovan
- Port: Hostingers `PORT` används automatiskt; fallback är `3000`
- Servern binder på `0.0.0.0` för reverse proxy

## Miljövariabler

Följande måste finnas i Hostinger:

| Variabel | Krävs | Användning |
|---|---:|---|
| `DATABASE_URL` | Ja | PostgreSQL |
| `JWT_SECRET` | Ja | Sessionssignering |
| `FILE_SIGNING_SECRET` | Ja | Signerade fillänkar |
| `CRON_SECRET` | Ja | Interna cron-anrop |
| `APP_BASE_URL` | Rekommenderas | `https://app.lydiaestetisk.se` |
| `SMTP_HOST` | För e-post | SMTP-server |
| `SMTP_PORT` | För e-post | Vanligen 465 eller 587 |
| `SMTP_USER` / `SMTP_PASS` | För e-post | SMTP-inloggning |
| `SMTP_FROM_EMAIL` | För e-post | Avsändare |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | För Google-login | Google OAuth |
| `STRIPE_SECRET_KEY` | För betalning | Stripe |
| `STRIPE_PUBLISHABLE_KEY` | För betalning | Stripe frontend |
| `STRIPE_WEBHOOK_SECRET` | För betalning | Stripe webhook |
| `STORAGE_DRIVER` | Vid behov | LOCAL eller S3 |
| `STORAGE_DIR` / `S3_*` | Vid fil-lagring | Journalfiler |
| `ENCRYPTION_KEY` | Rekommenderas | Kryptering av sparade tokens |

Node-processen stoppar med ett tydligt startup-fel om en obligatorisk säkerhetsvariabel saknas.

## Databas

Schema skapas med projektets migrationssystem. PostgreSQL är Lydias enda runtime-databas.

Efter migration ska appens databasroll inte ha `BYPASSRLS`; klinikisoleringen bygger på PostgreSQL RLS tillsammans med applikationens behörighetslager.

## Hälsa och deployment

Backend har ett databasoberoende health-endpoint:

`GET /api/health`

Det används för att skilja ett fungerande Node-processlyssnande från databas-/applikationsfel.

Vid en 502/504 ska deploymenten kontrolleras mot dessa tre saker i första hand:

1. Node-processen startar med rätt Node-version.
2. Hostingers `PORT` används eller fallback `3000`.
3. Processen lyssnar på `0.0.0.0`, inte endast localhost.

## Funktioner

- Kundregistrering + e-postverifiering
- Inloggning + lösenordsåterställning
- Google-login
- Kundportal
- Personal- och admindashboard
- Personalinvitation
- Publik bokning
- Bokningskalender och tillgänglighet
- Journal, samtycken och hälsodeklarationer
- Filer med signerade länkar
- Betalningar/Stripe
- Audit-logg
- Rate limiting och CSRF-skydd
- Klinikisolering/RLS

## Stripe

Webhook:

`https://app.lydiaestetisk.se/api/functions/stripeWebhook`

Aktivera Stripe först när testbokning, betalningsflöde och webhook är verifierade.

## Cron

Påminnelsefunktionen använder:

`POST /api/functions/sendDueReminders`

och autentiseras med `x-cron-secret`. Cron kan köras via Hostingers schemalagda jobb utan att exponera någon administrativ endpoint.

## Base44

Base44-filerna i repot är kvar som migrerings-/kompatibilitetskälla. Produktionsbygget använder:

- `src/lib/api.js` för frontend-API
- lokal Express-backend
- lokal PostgreSQL
- lokal SDK/secrets-shim för kompilerade funktioner

Ingen Base44-tjänst krävs för att köra Lydia i produktion.

## Go-live

1. Kontrollera `/api/health`.
2. Kontrollera kundregistrering och OTP.
3. Kontrollera vanlig login och Google-login.
4. Kontrollera personalinbjudan.
5. Kontrollera publik bokning och lediga tider.
6. Kontrollera kundportal.
7. Kontrollera journal/samtycken.
8. Kontrollera Stripe testbetalning och webhook.
9. Kontrollera att en kund inte kan läsa en annan kunds data.
10. Aktivera därefter skarpa betalningar och externa integrationer.

WordPress på `lydiaestetisk.se` påverkas inte av app.lydiaestetisk.se.
