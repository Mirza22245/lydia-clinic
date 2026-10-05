import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Clock, ShieldCheck } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";

const empty = {
  name: "", description: "", duration: 30, price: 0, category: "", vat: 25,
  treatment_type: "annan", betanketid_hours: 0, information_version: "", repeat_treatment_months: 0,
  requires_identity_verification: false, requires_ordination: false,
  requires_health_declaration: false, requires_consent: true, requires_treatment_info: false,
  requires_aftercare: false, requires_payment: false, guest_booking_allowed: true,
  min_age: 0, waiting_period_days: 0, cancellation_hours: 24, no_show_fee: 0, required_form_ids: "",
};
const numFields = new Set(["duration", "price", "vat", "min_age", "waiting_period_days", "cancellation_hours", "no_show_fee", "betanketid_hours", "repeat_treatment_months"]);
const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n || 0);

const ruleBadges = (t) => {
  const out = [];
  if (t.requires_health_declaration) out.push("Hälsodekl.");
  if (t.requires_consent) out.push("Samtycke");
  if (t.requires_treatment_info) out.push("Riskinfo");
  if (t.requires_aftercare) out.push("Eftervård");
  if (t.requires_payment) out.push("Betalning");
  if (t.min_age > 0) out.push(`≥${t.min_age} år`);
  if (t.waiting_period_days > 0) out.push(`Vänt ${t.waiting_period_days}d`);
  if (!t.guest_booking_allowed) out.push("Ej gäst");
  if (t.treatment_type === "injektion") out.push("Injektion");
  if (t.betanketid_hours > 0) out.push(`Betänketid ${t.betanketid_hours}h`);
  return out;
};

export default function Treatments() {
  const [items, setItems] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const clinic_id = await getClinicId();
      const [tp, ft] = await Promise.all([
        base44.entities.Treatment.filter({}, { sort: "name", limit: 100 }),
        clinic_id ? base44.entities.FormTemplate.filter({ clinic_id }, { sort: "name", limit: 100 }) : Promise.resolve({ items: [] }),
      ]);
      setItems(tp.items || []);
      setForms(ft.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ ...empty, ...t, required_form_ids: t.required_form_ids || "" });
    setOpen(true);
  };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: numFields.has(f) ? Number(e.target.value) : e.target.value }));
  const toggle = (f) => (val) => setForm((s) => ({ ...s, [f]: val }));

  const selectedFormIds = () => {
    try { return JSON.parse(form.required_form_ids || "[]"); } catch { return []; }
  };
  const toggleForm = (id) => {
    const cur = selectedFormIds();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setForm((s) => ({ ...s, required_form_ids: JSON.stringify(next) }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = { ...form, clinic_id, description: form.description || undefined, category: form.category || undefined, required_form_ids: form.required_form_ids || undefined };
      if (editing) await base44.entities.Treatment.update(editing.id, data);
      else await base44.entities.Treatment.create(data);
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (confirm(`Ta bort behandlingen "${t.name}"?`)) {
      await base44.entities.Treatment.delete(t.id);
      await load();
    }
  };

  const switches = [
    { key: "requires_health_declaration", label: "Hälsodeklaration" },
    { key: "requires_consent", label: "Samtycke" },
    { key: "requires_treatment_info", label: "Behandlingsinformation & risker" },
    { key: "requires_aftercare", label: "Eftervårdsinformation" },
    { key: "requires_payment", label: "Betalning vid bokning" },
    { key: "guest_booking_allowed", label: "Tillåt gästbokning" },
    { key: "requires_identity_verification", label: "Kräv identitetsverifiering" },
    { key: "requires_ordination", label: "Kräv läkarordination" },
  ];
  const nums = [
    { key: "min_age", label: "Lägsta ålder (år)", step: 1 },
    { key: "waiting_period_days", label: "Väntetid (dagar)", step: 1 },
    { key: "cancellation_hours", label: "Avgiftsfri avbokning (timmar)", step: 1 },
    { key: "no_show_fee", label: "No-show-avgift (kr)", step: 50 },
    { key: "betanketid_hours", label: "Betänketid (timmar)", step: 1 },
    { key: "repeat_treatment_months", label: "Upprepningskontroll (månader)", step: 1 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Behandlingar</h1>
          <p className="text-sm text-muted-foreground">Definiera behandlingar, priser och bokningsregler.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny behandling</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga behandlingar</p>
          <p className="mt-1 text-sm text-muted-foreground">Lägg till din första behandling.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const badges = ruleBadges(t);
            return (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(t)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-semibold">{fmtSEK(t.price)}</span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="w-3.5 h-3.5" />{t.duration || 0} min</span>
                </div>
                {t.description && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                {badges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {badges.map((b) => (
                      <span key={b} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"><ShieldCheck className="w-3 h-3" />{b}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera behandling" : "Ny behandling"}</DialogTitle>
            <DialogDescription>{editing ? "Uppdatera behandlingen och dess bokningsregler." : "Lägg till en ny behandling."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Namn</Label><Input id="name" value={form.name} onChange={set("name")} required autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="description">Beskrivning</Label><Textarea id="description" value={form.description} onChange={set("description")} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="duration">Längd (min)</Label><Input id="duration" type="number" min="5" step="5" value={form.duration} onChange={set("duration")} /></div>
              <div className="space-y-2"><Label htmlFor="price">Pris (kr)</Label><Input id="price" type="number" min="0" step="50" value={form.price} onChange={set("price")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="category">Kategori</Label><Input id="category" value={form.category} onChange={set("category")} placeholder="t.ex. Injektion" /></div>
              <div className="space-y-2"><Label htmlFor="vat">Moms (%)</Label><Input id="vat" type="number" min="0" max="100" value={form.vat} onChange={set("vat")} /></div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-sm font-medium">Behandlingstyp & IVO-compliance</p>
              <p className="text-xs text-muted-foreground">För injektionsbehandlingar kräver IVO åldersgräns 18+, betänketid och samtycke efter betänketid.</p>
              <div className="space-y-1.5">
                <Label htmlFor="treatment_type" className="text-xs">Behandlingstyp</Label>
                <select id="treatment_type" value={form.treatment_type} onChange={set("treatment_type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="annan">Annan</option>
                  <option value="injektion">Injektion</option>
                  <option value="kirurgi">Kirurgi</option>
                  <option value="laser">Laser</option>
                  <option value="hud">Hud</option>
                  <option value="massage">Massage</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="information_version" className="text-xs">Informationsversion</Label>
                <Input id="information_version" value={form.information_version} onChange={set("information_version")} placeholder="t.ex. v1.0 — vilken info patienten fick" />
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-sm font-medium">Bokningsregler & krav</p>
              <p className="text-xs text-muted-foreground">Systemet kontrollerar automatiskt ålder och väntetid vid bokning. Övriga krav visas för kunden och måste kompletteras i kundportalen innan behandling.</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {switches.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <Label htmlFor={s.key} className="text-sm">{s.label}</Label>
                    <Switch id={s.key} checked={!!form[s.key]} onCheckedChange={toggle(s.key)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {nums.map((n) => (
                  <div key={n.key} className="space-y-1.5">
                    <Label htmlFor={n.key} className="text-xs">{n.label}</Label>
                    <Input id={n.key} type="number" min="0" step={n.step} value={form[n.key]} onChange={set(n.key)} />
                  </div>
                ))}
              </div>
            </div>

            {forms.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium">Obligatoriska formulär</p>
                <div className="space-y-2">
                  {forms.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={selectedFormIds().includes(f.id)} onCheckedChange={() => toggleForm(f.id)} />
                      <span className="text-sm">{f.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}