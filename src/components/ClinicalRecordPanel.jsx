import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, Syringe, Lock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";

// Strukturerad behandlingsjournal för injektionsbehandlingar.
// Innehåller produkt, batch/lot, dos, injektionsställen, ordination m.m.
export default function ClinicalRecordPanel({ customerId, customerName, bookingId, treatmentId, treatmentName }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = bookingId ? { customer_id: customerId, booking_id: bookingId } : { customer_id: customerId };
      const r = await base44.entities.ClinicalTreatmentRecord.filter(q, { sort: "-record_date", limit: 50 });
      setRecords(r.items || []);
    } finally { setLoading(false); }
  }, [customerId, bookingId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    const now = new Date().toISOString().slice(0, 16);
    setForm({
      record_date: now, treatment_name: treatmentName || "", treatment_area: "",
      product: "", substance: "", manufacturer: "", batch_lot: "", expiry_date: "",
      dose: "", units: "", injection_sites: "", technique: "", needle_cannula: "",
      ordination_prescriber: "", ordination_date: "", ordination_reference: "",
      aftercare_instructions: "", next_recommended_visit: "", notes: "",
    });
    setOpen(true);
  };

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities.ClinicalTreatmentRecord.create({
        ...form, customer_id: customerId, customer_name: customerName,
        treatment_id: treatmentId || "", booking_id: bookingId || "",
        clinic_id,
      });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Laddar behandlingsjournaler...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Syringe className="w-4 h-4" />Strukturerad behandlingsjournal</h3>
        <Button size="sm" variant="outline" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny journal</Button>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga strukturerade behandlingsjournaler ännu.</p>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.treatment_name || "Behandling"} — {r.treatment_area || "Område ej angivet"}</p>
                {r.is_signed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><Lock className="w-3 h-3" />Signerad</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><FileText className="w-3 h-3" />Osignerad</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(r.record_date).toLocaleString("sv-SE")}{r.provider ? ` · ${r.provider}` : ""}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {r.product && <div><span className="text-muted-foreground">Produkt:</span> {r.product}</div>}
                {r.substance && <div><span className="text-muted-foreground">Substans:</span> {r.substance}</div>}
                {r.batch_lot && <div><span className="text-muted-foreground">Batch/lot:</span> {r.batch_lot}</div>}
                {r.expiry_date && <div><span className="text-muted-foreground">Utgångsdat.:</span> {r.expiry_date}</div>}
                {r.dose && <div><span className="text-muted-foreground">Dos:</span> {r.dose} {r.units || ""}</div>}
                {r.needle_cannula && <div><span className="text-muted-foreground">Nål:</span> {r.needle_cannula}</div>}
                {r.ordination_prescriber && <div><span className="text-muted-foreground">Ordinerad av:</span> {r.ordination_prescriber}</div>}
              </div>
              {r.injection_sites && <p className="mt-2 text-sm"><span className="text-muted-foreground">Injektionsställen:</span> {r.injection_sites}</p>}
              {r.notes && <p className="mt-2 text-sm text-muted-foreground">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ny behandlingsjournal</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Datum</Label><Input type="datetime-local" value={form.record_date} onChange={set("record_date")} required /></div>
              <div className="space-y-1"><Label className="text-xs">Behandlingsområde</Label><Input value={form.treatment_area} onChange={set("treatment_area")} placeholder="t.ex. Panna, kindben" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Produkt</Label><Input value={form.product} onChange={set("product")} placeholder="t.ex. Botox" /></div>
              <div className="space-y-1"><Label className="text-xs">Substans</Label><Input value={form.substance} onChange={set("substance")} placeholder="t.ex. botulinumtoxin" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Tillverkare</Label><Input value={form.manufacturer} onChange={set("manufacturer")} /></div>
              <div className="space-y-1"><Label className="text-xs">Batch/lot</Label><Input value={form.batch_lot} onChange={set("batch_lot")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Utgångsdatum</Label><Input type="date" value={form.expiry_date} onChange={set("expiry_date")} /></div>
              <div className="space-y-1"><Label className="text-xs">Dos + enheter</Label><div className="flex gap-2"><Input value={form.dose} onChange={set("dose")} placeholder="t.ex. 20" /><Input value={form.units} onChange={set("units")} placeholder="IE" /></div></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Injektionsställen</Label><Textarea value={form.injection_sites} onChange={set("injection_sites")} rows={2} placeholder="Beskriv injektionspunkter" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Teknik</Label><Input value={form.technique} onChange={set("technique")} /></div>
              <div className="space-y-1"><Label className="text-xs">Nål/Kanyl</Label><Input value={form.needle_cannula} onChange={set("needle_cannula")} placeholder="t.ex. 30G 1/2" /></div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-medium">Ordination</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Ordinerande läkare</Label><Input value={form.ordination_prescriber} onChange={set("ordination_prescriber")} /></div>
                <div className="space-y-1"><Label className="text-xs">Ordinationsdatum</Label><Input type="date" value={form.ordination_date} onChange={set("ordination_date")} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Ordinationsreferens</Label><Input value={form.ordination_reference} onChange={set("ordination_reference")} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Eftervårdsinstruktioner</Label><Textarea value={form.aftercare_instructions} onChange={set("aftercare_instructions")} rows={2} /></div>
            <div className="space-y-1"><Label className="text-xs">Rekommenderad återbesök</Label><Input type="date" value={form.next_recommended_visit} onChange={set("next_recommended_visit")} /></div>
            <div className="space-y-1"><Label className="text-xs">Anteckningar</Label><Textarea value={form.notes} onChange={set("notes")} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Spara</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}