# Lydia Clinic — Authorized Security Testing Plan

Purpose: authorized security testing only. Test systems owned by or explicitly authorized by the clinic. Never target third parties, real patients or live patient records.

## Scope
- Public website and booking journey.
- Login, staff invitation, OTP and password reset.
- Admin/staff APIs and clinic/tenant isolation.
- Booking creation, availability, cancellation and duplicate submission.
- File upload, preview and signed-URL authorization.
- Input validation, logging, rate limits and security headers.

## Safe setup
Use staging, synthetic users, fake bookings and non-sensitive files. Obtain written authorization and define test window, allowed source IPs, rate limits and emergency contact. Back up before state-changing tests. Do not run denial-of-service, credential-stuffing or destructive tests.

## Test cases
1. Authentication: invalid credentials, expired sessions, logout invalidation, OTP/reset expiry and rate limits.
2. Authorization: try another synthetic clinic record; attempt role changes through profile/entity APIs; test direct API calls rather than only the UI.
3. Booking integrity: invalid IDs, unavailable slots, past dates, repeated submissions and concurrent booking attempts.
4. Input handling: malformed JSON, unexpected types, oversized fields and SQL/HTML-like inputs; verify parameterization and output encoding.
5. Uploads: oversized files, misleading extensions, unsupported MIME types, malformed images and unauthorized object access.
6. Session/CSRF: cookie flags, session rotation, CSRF behavior and origin validation.
7. Abuse controls: test rate limits without generating disruptive traffic.
8. Configuration: HTTPS, security headers, CORS, production debug mode and secrets in client assets.

## Report each finding
Record ID, date, environment, endpoint, test account, expected/actual result, severity, minimal reproduction, redacted evidence, remediation owner and retest status. Never include real passwords, tokens or patient information.

## Stop conditions
Stop if real customer/clinical data is exposed, booking integrity is affected, service stability degrades or scope is uncertain. Notify the system owner.

## Severity guide
- Critical: broad unauthenticated sensitive-data access or equivalent full compromise.
- High: cross-clinic access, privilege escalation, authentication bypass or unauthorized clinical-file access.
- Medium: meaningful but constrained abuse or exposure.
- Low: limited-impact configuration or information issue.
Severity must reflect verified impact, not speculation.
