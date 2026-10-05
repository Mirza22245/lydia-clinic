// Delad helper för att registrera en audit-händelse från en backend-funktion.
// Anropas med en initierad base44-klient (createClientFromRequest) så att
// användarens identitet hämtas server-side och inte kan förfalskas av klienten.
// Fel fångas tyst så att audit-loggning aldrig kraschar den anropande funktionen
// (patientsäkerhetsloggen får inte blockera själva arbetsflödet).
export async function recordAudit(base44, evt) {
  try {
    const user = await base44.auth.me();
    const clinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: evt.event_type,
      entity_type: evt.entity_type,
      entity_id: evt.entity_id || "",
      description: evt.description || "",
      user_id: user?.id || "",
      user_name: user?.full_name || user?.email || "",
      metadata: evt.metadata ? JSON.stringify(evt.metadata) : "",
      clinic_id: clinicId || "",
    });
  } catch {
    // Swallow: audit-loggning får aldrig krascha anropande funktion.
  }
}