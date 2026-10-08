// Server-side kontroll av klinikens feature flags och konfiguration.
// disabled = ingen påverkan, test = utvärdera/logga men blockera inte,
// enabled = utvärdera och tillämpa som blockerande regel.
export type RuleMode = 'disabled' | 'test' | 'enabled';

export function parseFlagConfig(flag: any): Record<string, any> {
  try {
    const value = typeof flag?.config === 'string' ? JSON.parse(flag.config || '{}') : (flag?.config || {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export async function getClinicRule(svc: any, clinic_id: string, key: string): Promise<{ status: RuleMode; config: Record<string, any>; active: boolean; enforce: boolean }> {
  const page = await svc.entities.FeatureFlag.filter({ clinic_id, key }, { limit: 1 });
  const flag = (page.items || [])[0];
  const status: RuleMode = flag?.status === 'enabled' || flag?.status === 'test' ? flag.status : 'disabled';
  return {
    status,
    config: parseFlagConfig(flag),
    active: status !== 'disabled',
    enforce: status === 'enabled',
  };
}

export async function isFlagActive(svc: any, clinic_id: string, key: string): Promise<boolean> {
  const rule = await getClinicRule(svc, clinic_id, key);
  return rule.active;
}

export function configMatches(config: Record<string, any>, treatment: any, extra: Record<string, any> = {}): boolean {
  const treatmentIds = Array.isArray(config.treatment_ids) ? config.treatment_ids.map(String).filter(Boolean) : [];
  const treatmentNames = Array.isArray(config.treatment_names) ? config.treatment_names.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
  const staffNames = Array.isArray(config.staff_names) ? config.staff_names.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
  const treatmentMatch = (!treatmentIds.length && !treatmentNames.length)
    || treatmentIds.includes(String(treatment?.id))
    || treatmentNames.includes(String(treatment?.name || '').toLowerCase());
  const staffName = String(extra.staff_name || '').toLowerCase();
  const staffMatch = !staffNames.length || staffNames.includes(staffName);
  return treatmentMatch && staffMatch;
}
