# Lydia Clinic — Data Protection & Data Model

Last reviewed: 2026-10-09

## Data categories
1. Public clinic information, approved marketing copy and gallery images.
2. Operational data: bookings, staff schedules, treatment catalog, prices and settings.
3. Personal data: customer names, contact information and appointment history.
4. Sensitive clinical data: patient records, treatment notes, photographs and documents that may reveal health information.
5. Technical/security data: session metadata, audit events and logs.
6. Secrets: database, email, SMS, payment and signing credentials.

## Principles
- Collect only data needed for a defined purpose.
- Separate public content from customer and clinical records.
- Enforce clinic/tenant boundaries on the server, not only in the UI.
- Deny access by default and explicitly authorize each operation.
- Use HTTPS and encryption at rest for databases, backups and storage where supported.
- Restrict production access and use synthetic test data.
- Document retention, deletion, exports, processors and backups.
- Audit access and changes to sensitive records without copying clinical details into logs.

## Database
The project depends on PostgreSQL via pg. Verify parameterized queries, least-privilege database credentials, reviewed migrations, encrypted backups, tested restores and tenant scoping.

## Files and images
The frontend wrapper exposes /api/files/upload and /api/files/sign. Verify backend behavior before relying on it. Separate public clinic-approved marketing images from private patient files. Patient files require authorization and short-lived signed URLs; never expose private files through public or durable links.

## Privacy
Health data may be special-category personal data under GDPR. The clinic should document purpose, lawful basis, access, retention, processor arrangements and incident handling with its privacy/legal lead. This document is not legal advice or a compliance certification.

## Inventory template
For every entity/file type, record owner, fields, purpose, sensitivity, authorized roles, storage location, retention period, deletion process, backup handling and audit requirements.
