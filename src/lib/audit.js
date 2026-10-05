import { recordAuditEvent } from "@/functions/recordAuditEvent";

// Klienthjälp för att logga en audit-händelse via backend-funktionen.
// Användarens identitet slås upp server-side. Fel ignoreras så att
// loggning aldrig blockerar pågående arbetsflöden.
export async function logAudit(event_type, entity_type, entity_id, description, metadata) {
  try {
    await recordAuditEvent({ event_type, entity_type, entity_id, description, metadata });
  } catch {
    // Ignorera — audit-loggning får inte blockera arbetsflödet.
  }
}