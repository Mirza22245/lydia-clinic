// Mini user-context för policy.js. (Delad med authz.ts-semantik men i JS för servern.)
export function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
export function getStaffRole(user) {
  if (user?.role === 'admin') return 'administratör';
  const v = user?.staff_role ?? user?.data?.staff_role ?? null;
  return v && String(v).trim() ? String(v) : null;
}
export function isPlatformAdmin(user) {
  return user?.role === 'admin' && !getUserClinicId(user);
}