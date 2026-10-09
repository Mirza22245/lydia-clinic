# Lydia Estetisk – arbetslogg och fortsättningspunkt

Senast uppdaterad: 2026-10-09
Projekt: Base44 app `6ac3fdb641cde950308a8b95`
Repo: `Mirza22245/lydia-clinic`
Produktionsadress: https://app.lydiaestetisk.se

## Mål
Konfigurera Google OAuth så att Lydia kan ansluta Gmail och Google Kalender. Under test ska det egna kontot `lydiaestetisk@gmail.com` användas. Målet är att klinikkunder inte ska mötas av OAuth-fel.

## Google Cloud – vad som har gjorts
- Google Auth Platform-projektet som användaren arbetat i heter `lydia calender` (stavningen som visas i konsolen).
- OAuth-klienten heter `Lydia Calendar`.
- Under Authorized JavaScript origins har lagts till: `https://app.lydiaestetisk.se`.
- Den ursprungligen registrerade redirect URI:n är: `https://app.lydiaestetisk.se/api/google/callback`.
- Audience står på External och `lydiaestetisk@gmail.com` finns som testanvändare.
- Data Access scopes har sparats för `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.send` och `https://www.googleapis.com/auth/calendar.events`.
- Google Calendar API är bekräftat aktiverat (skärmbild visade Status: Enabled och Disable API).
- Gmail API skulle kontrolleras/aktiveras; ingen bekräftelse i loggen ännu.

## OAuth-felet – avgörande fynd
Google visar `Error 400: redirect_uri_mismatch`.
Fel-URL:n som användaren delade innehåller `client_id=902045745446-aupv2v727cvfqonqh27jee9lbvjcf5pr.apps.googleusercontent.com`.
Feltextens kodade detaljer visar att den begärda redirect URI:n är:
`https://app.lydiaestetisk.se/api/auth/google/callback`

Detta skiljer sig från den tidigare registrerade URI:n:
`https://app.lydiaestetisk.se/api/google/callback`

Nästa konkreta steg som föreslogs: öppna exakt den OAuth-klient som motsvarar client ID:t ovan i rätt Google Cloud-projekt och lägg till `https://app.lydiaestetisk.se/api/auth/google/callback` som en extra Authorized redirect URI. Behåll den gamla URI:n tills callback-kodens faktiska route har kontrollerats.

**Viktigt:** Att lägga till URI:n i Google Cloud kanske inte räcker. Kontrollera att servern faktiskt har en callback-route på `/api/auth/google/callback`. I tidigare kodarbete har `server/src/routes/google.js` använt `/api/google/callback`. Om servern bara hanterar den vägen kan den nya callback-adressen ge 404 eller annat fel efter OAuth-returen. Säkrast är att kontrollera routning och göra dem konsekventa: antingen använd `/api/google/callback` i OAuth-begäran eller implementera/aliasa `/api/auth/google/callback`, och registrera exakt samma URI hos Google. Kontrollera även att servern använder OAuth client ID som slutar på `902045745446-...` (exakt Client ID ska jämföras säkert, ingen Client secret får delas).

## Känd implementation i kod (senast kända tillstånd)
- `server/src/routes/google.js` uppdaterades för Google OAuth-scopes för Gmail + Calendar; Gmail list/read/send endpoints och disconnect endpoint lades till.
- Callbacken använde då URI:n `${config.appBaseUrl.replace(/\/$/, '')}/api/google/callback`.
- `src/components/IntegrationsPanel.jsx` uppdaterades med Google/Gmail-kort, inbox, läsa/skicka e-post och disconnect UI.
- `DEPLOYMENT.md` uppdaterades med Google OAuth setup och redirect URI `https://app.lydiaestetisk.se/api/google/callback`.
- `Check.md` uppdaterades med extern Google setup och teststatus.
- Bygg/lint/typecheck/systemcheck/diff-check passerade efter kodändringarna, men detta bevisar inte att live-miljön har rätt env vars eller att OAuth-flödet fungerar i produktion.
- Senaste checkpoint för dessa kodändringar: `6ac944df4c05eb5108ccd381`, commit `20495d00345c2a274ae9569503657331ae50eec6`.

## Viktiga begränsningar / inte verifierat
- Vi har inte bekräftat att senaste ändringar är deployade live.
- Serverns produktionsmiljövariabler `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` och `APP_BASE_URL` är inte kontrollerade. `APP_BASE_URL` ska normalt vara `https://app.lydiaestetisk.se` utan avslutande snedstreck.
- Gmail API-aktivering är inte bekräftad i den här loggen.
- End-to-end OAuth, Gmail läs/skicka, och kalenderhändelser är inte testade framgångsrikt.
- Gmail-scopes kan kräva Google-verifiering innan extern bred användning. Testläge/testanvändare används tills vidare.
- Ett mottaget testmejl från `lydiaestetisk@gmail.com` bekräftar bara att mejlet nådde inkorgen, inte att appens OAuth-integration fungerar.
- Dela aldrig Client secret i chatt eller skärmbilder.

## Fortsättningschecklista
1. I Google Cloud API Library, öppna Gmail API och kontrollera att det är aktiverat.
2. I Google Auth Platform → Clients, välj OAuth-klienten vars ID matchar `902045745446-aupv2v727cvfqonqh27jee9lbvjcf5pr.apps.googleusercontent.com`.
3. Registrera URI:n som faktiskt skickas i OAuth-begäran (`https://app.lydiaestetisk.se/api/auth/google/callback`) endast tillsammans med kontroll av serverroute. Behåll den gamla URI:n tills routningen är klar.
4. Inspektera koden i `server/src/routes/google.js` och OAuth-startvägen för att hitta varför live-begäran använder `/api/auth/google/callback` trots att tidigare kod anger `/api/google/callback`.
5. Kontrollera live `GOOGLE_CLIENT_ID` och `APP_BASE_URL` utan att visa/dela hemligheter; jämför Client ID med Google Console.
6. Gör routen och Google redirect URI konsekventa, bygg/testa, skapa checkpoint, deploya bara om användaren uttryckligen ber om det och det finns en säker deploymentväg.
7. Testa OAuth med `lydiaestetisk@gmail.com`, därefter Gmail list/read/send och kalenderintegration separat.

## Tidigare säkerhets-/projektstatus
- `server/src/lib/storage.js` har en hardened `resolvePath(uri)`-kontroll för genererade opaka paths under clinic folder (32 hex filename och jpg/png/pdf/webp).
- `server/src/index.js` CSP justerades för Google Fonts, bilddomäner och Google Maps iframe hosts.
- `index.html` lang satt till `sv`.
- `npm audit fix --omit=dev` sänkte production audit till 44 sårbarheter (37 high, 5 moderate, 2 low, 0 critical); high direct deps bl.a. Nodemailer/MJML kan kräva major upgrades. Kör inte `--force` blint.
- Tidigare verifieringar: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run check:system`, `git diff --check` passerade; build har stale Browserslist och bundle >500 kB-varningar.
- Produktionsauthz, tenant isolation, file access, payment webhook, backup restore och penetrationstest är INTE testade.
