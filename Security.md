# Lydia Clinic — Security Overview

Status: Internal working document
Last reviewed: 2026-10-09

## Scope
Lydia Clinic web app, public booking, admin/staff portal, API, database and file uploads.

## Architecture known from repository
- Frontend: React + Vite.
- Backend: Node.js/Express under server/src; API uses /api.
- PostgreSQL driver: pg.
- Frontend API wrapper uses credentialed requests and server-managed session cookies (see src/lib/api.js).
- File endpoints exposed by the wrapper: /api/files/upload and /api/files/sign.
- Public booking has dedicated data, availability and booking API calls.

## Required security controls to verify
- HTTPS; Secure, HttpOnly and appropriate SameSite session cookies.
- Session rotation after login/privilege change; server-side invalidation on logout.
- Strong password hashing; no plaintext credentials.
- Rate limits on login, OTP, reset, public booking and file upload.
- Server-side authorization for every private endpoint and clinic/tenant record.
- Parameterized SQL and strict input validation.
- Upload size/type/content limits, safe filenames and private-by-default patient files.
- Short-lived signed URLs issued only after authorization.
- Security headers, restrictive CORS and CSRF protection where required.
- Secrets stored outside source control and frontend bundles.
- Logs exclude passwords, tokens and unnecessary clinical data.
- Encrypted, access-controlled backups with periodic restore tests.

## Sensitive data
Treat patient records, treatment notes, contact details, bookings and uploaded clinical files as confidential. Use synthetic data for development and security tests. Define retention and deletion rules and restrict production access.

## Incident response
1. Contain the issue and revoke affected credentials/sessions if needed.
2. Preserve minimal, redacted evidence.
3. Determine affected systems and data categories.
4. Rotate exposed secrets and fix the root cause.
5. Assess applicable notification obligations with the privacy/security lead.
6. Retest and document remediation.

## Limitation
This is a baseline, not a certification or proof that every control is implemented. Use Check.md to record evidence. Do not claim GDPR compliance or a completed penetration test without documentation.
