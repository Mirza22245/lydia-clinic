// Delade auktorisationshjälpare för backend-funktioner.
// Säkerställer att en användare är personal OCH tillhör samma klinik som en post,
// utan att null/undefined clinic_id kan kringgå isoleringen (den tidigare
// "båda satta och lika"-kollen lät patienter utan clinic_id läsa poster som
// saknade clinic_id). Här måste användarens clinic_id vara satt OCH exakt
// matcha postens — utom för en platform-admin (role=admin, ingen clinic_id)
// som har tillgång till allt.

export function getUserClinicId(user: any): string | null {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}

export function getStaffRole(user: any): string | null {
  if (user?.role === 'admin') return 'administratör';
  const v = user?.staff_role ?? user?.data?.staff_role ?? null;
  return v && String(v).trim() ? String(v) : null;
}

// En platform-admin är en Base44-appägare (role=admin) utan clinic_id —
// har tillgång till alla kliniker. I portabel drift är varje admin bunden
// till en klinik och är därmed INTE platform-admin.
export function isPlatformAdmin(user: any): boolean {
  return user?.role === 'admin' && !getUserClinicId(user);
}

export function isStaff(user: any): boolean {
  return isPlatformAdmin(user) || !!getStaffRole(user);
}

export function isClinicalStaff(user: any): boolean {
  const r = getStaffRole(user);
  return isPlatformAdmin(user) || r === 'administratör' || r === 'behandlare';
}

// Streng klinikisolering. True om användaren får se posten.
export function canAccessClinic(user: any, recordClinicId: string | null | undefined): boolean {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}

export function requireStaff(user: any): { ok: boolean; status?: number; error?: string } {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!isStaff(user)) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}

export function requireClinicalStaff(user: any): { ok: boolean; status?: number; error?: string } {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!isClinicalStaff(user)) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true };
}