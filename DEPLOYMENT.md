# Lydia — Hostinger Deployment Guide

> **Mål:** Deploya Lydia på Hostinger utan Base44. WordPress på lydiaestetisk.se förblir oförändrad.

## Arkitektur

```
lydiaestetisk.se          → WordPress (Hostinger, oförändrad)
app.lydiaestetisk.se      → Lydia frontend (React, statisk bundle)
api.lydiaestetisk.se      → Lydia backend (Node/Express)
                          → PostgreSQL (Hostinger databas)
                          → S3-fillagring (Hostinger Object Storage)
```

## Steg 1 — Förbered Hostinger VPS

1. Köp VPS-plan (minst 2GB RAM, 20GB SSD)
2. Installera Docker + Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable docker
   ```
3. Skapa PostgreSQL-databas via Hostinger-panel eller Docker

## Steg 2 — DNS-konfiguration (INTE WordPress!)

**Viktigt:** Ändra INTE befintliga DNS-poster för lydiaestetisk.se. Lägg till NYA subdomäner:

```
Typ    Namn                   Värde                     TTL
A      app.lydiaestetisk.se   [Hostinger VPS IP]        3600
A      api.lydiaestetisk.se   [Hostinger VPS IP]        3600
```

**WordPress-poster (A- och www-poster för lydiaestetisk.se) ska INTE röras.**

## Steg 3 — Deploya backend

```bash
# På Hostinger VPS:
git clone https://github.com/ditt-repo/lydia.git
cd lydia/server
cp .env.example .env
# Redigera .env med riktiga värden
npm install
npm run migrate  # Kör schema.sql
npm start
```

## Steg 4 — Deploya frontend

```bash
cd lydia
npm install
npm run build  # Bygg statisk bundle
# Servera via nginx:
# - app.lydiaestetisk.se → /usr/share/lydia/frontend/dist
# - api.lydiaestetisk.se → proxy till localhost:3001
```

## Steg 5 — Konfigurera secrets

Sätt i `server/.env`:
- `DATABASE_URL` — Hostinger PostgreSQL-anslutning
- `JWT_SECRET` — generera med `openssl rand -hex 32`
- `STRIPE_SECRET_KEY` — från Stripe-dashboard
- `STRIPE_WEBHOOK_SECRET` — från Stripe webhook
- `SMTP_*` — från e-postleverantör (t.ex. Hostinger Mail)
- `SMS_*` — från SMS-leverantör (när vald)
- `BANKID_*` — från BankID-leverantör (när avtal sluts)
- `S3_*` — från Hostinger Object Storage

## Steg 6 — Uppdatera Stripe webhook

I Stripe Dashboard → Webhooks:
- Ändra URL till: `https://api.lydiaestetisk.se/api/payments/webhook`
- Behåll samma events: `payment_intent.succeeded`, `charge.refunded`

## Steg 7 — Uppdatera WordPress-länk

I WordPress (lydiaestetisk.se):
- Ändra "Boka tid"-länk från `https://lydiaestetisk.se/book` till `https://app.lydiaestetisk.se/book`
- Detta är den ENDA ändringen i WordPress — ingen kod, ingen DNS

## Steg 8 — Verifiera

1. Besök `https://app.lydiaestetisk.se` — Lydia laddar
2. Besök `https://lydiaestetisk.se` — WordPress oförändrad
3. Klicka "Boka tid" på WordPress → omdirigeras till Lydia
4. Testa bokning → betalning → kvitto
5. Verifiera att journal skapas och signeras
6. Kontrollera audit-logg

## Migrering av data från Base44

1. Exportera alla entiteter från Base44 som JSON (via Base44 API eller dashboard)
2. Konvertera till SQL INSERTs (skript finns i `server/src/db/migrate-from-base44.js` — TODO)
3. Importera till PostgreSQL: `psql -d lydia -f import.sql`

## Backup

```bash
# Daglig PostgreSQL-backup (cron):
0 3 * * * pg_dump lydia | gzip > /backups/lydia-$(date +\%Y\%m\%d).sql.gz
```

## Övervakning

- Health check: `GET https://api.lydiaestetisk.se/health`
- Logs: `docker-compose logs -f backend`
- DB health: `pg_isready -U lydia