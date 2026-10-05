import { base44 } from "@/api/base44Client";

export async function getClinicId() {
  try {
    const me = await base44.auth.me();
    return me?.clinic_id ?? me?.data?.clinic_id ?? null;
  } catch {
    return null;
  }
}