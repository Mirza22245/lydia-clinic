import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, ShieldAlert } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";

const typeLabels = { biverkning: "Biverkning", komplikation: "Komplikation", avvikelse: "Avvikelse", infektion: "Infektion", asymmetri: "Asymmetri", allergisk_reaktion: "Allergisk reaktion", vascular_komplikation: "Vaskulär komplikation", annan: "Annan" };
const severityColors = { lindrig: "bg-yellow-100 text-yellow-700", måttlig: "bg-orange-100 text-orange-700", allvarlig: "bg-red-100 text-red-700" };
const severityLabels = { lindrig: "Lindrig", måttlig: "Måttlig", allvarlig: "Allvarlig" };
const reportingLabels = { ej_rapporterad: "Ej rapporterad", rapporterad_intern: "Rapporterad intern", rapporterad_ivo: "Rapporterad till IVO", rapporterad_socialstyrelsen: "Rapporterad till Socialstyrelsen", stangd: "Stängd" };

// Komplikations- och avvikelsemodul för att spåra biverkningar, komplikationer
// och incidenter kopplade till en behandling.
export default function ComplicationPanel({ customerId, customerName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.Complication.filter({ customer_id: customerId }, { sort: "-date", limit: 50 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ complication_type: "komplikation", date: new Date().toISOString().slice(0, 16), severity: "lindrig", description: "", action_taken: "", responsible_person: "", follow_up_date: "", outcome: "", reporting_status: "ej_rapporterad", treatment_name: "" });
    setOpen(true);
  };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities.Complication.create({ ...form, customer_id: customerId, customer_name: customerName, clinic_id });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Laddar komplikationer...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="w-4 h-4" />Komplikationer & avvikelser</h3>
        <Button size="sm" variant="outline" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny</Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga registrerade komplikationer eller avvikelser.</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", severityColors[c.severity] || "bg-slate-100 text-slate-600")}>{severityLabels[c.severity] || c.severity}</span>
                  <span className="text-sm font-medium">{typeLabels[c.complication_type] || c.complication_type}</span>
                  {c.treatment_name && <span className="text-xs text-muted-foreground">— {c.treatment_name}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{new Date(c.date).toLocaleDateString("sv-SE")}</span>
              </div>
              {c.description && <p className="mt-2 text-sm">{c.description}</p>}
              {c.action_taken && <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium">Åtgärd:</span> {c.action_taken}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {c.responsible_person && <span>Ansvarig: {c.responsible_person}</span>}
                {c.follow_up_date && <span>Uppföljning: {c.follow_up_date}</span>}
                {c.outcome && <span>Resultat: {c.outcome}</span>}
                <span className="font-medium text-foreground">{reportingLabels[c.reporting_status] || c.reporting_status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ny komplikation / avvikelse</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Typ</Label><select value={form.complication_type} onChange={set("complication_type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1"><Label className="text-xs">Svårighetsgrad</Label><select value={form.severity} onChange={set("severity")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(severityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Datum</Label><Input type="datetime-local" value={form.date} onChange={set("date")} required /></div>
              <div className="space-y-1"><Label className="text-xs">Behandling</Label><Input value={form.treatment_name} onChange={set("treatment_name")} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Beskrivning</Label><Textarea value={form.description} onChange={set("description")} rows={3} required /></div>
            <div className="space-y-1"><Label className="text-xs">Åtgärd</Label><Textarea value={form.action_taken} onChange={set("action_taken")} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Ansvarig</Label><Input value={form.responsible_person} onChange={set("responsible_person")} /></div>
              <div className="space-y-1"><Label className="text-xs">Uppföljningsdatum</Label><Input type="date" value={form.follow_up_date} onChange={set("follow_up_date")} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Resultat</Label><Input value={form.outcome} onChange={set("outcome")} /></div>
            <div className="space-y-1"><Label className="text-xs">Rapporteringsstatus</Label><select value={form.reporting_status} onChange={set("reporting_status")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(reportingLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Spara</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}