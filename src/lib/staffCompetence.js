// Frontend-spegel av base44/shared/staffCompetence.ts (servern är alltid den som avgör).
// null = behandlaren får utföra ALLA behandlingar, annars lista med Treatment-ID.
export function parseAllowed(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}

export function canPerform(staff, treatmentId) {
  const allowed = parseAllowed(staff?.allowed_treatment_ids);
  return allowed === null || allowed.includes(String(treatmentId));
}