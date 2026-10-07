# Lydia — Driftsättning på Hostinger (utan Base44)

> **Status:** Koden bygger i permanent Lydia-läge. Frontend och backend kör mot Lydias egen Express/PostgreSQL-stack; Base44 SDK och Vite-plugin ingår inte i produktionen.
> Auth-flödet (registrering → OTP → verifiering → `/me` → inloggad session) är verifierat med 17 tester mot riktig PostgreSQL — en kritisk sessionsbugg är åtgärdad (`server/src/auth/session.js`).
> Den portabla servern har **inte** körts end-to-end mot riktig PostgreSQL i utvecklingsmiljön — kör röktestet (steg 9) och säkerhetstestet (steg 9b) innan något annat.
> WordPress på lydiaestetisk.se berörs inte av något steg före steg 11.

## Arkitektur

```
lydiaestetisk.se           → WordPress (oförändrad tills steg 11)
app.lydiaestetisk.se       → host-nginx (TLS) → frontend-container (SPA + /api-proxy) → backend (Node/Express) → PostgreSQL 16
                              Allt på samma ursprung (/api) — ingen CORS, same-site-cookie.
```

Compose-tjänster: `db` (Postgres), `backend`, `frontend`, samt engångsjobben `migrate` och `create-admin` (profil `tools`).
Appen kör som databasrollen `lydia_app` (endast DML, ingen BYPASSRLS) så att **FORCE RLS** gäller.

## 1. Förbered VPS (min. 2 GB RAM)

```bash
curl -fsSL https://get.docker.com | sh && sudo systemctl enable docker
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. DNS (endast ny post)

`A  app.lydiaestetisk.se → <VPS-IP>`. Rör inte WordPress-posterna.

## 3. Hämta koden

```bash
git clone <ditt-github-repo> /opt/lydia && cd /opt/lydia
```

## 4. Konfigurera hemligheter

```bash
cp server/.env.example server/.env      # fyll i, se tabellen nedan
export DB_PASSWORD=<långt-lösenord> LYDIA_APP_PASSWORD=<annat-långt-lösenord>   # eller en .env bredvid docker-compose.yml
```

| Variabel | Krävs | Anmärkning |
|---|---|---|
| `JWT_SECRET`, `FILE_SIGNING_SECRET`, `CRON_SECRET` | ja | `openssl rand -hex 32` var för sig |
| `APP_BASE_URL` | ja | `https://app.lydiaestetisk.se` (senare `https://lydiaestetisk.se`) |
| `SMTP_HOST/PORT/USER/PASS/FROM_EMAIL` | ja | Utan SMTP skickas ingen e-post (bokningsbekräftelse, återställning) |
| `STORAGE_DRIVER` (`LOCAL`/`S3`) + `STORAGE_DIR` eller `S3_*` | ja | Journalbilder och dokument |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | för betalning | Testnycklar tills ni aktiverar |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER` | för SMS | Lämna tomt = SMS fungerar ej (svarar "inte konfigurerat") |
| `BANKID_MODE`, `BANKID_API_URL`, `BANKID_CLIENT_SECRET` | för BankID | Lämna tomt = BankID fungerar ej |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | för Google Calendar | Lämna tomt = ej ansluten |
| `ENCRYPTION_KEY` | rekommenderas | Krypterar sparade tokens |

## 5. Databas

```bash
docker compose up -d db
docker compose --profile tools run --rm migrate
LYDIA_ADMIN_EMAIL=<din-epost> LYDIA_ADMIN_PASSWORD=<lösenord> docker compose --profile tools run --rm create-admin
```

## 6. Starta

```bash
docker compose up -d --build
```

## 7. TLS + host-nginx

```bash
sudo cp deploy/nginx/lydia.conf /etc/nginx/conf.d/lydia.conf
sudo certbot --nginx -d app.lydiaestetisk.se && sudo nginx -t && sudo systemctl reload nginx
```

## 8. Schemalagda jobb

```bash
# Påminnelser (24 h / 2 h) var 15:e minut — skickar bara kanaler som är aktiverade
*/15 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:8080/api/functions/sendDueReminders >/dev/null
# Backup 03:00 (databas + filer, 14 dagars retention)
0 3 * * * PG_SUPERUSER_URL=postgresql://lydia:<DB_PASSWORD>@127.0.0.1:5432/lydia /opt/lydia/server/scripts/backup.sh
```
Testa återläsning med `server/scripts/restore.sh` på en tom databas **innan** go-live.

## 9. Röktest (ska vara grönt innan data flyttas)

1. `curl https://app.lydiaestetisk.se/api/health` → `{"ok":true}`
2. Logga in som admin, öppna Inställningar → fyll i öppettider, FAQ, logotyp.
   - **Viktigt:** Om inloggningen omedelbart loggas ut (varje `/api/auth/me` → 401) är sessionverifieringen trasig — bekräfta att `server/src/auth/session.js` använder `b64urlDecode(sig)` (inte `Buffer.from(sig)`) vid HMAC-jämförelsen.
3. Lägg in personalens arbetsscheman (Schema) — annars finns inga bokningsbara tider.
4. Boka som gäst, registrera konto med samma e-post, fyll i hälsodeklaration + samtycke, bekräfta som personal.
5. Betala med Stripe-testkort `4242 4242 4242 4242` → kvitto skapas.
6. Signera journal; kontrollera Revisionslogg.
7. Isoleringstest: logga in som kund A och försök läsa kund B:s bokning/journal → ska nekas.

## 9b. Säkerhetstest (autentisering + RLS-isolering)

```bash
# Kräver installerade server-beroenden (npm --prefix server install) och en tom PostgreSQL
npm --prefix server run test:security
```
Testar klinikisolering (FORCE RLS), gästbokningsskydd, CSRF och auth-sessionens giltighet.
Måste vara grönt innan steg 10 (datamigrering).

## 10. Data och migrering

Produktionen kräver inte Base44. PostgreSQL är Lydias primära och enda runtime-databas.

Om äldre Lydia-data redan finns i PostgreSQL används den direkt efter migrering/schema-kontroll. Historiska Base44-exporter får endast användas som en separat engångsmigrering och behövs inte för att starta eller köra systemet.

## 11. Stripe och go-live (först efter godkänt röktest)

1. Stripe → Webhooks: lägg till `https://app.lydiaestetisk.se/api/functions/stripeWebhook` (events `payment_intent.succeeded`, `charge.refunded`); lägg den nya signeringshemligheten i `STRIPE_WEBHOOK_SECRET`.
2. Byt till skarpa Stripe-nycklar när ni är redo att ta betalt.
3. Aktivera moduler **en i taget** under Inställningar → Funktionsflaggor: `sms`, `bankid`, `google_calendar`, `payments` (de är avstängda/testläge och svarar "inte konfigurerat" utan nycklar).
4. WordPress: ändra endast "Boka tid"-länken till `https://app.lydiaestetisk.se/book` — eller, när ni beslutat flytta hela domänen, använd `deploy/nginx/lydia-disabled.conf.example` som mall.

## Rollback

WordPress är orörd: ta bort "Boka tid"-länkändringen/nginx-blocket så är läget som före flytten. Databasen kan återställas med `server/scripts/restore.sh`.