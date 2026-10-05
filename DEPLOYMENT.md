# Lydia — WordPress-integration, deployment & migration

Detta dokument beskriver hur Lydia (byggt på Base44) samexisterar med
klinikens WordPress-webbplats på **lydiaestetisk.se**, hur integrationen
läggs upp, och hur Lydia senare kan flyttas till Hostinger utan att WordPress
eller domänen påverkas.

---

## 1. Arkitekturöversikt

```
lydiaestetisk.se
│
├── WordPress  (Hostinger)        — publik webbplats, SEO, marknadsföring
│   ├── Startsida / behandlingar / priser / bilder / FAQ / kontakt
│   └── "Boka tid"-knapp  →  länkar till Lydia
│
└── Lydia  (Base44 under utveckling → Hostinger i produktion)
    ├── /book        — publik onlinebokning (ingen inloggning)
    ├── /portal      — kundportal (inloggning krävs)
    ├── /app/*       — personal- & adminportal (inloggning + RBAC)
    └── backend      — entiteter, funktioner, betalning, integrationer
```

**Ansvarsfördelning**
- **WordPress** = publik marknadsföring och information. Ingen direkt åtkomst
  till journal, hälsodata eller samtycken.
- **Lydia** = bokningsmotor, kundkonto, kundportal, personalportal, adminportal,
  kalender, journal, hälsodeklarationer, formulär, samtycken, betalningar,
  kvitton och audit-logg.
- **Hostinger** = framtida permanent driftmiljö.
- **GitHub** = källkod och versionering.
- **Base44** = bygg-/utvecklingsmiljö under utvecklingsfasen.

---

## 2. Domänstrategi

Tre alternativ, att väljas efter teknisk kontroll av Hostinger. **Ingen DNS-
ändring görs utan uttryckligt godkännande.**

### Alternativ A — Subdomän (rekommenderas)
- `https://lydiaestetisk.se/` → WordPress (oförändrad)
- `https://app.lydiaestetisk.se/` → Lydia (Base44-appen)
- **Fördelar:** WordPress opåverkad; Lydia isolerat; SSL via separat certifikat;
  enklast att flytta till Hostinger senare (peka om subdomänen).
- **DNS:** Lägg till en CNAME-post `app` → Base44-appens domän. Berör inte apex
  eller WordPress.

### Alternativ B — Path/reverse proxy
- `https://lydiaestetisk.se/boka` → Lydia
- Kräver reverse proxy i Hostinger (nginx/.htaccess) som vidarebefordrar `/boka`
  och `/portal` till Base44-appen.
- **Fördelar:** samma domän, enhetlig URL.
- **Nackdelar:** beror av Hostingers proxy-stöd; kan krocka med WordPress-
  permalänkar; svårare att flytta.

### Alternativ C — Direktlänk
- WordPress "Boka tid" länkar direkt till Base44-appens URL (t.ex.
  `benign-quick-build-flow.base44.app/book` eller en egen kortlänk).
- Enklast som interimlösning innan subdomän är konfigurerad.

**Rekommendation:** Alternativ A (subdomän `app.lydiaestetisk.se`).

---

## 3. Integrationspunkter

| Punkt | Beskrivning | Ägare |
|---|---|---|
| Boka-knapp i WordPress | Länk/CTA som pekar på `https://app.lydiaestetisk.se/book` | WordPress-admin |
| Kundportal-länk | Länk från WordPress "Mitt konto" → `https://app.lydiaestetisk.se/portal` | WordPress-admin |
| Visuell identitet | Lydia tema matchar WordPress (se §4) | Lydia (klart) |
| Behandlingslista | Lydia hämtar behandlingar från sin egen databas; WordPress visar sin lista separat | respektive system |
| Betalning | Stripe hanteras i Lydia (in-context); WordPress/WooCommerce berörs ej | Lydia |
| E-post | Bekräftelser skickas från Lydia (app-domän krävs för icke-registrerade mottagare) | Lydia |

WordPress har **ingen** direkt åtkomst till känslig journal-/hälsodata. Om
framtida API-behov uppstår exponeras ett explicit, autentiserat API från Lydia —
aldrig direkt databasåtkomst.

---

## 4. Visuell identitet (tema)

Lydia är anpassat till lydiaestetisk.se:

- **Färger:** cream `#f6f2ed` (bakgrund), charcoal `#1b2220` (primär/text),
  sage `#d8e2d8` (accent/sekundär).
- **Typografi:** Playfair Display (rubriker, serif), Inter (brödtext, sans).
- **Kliniknamn:** "Lydia Estetisk Klinik" (sätts i Clinic-posten + UI-branding).

Tema definieras i `src/index.css` (design tokens) och mappas via
`tailwind.config.js`. Ändra färg/typografi där — inte i enskilda komponenter.

---

## 5. Routing i Lydia

| Route | Syfte | Åtkomst |
|---|---|---|
| `/` | Landningssida (klarmärkt) | Publik |
| `/book` | Onlinebokning | Publik |
| `/portal` | Kundportal | Inloggad kund |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth | Publik |
| `/app/*` | Personal- & adminportal | Inloggad + RBAC |

När Lydia går live bakom WordPress bör `/` antingen omdirigera till `/book`
eller visa en minimal klarmärkt ingång (Boka tid / Kundportal / Personal).
Detta är en framtida justering — dokumenterad här.

---

## 6. Säkerhet & åtkomstkontroll

- **RLS (Row-Level Security):** varje entitet isoleras per `clinic_id`. Känslig
  journal-/hälsodata styrs dessutom per `staff_role` (administratör/behandlare/
  reception) på datanivå — inte bara i menyn.
- **Kundportal:** kunden ser endast sina egna bokningar/journaler/samtycken.
- **Personalportal:** separat inloggning; RBAC via `staff_role`.
- **Admin:** separat inloggning; fullständiga administrativa rättigheter.
- **Audit-logg:** oföränderlig spårning av kritiska åtgärder (journal-signering,
  samtyckes-signering, betalningar).
- **WordPress** har ingen åtkomst till Lydia-backend utan ett explicit,
  autentiserat API.

---

## 7. Base44-beroenden (att ersätta vid migration)

Lydia körs idag på Base44. Vid flytt till Hostinger ersätts följande:

| Base44-komponent | Ersätts med på Hostinger |
|---|---|
| Entiteter (JSON-schema + RLS) | PostgreSQL-tabeller + RLS-policyer |
| Backend-funktioner (`base44/functions/`) | Node/Deno HTTP-handlers (portabel TS) |
| Auth (Base44 SDK) | Egen auth (t.ex. JWT + bcrypt) eller Hostinger-lösning |
| `@base44/sdk` (entiteter, auth) | Egen data-lager + ORM (t.ex. Prisma/Drizzle) |
| Core-integrationer (SendEmail, InvokeLLM, filuppladdning) | Respektive tjänst (SMTP, OpenAI, S3/Hostinger storage) |
| Stripe-integration | Oförändrad (Stripe API direkt) |
| Hosting | Hostinger VPS/delat |

**Portabilitetsåtgärder redan tagna:**
- Affärslogik ligger i backend-funktioner (portabel TypeScript), inte inbäddad i
  UI-komponenter.
- Entitetsscheman är rena JSON-definitioner som mappar 1:1 till tabeller.
- Stripe-anrop är isolerade i `createPaymentIntent` / `stripeWebhook`.
- Inga hårda beroenden till Base44 i UI förutom SDK-klienten (`@/api/base44Client`).

---

## 8. Migrationsväg till Hostinger

1. **Klara Lydia funktionellt** på Base44 (pågående — se "Lydia Production
   Readiness"-planen).
2. **Versionera all kod på GitHub** (2-way sync Base44 ↔ GitHub).
3. **Sätt upp Hostinger-miljö:** Node-runtime + PostgreSQL + SSL.
4. **Migrera databas:** export entiteter → PostgreSQL-tabeller med RLS.
5. **Migrera backend-funktioner:** flytta `base44/functions/` till Hostinger-
   endpoints; byt SDK-anrop mot egen data-lager.
6. **Migrera auth:** portera användare + sessioner.
7. **Peka om `app.lydiaestetisk.se`** från Base44 till Hostinger (CNAME-ändring,
   dokumenteras innan genomförande).
8. **Verifiera end-to-end** genom hela patientresan.
9. **Stäng Base44-miljö** när Hostinger är grön.

WordPress på `lydiaestetisk.se` berörs inte av steg 1–8 så länge apex och
WordPress DNS lämnas oförändrade.

---

## 9. DNS — säkerhetsregler

- **Ingen DNS-ändring utan uttryckligt godkännande.**
- Alla DNS-ändringar dokumenteras (post, gammalt värde, nytt värde, tid, vem)
  innan de genomförs.
- Apex `lydiaestetisk.se` och WordPress A/AAAA-poster rör **inte**.
- Vid subdomän: lägg endast till ny CNAME för `app`.

---

## 10. Öppna beslut (att ta efter Hostinger-kontroll)

- [ ] Subdomän vs path/reverse proxy (rekommendation: subdomän).
- [ ] Om Lydia ska visa egen landningssida eller omdirigera `/` → `/book`.
- [ ] Om WooCommerce-konto ska kopplas till Lydia-kundkonto (SSO/mappning).
- [ ] E-postdomän för Lydia-utskick (egen domän via Hostinger/SMTP).
- [ ] SMS-provider för påminnelser (Twilio etc.) — se Fas F.