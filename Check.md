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

## Evidence log
| Date | Environment | Check | Status | Evidence / issue | Owner |
|---|---|---|---|---|---|
| 2026-10-09 | Project sandbox | npm run build | PASS | Vite production build and 32 backend functions compiled in sandbox. | Engineering |
| 2026-10-09 | Production | Full security review | NOT TESTED | No complete security assessment performed as part of writing these documents. | Assign owner |

## Release gate
A successful build does not prove the application is secure. Resolve critical/high findings, verify authorization and sensitive-file protections, test booking/payment safely and obtain accountable reviewer sign-off before release.
