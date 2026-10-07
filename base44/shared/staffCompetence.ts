// Personalens behandlingskompetens. Admin väljer vilka behandlingar varje
// behandlare får utföra (Staff.allowed_treatment_ids, JSON-array med Treatment-ID).
//   - Ej konfigurerat (tomt/saknas) = behandlaren får utföra ALLA behandlingar.
//   - Konfigurerat (array) = ENDAST de listade behandlingarna; "[]" = ingen.
// Portabel — ingen Base44-import. Används av både publik bokning, ombokning
// och personalbokning så att regeln aldrig kan kringgås i en enskild väg.

export function parseAllowedTreatments(raw: any): string[] | null {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

export function canPerformTreatment(staff: any, treatmentId: string): boolean {
  const allowed = parseAllowedTreatments(staff?.allowed_treatment_ids);
  return allowed === null ? true : allowed.includes(String(treatmentId));
}

export type BookableResult =
  | { ok: true; staff: any }
  | { ok: false; status: number; code: string; error: string };

// Kontrollerar att behandlaren finns, är aktiv och får utföra behandlingen.
export async function checkStaffBookable(
  svc: any,
  params: { clinic_id: string; staff_name: string; treatment_id: string }
): Promise<BookableResult> {
  const { clinic_id, staff_name, treatment_id } = params;
  const page = await svc.entities.Staff.filter({ clinic_id, name: staff_name }, { limit: 5 });
  // Base44-kompatibiliteten kan returnera antingen en array eller ett
  // paginerat objekt. Normalisera båda formaten innan vi söker personalen.
  const items = Array.isArray(page)
    ? page
    : Array.isArray(page?.items)
      ? page.items
      : Array.isArray(page?.data)
        ? page.data
        : [];
  const staff = items.find((s: any) => s?.active !== false);
  if (!staff) {
    return { ok: false, status: 400, code: 'staff_unavailable', error: 'Behandlaren finns inte eller är inte aktiv.' };
  }
  if (!canPerformTreatment(staff, treatment_id)) {
    return {
      ok: false,
      status: 403,
      code: 'staff_not_authorized',
      error: 'Den valda behandlaren är inte behörig att utföra den här behandlingen.',
    };
  }
  return { ok: true, staff };
}