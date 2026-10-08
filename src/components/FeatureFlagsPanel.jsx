import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Check, FlaskConical, ToggleLeft, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeatureFlags, refreshFlags } from '@/hooks/useFeatureFlags';

const statusConfig = {
  enabled: { label: 'PÅ', icon: Check, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  test: { label: 'TEST', icon: FlaskConical, cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  disabled: { label: 'AV', icon: ToggleLeft, cls: 'bg-muted text-muted-foreground border-border' },
};

const moduleLabels = {
  core: 'Kärnsystem',
  clinical: 'Kliniskt',
  communication: 'Kommunikation',
  commerce: 'Handel',
  marketing: 'Marknadsföring',
  integration: 'Integrationer',
  saas: 'SaaS',
};

// Admin-panel för att hantera feature flags. Cyklar status mellan
// disabled → test → enabled → disabled vid klick. Auditas server-side.
export default function FeatureFlagsPanel() {
  const { flags, loading } = useFeatureFlags();
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const flagList = Object.values(flags || {}).sort(
    (a, b) => (a.module || '').localeCompare(b.module || '') || (a.key || '').localeCompare(b.key || '')
  );

  const cycle = async (flag) => {
    const order = ['disabled', 'test', 'enabled'];
    const next = order[(order.indexOf(flag.status) + 1) % order.length];
    setUpdating(flag.id);
    setError(null);
    try {
      await base44.functions.invoke('updateFeatureFlag', { flag_id: flag.id, status: next, config: flag.config || '{}' });
      await refreshFlags();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Kunde inte uppdatera');
    } finally {
      setUpdating(null);
    }
  };

  const saveConfig = async (flag, config) => {
    setUpdating(flag.id);
    setError(null);
    try {
      await base44.functions.invoke('updateFeatureFlag', { flag_id: flag.id, status: flag.status || 'disabled', config });
      await refreshFlags();
      setEditing(null);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Kunde inte spara inställningen');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  // Gruppera per modul
  const byModule = {};
  for (const f of flagList) {
    const mod = f.module || 'core';
    if (!byModule[mod]) byModule[mod] = [];
    byModule[mod].push(f);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">Moduler & Feature Flags</h2>
        <p className="text-sm text-muted-foreground">
          Aktivera eller stäng av moduler. Ändringar gäller omedelbart — klicka för att cykla: AV → TEST → PÅ.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {Object.entries(byModule).map(([mod, list]) => (
        <div key={mod} className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {moduleLabels[mod] || mod}
          </p>
          <div className="space-y-2">
            {list.map((f) => {
              const cfg = statusConfig[f.status] || statusConfig.disabled;
              const Icon = cfg.icon;
              let requiredSecrets = [];
              try { requiredSecrets = JSON.parse(f.required_secrets || '[]'); } catch { /* */ }
              return (
                <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{f.label}</p>
                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                    {f.requires_external && requiredSecrets.length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        Kräver: {requiredSecrets.join(', ')}
                      </p>
                    )}
                    {f.activation_instructions && f.status === 'disabled' && (
                      <p className="mt-1 text-xs text-muted-foreground">{f.activation_instructions}</p>
                    )}
                    {['cash_register','waiting_periods','age_verification','treatment_information','staff_licensing','radiation_compliance','incident_management','hygiene_checks','inventory_lots','staff_attendance','communication_rules','booking_rules'].includes(f.key) && editing === f.id && (
                      <RuleConfig flag={f} onSave={(config) => saveConfig(f, config)} onCancel={() => setEditing(null)} />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                  {['cash_register','waiting_periods','age_verification','treatment_information','staff_licensing','radiation_compliance','incident_management','hygiene_checks','inventory_lots','staff_attendance','communication_rules','booking_rules'].includes(f.key) && (
                    <button type="button" onClick={() => setEditing(editing === f.id ? null : f.id)} className="rounded-full border border-border p-2 text-muted-foreground hover:bg-accent" title="Konfigurera">
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cycle(f)}
                    disabled={updating === f.id}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80',
                      cfg.cls
                    )}
                  >
                    {updating === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                    {cfg.label}
                  </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleConfig({ flag, onSave, onCancel }) {
  const known = ['waiting_periods','age_verification','booking_rules','staff_licensing'];
  let initial = {};
  try { initial = typeof flag.config === 'string' ? JSON.parse(flag.config || '{}') : (flag.config || {}); } catch { initial = {}; }
  const [json, setJson] = useState(JSON.stringify(initial, null, 2));
  const [localError, setLocalError] = useState(null);
  const presets = {
    waiting_periods: { days: 2, treatment_ids: [] },
    age_verification: { minimum_age: 18, treatment_ids: [] },
    booking_rules: { min_lead_hours: 0, max_days: 0, treatment_ids: [] },
    staff_licensing: { required_license_types: [], treatment_ids: [] },
  };
  const usePreset = () => setJson(JSON.stringify(presets[flag.key] || initial, null, 2));
  return <div className="mt-2 rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
    <p className="text-xs font-medium">Konfiguration för {flag.label}</p>
    {known.includes(flag.key) && <button type="button" className="text-xs underline" onClick={usePreset}>Ladda säker standard</button>}
    <textarea value={json} onChange={e=>setJson(e.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background px-2 py-2 font-mono text-xs" spellCheck={false}/>
    {localError && <p className="text-xs text-destructive">{localError}</p>}
    <div className="flex gap-2">
      <button type="button" className="rounded-md border px-3 py-1.5 text-xs" onClick={onCancel}>Avbryt</button>
      <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground" onClick={() => { try { const v=JSON.parse(json); if(!v || typeof v!=='object' || Array.isArray(v)) throw new Error('Konfigurationen måste vara JSON-objekt'); onSave(v); } catch(e) { setLocalError(e.message); } }}>Spara</button>
    </div>
  </div>;
}
