# Visma Spiris and Zettle integration plan

This document records the supported API boundaries and safe implementation sequence for Lydia Clinic. The settings cards are guidance only; neither provider is connected until the server-side OAuth, token storage, sync jobs, and reconciliation endpoints are implemented and tested.

## Visma Spiris (Bookkeeping & Invoicing / eAccounting)

- Official API documentation: https://developer.vismaonline.com/docs/spiris-eaccounting-api-documentation
- OAuth 2.0 authorization is required. The API uses scopes including `ea:api`, `offline_access`, `ea:sales` (or read-only), and `ea:accounting` (or read-only).
- The application must be registered with the Spiris/Visma partner programme. Sandbox access is for development; production access requires approval.
- Intended phases:
  1. OAuth connect/callback with state validation and per-clinic authorization.
  2. Encrypted server-side token storage and refresh-token rotation.
  3. Customer and invoice mapping with stable external IDs.
  4. Explicitly triggered invoice creation and sales/accounting sync, with idempotency keys and audit records.
  5. Sandbox tests before production activation.

## Zettle by PayPal

- API overview: https://developer.zettle.com/docs/api
- OAuth overview: https://developer.zettle.com/docs/api/oauth/overview
- Purchase API is read-only for purchases; Finance API exposes transactions and payouts. OAuth scopes must be limited to the features enabled.
- Zettle payment-taking SDKs are Android and iOS SDKs. A browser-only Lydia deployment cannot directly embed those SDKs to control a card reader. A separate native companion or a supported terminal/payment flow would be needed for an in-Lydia payment initiation experience.
- Intended phases:
  1. Register Lydia in the Zettle Developer Portal and implement OAuth connect/callback.
  2. Encrypt tokens server-side and handle refresh/revocation.
  3. Import purchases and finance transactions idempotently.
  4. Match by provider transaction ID first, then amount/currency/time as a suggested match; never silently mark an ambiguous payment as paid.
  5. Provide a staff reconciliation screen with unmatched/duplicate/error states and audit trail.
  6. Only add terminal-initiated payments after selecting and testing an approved Android/iOS or terminal architecture.

## Required deployment configuration (server only)

- Visma: `VISMA_CLIENT_ID`, `VISMA_CLIENT_SECRET`, `VISMA_REDIRECT_URI`, and approved production/sandbox API settings.
- Zettle: `ZETTLE_CLIENT_ID`, `ZETTLE_CLIENT_SECRET`, `ZETTLE_REDIRECT_URI`.
- Use the existing server encryption key only after confirming it is stable across restarts and securely provisioned. Never store provider secrets in frontend variables, source control, or logs.

## Data safety requirements

- Do not overwrite or delete existing Lydia customer, booking, invoice, or payment records during connection or import.
- Add provider IDs and sync metadata as additive fields/tables, with clinic isolation and unique constraints on provider + account + external transaction ID.
- Use dry-run/preview imports, pagination, retries with backoff, idempotency, and audit logs.
- Reconciliation should propose matches; uncertain matches require staff confirmation.
- Keep provider calls disabled until credentials, scopes, sandbox tests, and rollback procedures are verified.

## Current implementation status

The Settings > Integrations panel now displays setup cards and official documentation links for both services. These cards are not a live OAuth connection and do not yet import invoices, payments, or accounting entries. The next implementation step is the server-side OAuth/token store and database migration, which must be validated against the actual production hosting environment before enabling any sync.
