const DEFAULT_KEYS = ['cash_register','waiting_periods','age_verification','treatment_information','staff_licensing','radiation_compliance','incident_management','hygiene_checks','inventory_lots','staff_attendance','communication_rules','booking_rules'];

function parseConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

export async function getClinicRules(client, clinicId) {
  const result = await client.query(
    "SELECT id, data, clinic_id FROM e_feature_flag WHERE clinic_id = $1 AND data->>'key' = ANY($2::text[])",
    [clinicId, DEFAULT_KEYS]
  );
  const rules = {};
  for (const row of result.rows) {
    const data = row.data || {};
    rules[data.key] = {
      id: row.id,
      key: data.key,
      status: data.status || 'disabled',
      config: parseConfig(data.config),
      clinic_id: row.clinic_id,
    };
  }
  return rules;
}

export function ruleActive(rules, key) {
  const status = rules?.[key]?.status;
  return status === 'enabled' || status === 'test';
}

export function ruleEnforced(rules, key) {
  return rules?.[key]?.status === 'enabled';
}

export function matchesTreatment(config, treatment) {
  const ids = Array.isArray(config?.treatment_ids) ? config.treatment_ids.map(String) : [];
  const names = Array.isArray(config?.treatment_names) ? config.treatment_names.map(x => String(x).toLowerCase()) : [];
  if (!ids.length && !names.length) return true;
  return ids.includes(String(treatment?.id)) || names.includes(String(treatment?.name || '').toLowerCase());
}
