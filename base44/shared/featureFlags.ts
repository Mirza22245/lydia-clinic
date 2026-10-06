// Server-side kontroll av modulernas feature flags ("Build Now, Activate Later").
// En modul är aktiv när dess flagga är 'enabled' eller 'test'. Saknas flaggan räknas modulen som avstängd.
// Portabel — ingen Base44-import.
export async function isFlagActive(svc: any, clinic_id: string, key: string): Promise<boolean> {
  const page = await svc.entities.FeatureFlag.filter({ clinic_id, key }, { limit: 1 });
  const flag = (page.items || [])[0];
  return !!flag && (flag.status === 'enabled' || flag.status === 'test');
}