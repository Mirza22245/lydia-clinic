# Lydia Clinic — Security & Release Checklist

Last reviewed: 2026-10-09
Use PASS only with recorded evidence; FAIL for a confirmed issue; NOT TESTED when no evidence exists; N/A with a reason.

## Build and code
- [ ] npm run build succeeds in a clean environment.
- [ ] Lint and typecheck results reviewed.
- [ ] Dependencies audited and critical/high advisories triaged.
- [ ] No secrets or production data in source, build output or source maps.
- [ ] Changes reviewed and rollback plan documented.

## Authentication and authorization
- [ ] Private API routes reject requests without a valid session.
- [ ] Role checks are enforced server-side.
- [ ] Cross-clinic reads and writes are denied.
- [ ] Role escalation through profile/entity APIs is denied.
- [ ] Logout invalidates the session; cookie flags and expiry verified.
- [ ] Login, OTP and reset rate limits and token expiry verified.
- [ ] CSRF and CORS policy tested.

## API and database
- [ ] SQL is parameterized and inputs/request sizes validated.
- [ ] Booking conflicts and duplicate submissions handled safely.
- [ ] Errors do not expose stack traces or secrets.
- [ ] Logs exclude credentials and unnecessary clinical data.
- [ ] Backup restore test completed and documented.

## Files and images
- [ ] Uploads enforce size, type and content limits server-side.
- [ ] Filenames are safe and executable content is not served.
- [ ] Patient files require authorization; signed links expire.
- [ ] Public gallery uses clinic-approved public images, not private patient-file URLs.
- [ ] Admin can upload, preview, remove and save gallery images.
- [ ] Saved gallery works after refresh on homepage and booking page, including mobile.

## Production and integrations
- [ ] HTTPS, security headers, CORS and production error handling verified.
- [ ] Environment variables and secret rotation process documented.
- [ ] Payment stays in test mode until approved end-to-end testing is complete.
- [ ] Email/SMS/identity integrations tested only with authorized credentials.
- [ ] Health/readiness endpoints do not expose sensitive diagnostics.
- [ ] Incident contact, backup/restore and rollback plans are available.

## Google OAuth / Gmail
- [ ] Exact redirect URI registered in Google Cloud Console and verified against production `APP_BASE_URL`.
- [ ] Gmail API and Google Calendar API enabled in the OAuth project.
- [ ] OAuth consent screen/test users and Google verification requirements completed for the requested Gmail scopes.
- [ ] Test a separate clinic/staff account connecting, listing mail, opening a message, sending a test message, token refresh and disconnect.
- [ ] Verify calendar read/write flow end-to-end; OAuth consent alone does not prove calendar sync.

## Evidence log
| Date | Environment | Check | Status | Evidence / issue | Owner |
|---|---|---|---|---|---|
| 2026-10-09 | Project sandbox | npm run build | PASS | Vite production build and 32 backend functions compiled in sandbox. | Engineering |
| 2026-10-09 | Project sandbox | npm run lint + npm run typecheck + npm run check:system | PASS | All three commands passed after CSP and document-language changes. | Engineering |
| 2026-10-09 | Project sandbox | Content Security Policy | FIXED IN CODE | Google Maps iframe, Google Fonts, Unsplash hero image and Wix-hosted images were blocked by the prior CSP; explicit origins added. Must verify response headers in deployed environment. | Engineering |
| 2026-10-09 | Project sandbox | npm audit --omit=dev | FAIL / TRIAGE REQUIRED | After non-breaking npm audit fix: 44 production dependency advisories remain (37 high, 5 moderate, 2 low, 0 critical). High-risk direct dependencies include Nodemailer and MJML; remediation requires major-version changes and regression tests. Tailwind dependency chain also remains vulnerable. | Engineering |
| 2026-10-09 | Project sandbox | File path validation | FIXED IN CODE | Signed file retrieval now accepts only generated 32-hex filenames in a single clinic folder and resolves paths under the configured storage root. Build/lint/typecheck/system checks pass. | Engineering |
| 2026-10-09 | Project sandbox | Gmail + Google OAuth | IMPLEMENTED IN CODE / EXTERNAL SETUP REQUIRED | OAuth requests Gmail read/send plus Calendar scopes; backend has per-user encrypted token storage, Gmail list/detail/send routes and disconnect; UI includes connection, inbox and send controls. Build, lint, typecheck, system check and diff check passed. Production OAuth redirect registration, API enablement, Google consent verification and end-to-end account tests remain NOT TESTED. | Engineering |
| 2026-10-09 | Production | AuthZ, tenant isolation, file access, payment webhook, backup restore, full penetration test | NOT TESTED | Cannot be marked PASS without authenticated staging/production tests and recorded evidence. | Assign owner |

## Release gate
A successful build does not prove the application is secure. Resolve critical/high findings, verify authorization and sensitive-file protections, test booking/payment safely and obtain accountable reviewer sign-off before release.
