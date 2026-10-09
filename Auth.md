# Lydia Clinic — Authentication & Authorization

Last reviewed: 2026-10-09

## Authentication surface
src/lib/api.js defines credentialed API calls for /api/auth/me, login, logout, register, OTP verification/resend, password reset, staff invitation and invitation acceptance. The wrapper indicates the server sets an HttpOnly session cookie. Confirm actual server-side handlers and route coverage before treating this as a complete inventory.

## Intended role policy
- Platform admin: platform operations only where explicitly required.
- Clinic administrator: manage their own clinic configuration and authorized staff.
- Practitioner: access assigned clinical and booking data needed for care.
- Reception: permitted scheduling and customer-contact workflows.
- Public visitor/customer: public clinic information and authorized booking actions only.

The model includes platform role values admin/user and clinic staff roles administratör, behandlare and reception. These role descriptions are intended policy; verify implementation in backend middleware and route handlers.

## Required controls
- Deny unauthenticated requests to private routes.
- Check role and clinic ownership on every read, write, delete, export and file-signing request.
- Prevent horizontal privilege escalation by changing record or clinic IDs.
- Prevent role escalation through profile or generic entity APIs.
- Expire and single-use OTP, password-reset and invitation tokens.
- Rate-limit authentication endpoints and avoid account enumeration where practical.
- Use Argon2id or appropriately configured bcrypt for passwords.
- Set Secure, HttpOnly and appropriate SameSite cookie attributes; rotate sessions after authentication and privilege changes.
- Apply CSRF protection to cookie-authenticated state changes where required.
- Revoke sessions promptly when accounts are disabled or staff leave.
- Never log passwords, tokens or session identifiers.

## Verification evidence
For each private endpoint, record required role, tenant-scope rule, unauthorized result (401/403) and successful authorized test. Use synthetic accounts and records only.
