import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, HeartPulse, Eye } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

const emptyForm = {
  allergies: "",
  medications: "",
  conditions: "",
  surgeries: "",
  family_history: "",
  other: "",
  pregnant: false,
  breastfeeding: false,
  heart_condition: false,
  high_blood_pressure: false,
  diabetes: false,
  asthma: false,
  skin_condition: false,
  smoking: false,
};

export default function HealthDeclarationsPanel({ customerId, customerName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.HealthDeclaration.filter(
        { customer_id: customerId },
        { sort: "-submitted_at", limit: 50 }
      );
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-rose-600" />
          <h2 className="text-lg font-semibold font-heading">Hälsodeklarationer</h2>
        </div>
        <span className="text-sm text-muted-foreground">{items.length} st</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Inga hälsodeklarationer för {customerName} än.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{fmtDateTime(h.submitted_at)}</p>
                {h.submitted_by && <p className="text-xs text-muted-foreground">Inlämnad av {h.submitted_by}</p>}
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(h)}><Eye className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}

      {view && <DeclarationView decl={view} onClose={() => setView(null)} />}
    </div>
  );
}

function DeclarationView({ decl, onClose }) {
  const fields = [
    { key: "allergies", label: "Allergier" },
    { key: "medications", label: "Nuvarande mediciner" },
    { key: "conditions", label: "Kroniska sjukdomar" },
    { key: "surgeries", label: "Tidigare operationer" },
    { key: "family_history", label: "Familjehistorik" },
    { key: "other", label: "Övrigt" },
  ];
  const checks = [
    { key: "pregnant", label: "Gravid" },
    { key: "breastfeeding", label: "Ammar" },
    { key: "heart_condition", label: "Hjärtbesvär" },
    { key: "high_blood_pressure", label: "Hög blodtryck" },
    { key: "diabetes", label: "Diabetes" },
    { key: "asthma", label: "Astmabesvär" },
    { key: "skin_condition", label: "Hudbesvär" },
    { key: "smoking", label: "Rökning" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold font-heading">Hälsodeklaration</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>Stäng</Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(decl.submitted_at)}{decl.submitted_by ? ` · ${decl.submitted_by}` : ""}</p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bakgrund</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {checks.map((c) => (
                <div key={c.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className={decl[c.key] ? "text-emerald-600" : "text-muted-foreground"}>{decl[c.key] ? "Ja" : "Nej"}</span>
                  <span className="text-muted-foreground">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.key} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{decl[f.key] || "—"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}