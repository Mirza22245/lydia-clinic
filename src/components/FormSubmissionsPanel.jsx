import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ClipboardCheck, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const typeLabels = { health_declaration: "Hälsodeklaration", consent: "Samtycke", custom: "Annat" };
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const parseAnswers = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
const parseQuestions = (str) => { try { const a = JSON.parse(str || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

export default function FormSubmissionsPanel({ customerId }) {
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewSub, setViewSub] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        base44.entities.FormSubmission.filter({ customer_id: customerId }, { sort: "-submitted_at", limit: 100 }),
        base44.entities.FormTemplate.filter({}, { limit: 200 }),
      ]);
      setItems(s.items || []);
      setTemplates(t.items || []);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold font-heading">Formulär</h2>
        <p className="text-sm text-muted-foreground">Hälsodeklarationer och samtyckesformulär kunden fyllt i.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga ifyllda formulär för denna kund.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => {
            const tpl = templates.find((t) => t.id === s.template_id);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"><ClipboardCheck className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.template_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{fmtDateTime(s.submitted_at)}{s.submitted_by ? ` · ${s.submitted_by}` : ""}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Inlämnad</span>
                <button onClick={() => setViewSub({ ...s, _tpl: tpl })} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><Eye className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewSub} onOpenChange={(o) => { if (!o) setViewSub(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewSub?.template_name}</DialogTitle>
            <DialogDescription>{viewSub?.customer_name} · {fmtDateTime(viewSub?.submitted_at)}</DialogDescription>
          </DialogHeader>
          {(() => {
            if (!viewSub) return null;
            const qs = viewSub._tpl ? parseQuestions(viewSub._tpl.questions) : [];
            const ans = parseAnswers(viewSub.answers);
            return (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {qs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga frågor hittades.</p>
                ) : qs.map((q, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">{q.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {q.type === "checkbox" ? (ans[i] ? "Ja" : "Nej") : (ans[i] || "—")}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}