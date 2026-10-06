// Delad helper för att registrera en audit-händelse från en backend-funktion.
// Anropas med en initierad base44-klient (createClientFromRequest) så att
// användarens identitet hämtas server-side och inte kan förfalskas av klienten.
// Fel fångas tyst så att audit-loggning aldrig kraschar den anropande funktionen
// (patientsäkerhetsloggen får inte blockera själva arbetsflödet).
//
// clinic_id kan skickas in explicit (t.ex. från en kund/post när användaren
// är en patient utan egen clinic_id) — annars hämtas det från användaren.
export async function recordAudit(base44: any, evt: any) {
  try {
    const user = await base44.auth.me();
    const clinicId = evt.clinic_id || getUserClinicIdSafe(user);
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: evt.event_type,
      entity_type: evt.entity_type,
      entity_id: evt.entity_id || '',
      description: (evt.description || '').slice(0, 500),
      user_id: user?.id || '',
      user_name: user?.full_name || user?.email || '',
      metadata: evt.metadata ? JSON.stringify(evt.metadata).slice(0, 4000) : '',
      clinic_id: clinicId || '',
    });
  } catch {
    // Swallow: audit-loggning får aldrig krascha anropande funktion.
  }
}

function getUserClinicIdSafe(user: any): string | null {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}