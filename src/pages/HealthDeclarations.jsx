import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Eye, Trash2, HeartPulse, ArrowLeft } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const emptyForm = {
  customer_id: "",
  booking_id: "",
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

const textFields = [
  { key: "allergies", label: "Allergier", placeholder: "t.ex. latex, lokalbedövning, penicillin" },
  { key: "medications", label: "Nuvarande mediciner", placeholder: "Ange mediciner och dosering" },
  { key: "conditions", label: "Kroniska sjukdomar", placeholder: "t.ex. epilepsi, sköldkörtelbesvär" },
  { key: "surgeries", label: "Tidigare operationer", placeholder: "Vilka och när" },
  { key: "family_history", label: "Familjehistorik", placeholder: "Ärftliga sjukdomar i familjen" },
  { key: "other", label: "Övrigt", placeholder: "Annat som är relevant för behandlingen" },
];

const checkFields = [
  { key: "pregnant", label: "Gravid" },
  { key: "breastfeeding", label: "Ammar" },
  { key: "heart_condition", label: "Hjärtbesvär" },
  { key: "high_blood_pressure", label: "Hög blodtryck" },
  { key: "diabetes", label: "Diabetes" },
  { key: "asthma", label: "Astmabesvär" },
  { key: "skin_condition", label: "Hudbesvär" },
  { key: "smoking", label: "Rökning" },
];

const userName = async () => {
  try { const me = await base44.auth.me(); return me?.full_name || me?.email || ""; } catch { return ""; }
};

export default function HealthDeclarations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [customers, setCustomers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.HealthDeclaration.filter({}, { sort: "-submitted_at", limit: 100 });
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = async () => {
    setForm(emptyForm);
    const [c, b] = await Promise.all([
      base44.entities.Customer.filter({}, { limit: 200 }),
      base44.entities.Booking.filter({}, { limit: 200, sort: "-start_time" }),
    ]);
    setCustomers(c.items || []);
    setBookings(b.items || []);
    setOpen(true);
  };

  const setF = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));
  const setCheck = (f, v) => setForm((s) => ({ ...s, [f]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const cust = customers.find((c) => c.id === form.customer_id);
      const name = await userName();
      await base44.entities.HealthDeclaration.create({
        clinic_id,
        customer_id: form.customer_id,
        customer_name: cust?.name || "",
        booking_id: form.booking_id || undefined,
        submitted_at: new Date().toISOString(),
        submitted_by: name || "Okänd",
        status: "submitted",
        allergies: form.allergies || undefined,
        medications: form.medications || undefined,
        conditions: form.conditions || undefined,
        surgeries: form.surgeries || undefined,
        family_history: form.family_history || undefined,
        other: form.other || undefined,
        pregnant: !!form.pregnant,
        breastfeeding: !!form.breastfeeding,
        heart_condition: !!form.heart_condition,
        high_blood_pressure: !!form.high_blood_pressure,
        diabetes: !!form.diabetes,
        asthma: !!form.asthma,
        skin_condition: !!form.skin_condition,
        smoking: !!form.smoking,
      });
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h) => {
    if (confirm(`Ta bort hälsodeklarationen för ${h.customer_name}?`)) {
      await base44.entities.HealthDeclaration.delete(h.id);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Hälsodeklarationer</h1>
          <p className="text-sm text-muted-foreground">Strukturerad medicinsk historik kopplad till kundens profil.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny hälsodeklaration</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <HeartPulse className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Inga hälsodeklarationer</p>
          <p className="mt-1 text-sm text-muted-foreground">Skapa den första för en kund.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"><HeartPulse className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{h.customer_name}</p>
                <p className="truncate text-sm text-muted-foreground">{fmtDateTime(h.submitted_at)}{h.submitted_by ? ` · ${h.submitted_by}` : ""}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(h)}><Eye className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(h)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}

      {/* Skapa */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny hälsodeklaration</DialogTitle>
            <DialogDescription>Fyll i kundens medicinska historik. Sparas på kundens profil.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Kund</Label>
                <select id="customer_id" value={form.customer_id} onChange={setF("customer_id")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Välj kund…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking_id">Bokning (valfritt)</Label>
                <select id="booking_id" value={form.booking_id} onChange={setF("booking_id")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Ingen bokning</option>
                  {bookings.filter((b) => !form.customer_id || b.customer_id === form.customer_id).map((b) => (
                    <option key={b.id} value={b.id}>{b.treatment_name} · {fmtDateTime(b.start_time)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bakgrund</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {checkFields.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <Checkbox id={`hd-${c.key}`} checked={!!form[c.key]} onCheckedChange={(v) => setCheck(c.key, v)} />
                    <Label htmlFor={`hd-${c.key}`} className="text-sm font-normal">{c.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {textFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Textarea id={f.key} value={form[f.key]} onChange={setF(f.key)} rows={2} placeholder={f.placeholder} />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.customer_id}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Spara</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visa */}
      <Dialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hälsodeklaration · {view?.customer_name}</DialogTitle>
            <DialogDescription>{fmtDateTime(view?.submitted_at)}{view?.submitted_by ? ` · ${view.submitted_by}` : ""}</DialogDescription>
          </DialogHeader>
          {view && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bakgrund</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {checkFields.map((c) => (
                    <div key={c.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <span className={view[c.key] ? "text-emerald-600 font-medium" : "text-muted-foreground"}>{view[c.key] ? "Ja" : "Nej"}</span>
                      <span className="text-muted-foreground">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {textFields.map((f) => (
                  <div key={f.key} className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{view[f.key] || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}