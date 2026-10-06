import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldOff, Check, X, History } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

const CONSENT_TYPES = [
  { key: "treatment", label: "Behandling", text: "Jag samtycker till att genomföra den valda behandlingen." },
  { key: "journal", label: "Journalföring", text: "Jag samtycker till att mina uppgifter journalförs enligt gällande regler." },
  { key: "photography", label: "Fotografering", text: "Jag samtycker till att bilder tas i samband med behandling." },
  { key: "image_use", label: "Användning av bilder", text: "Jag samtycker till att bilder får användas för marknadsföring." },
  { key: "communication", label: "Kommunikation (SMS/e-post)", text: "Jag samtycker till att ta emot bokningsbekräftelser och påminnelser via SMS och e-post." },
  { key: "marketing", label: "Marknadsföring", text: "Jag samtycker till att ta emot marknadsföringserbjudanden." },
];

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const userName = async () => {
  try {
    const me = await base44.auth.me();
    return me?.full_name || me?.email || "";
  } catch {
    return "";
  }
};

export default function ConsentsPanel({ customerId, customerName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Consent.filter({ customer_id: customerId }, { sort: "-created_date", limit: 200 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const activeFor = (type) => {
    const records = items
      .filter((c) => c.type === type)
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
    return records.find((r) => r.granted && !r.revoked_at) || null;
  };

  const grant = async (type) => {
    setBusy(type);
    try {
      const clinic_id = await getClinicId();
      const def = CONSENT_TYPES.find((t) => t.key === type);
      const name = await userName();
      await base44.entities.Consent.create({
        clinic_id,
        customer_id: customerId,
        customer_name: customerName || "",
        type,
        version: 1,
        text: def?.text || "",
        granted: true,
        granted_at: new Date().toISOString(),
        granted_by: name || "Okänd",
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (type) => {
    const active = activeFor(type);
    if (!active) return;
    setBusy(type);
    try {
      await base44.functions.invoke('revokeConsent', { consent_id: active.id });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const history = items.slice().sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold font-heading">Samtycken</h2>
        <p className="text-sm text-muted-foreground">Hantera och logga kundens samtycken med datum och historik.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {CONSENT_TYPES.map((t) => {
            const active = activeFor(t.key);
            return (
              <div key={t.key} className={cn("rounded-xl border bg-card p-4", active ? "border-emerald-200" : "border-border")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {active ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                      <p className="font-medium">{t.label}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.text}</p>
                    {active && <p className="mt-2 text-xs text-emerald-700">Lämnat {fmtDateTime(active.granted_at)}{active.granted_by ? ` · ${active.granted_by}` : ""}</p>}
                  </div>
                  {active ? (
                    <Button size="sm" variant="outline" disabled={busy === t.key} onClick={() => revoke(t.key)}>
                      {busy === t.key ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
                      Återkalla
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy === t.key} onClick={() => grant(t.key)}>
                      {busy === t.key ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                      Lämna
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium"><History className="w-4 h-4" />Historik</p>
          <div className="space-y-2">
            {history.map((c) => {
              const def = CONSENT_TYPES.find((t) => t.key === c.type);
              const isActive = c.granted && !c.revoked_at;
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                    {def?.label || c.type}
                  </span>
                  <span className="text-muted-foreground">
                    {isActive ? "Lämnat" : c.revoked_at ? "Återkallat" : "Ej lämnat"} {fmtDateTime(c.revoked_at || c.granted_at || c.created_date)}
                    {c.granted_by ? ` · ${c.granted_by}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}