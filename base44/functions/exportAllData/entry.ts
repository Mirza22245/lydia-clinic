import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

// ENGÅNGSEXPORT för migrering till portabel drift (Hostinger). Endast app-admin.
// Returnerar en sida poster för en entitet: { items, next_cursor, has_more }.
// Poster med privata filer (PatientFile, TreatmentMedia) får ett kortlivat _signed_url
// som importskriptet använder för att kopiera filen till Lydias egen fillagring.
// Ta bort denna funktion när migreringen är verifierad. Kompileras INTE in i portabel drift.
const ENTITIES = [
  "AuditLog", "Booking", "Campaign", "Clinic", "ClinicalTreatmentRecord", "CommunicationLog",
  "Complication", "Consent", "Customer", "DiscountCode", "FeatureFlag", "FormSubmission",
  "FormTemplate", "GiftCard", "HealthDeclaration", "InventoryTransaction", "JournalEntry",
  "ManagementDocument", "Message", "PatientFile", "Payment", "Product", "Resource", "Review",
  "Room", "Staff", "StaffSchedule", "StaffTimeOff", "Task", "Treatment", "TreatmentCompliance",
  "TreatmentMedia", "TreatmentPlan", "WaitingList",
];
const FILE_ENTITIES = new Set(["PatientFile", "TreatmentMedia"]);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const { entity, cursor } = await req.json().catch(() => ({}));
    if (!ENTITIES.includes(entity)) {
      return Response.json({ error: "Okänd entitet", entities: ENTITIES }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const page = await svc.entities[entity].filter({}, { sort: "created_date", limit: 200, cursor });
    const items = [];
    for (const rec of page.items || []) {
      const out = { ...rec };
      if (FILE_ENTITIES.has(entity) && rec.file_uri) {
        const signed = await svc.integrations.Core.CreateFileSignedUrl({ file_uri: rec.file_uri, expires_in: 3600 });
        out._signed_url = signed.signed_url;
      }
      items.push(out);
    }
    return Response.json({ items, next_cursor: page.next_cursor || null, has_more: !!page.has_more });
  } catch (error) {
    console.error("exportAllData:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}