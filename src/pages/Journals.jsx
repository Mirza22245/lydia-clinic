import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Lock, PenLine, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";
import { logAudit } from "@/lib/audit";
import { signJournalEntry } from "@/functions/signJournalEntry";

const emptyForm = {
  booking_id: "", customer_id: "", customer_name: "", treatment_id: "", treatment_name: "",
  provider: "", entry_date: "", notes: "", observations: "", assessment: "",
  treatment_performed: "", aftercare: "", recommendations: "",
};

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const filters = [
  { key: "all", label: "Alla" },
  { key: "unsigned", label: "Osignerade" },
  { key: "signed", label: "Signerade" },
];

export default function Journals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editing, setEditing] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (filter === "unsigned") query.is_signed = false;
      else if (filter === "signed") query.is_signed = true;
      const page = await base44.entities.JournalEntry.filter(query, { sort: "-entry_date", limit: 50 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get("booking_id");
    const customerId = params.get("customer_id");
    const treatmentId = params.get("treatment_id");
    if (bookingId || customerId) {
      (async () => {
        const name = await currentUserName();
        await fetchOptions();
        setForm({
          ...emptyForm,
          booking_id: bookingId || "",
          customer_id: customerId || "",
          treatment_id: treatmentId || "",
          provider: name,
          entry_date: toLocalInput(new Date().toISOString()),
        });
        setMode("create");
        setEditing(null);
        setOpen(true);
      })();
    }
  }, []);

  const fetchOptions = async () => {
    const [c, t] = await Promise.all([
      base44.entities.Customer.filter({}, { limit: 200 }),
      base44.entities.Treatment.filter({}, { limit: 200 }),
    ]);
    setCustomers(c.items || []);
    setTreatments(t.items || []);
  };

  const currentUserName = async () => {
    try {
      const me = await base44.auth.me();
      return me?.full_name || me?.email || "";
    } catch {
      return "";
    }
  };

  const openCreate = async () => {
    setMode("create"); setEditing(null);
    const name = await currentUserName();
    setForm({ ...emptyForm, provider: name, entry_date: toLocalInput(new Date().toISOString()) });
    await fetchOptions();
    setOpen(true);
  };
  const openEdit = async (j) => {
    setMode("edit"); setEditing(j);
    setForm({ ...emptyForm, ...j, entry_date: j.entry_date ? toLocalInput(j.entry_date) : "" });
    await fetchOptions();
    setOpen(true);
  };
  const openAmend = async (j) => {
    setMode("amend"); setEditing(null);
    setForm({
      ...emptyForm, ...j,
      parent_id: j.id,
      version: (j.version || 1) + 1,
      is_signed: false,
      signed_at: undefined,
      signed_by: undefined,
      entry_date: toLocalInput(new Date().toISOString()),
    });
    await fetchOptions();
    setOpen(true);
  };

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.entry_date) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const cust = customers.find((x) => x.id === form.customer_id);
      const treat = treatments.find((x) => x.id === form.treatment_id);
      const data = {
        clinic_id,
        booking_id: form.booking_id || undefined,
        customer_id: form.customer_id,
        customer_name: cust?.name || form.customer_name || "",
        treatment_id: form.treatment_id || undefined,
        treatment_name: treat?.name || form.treatment_name || "",
        provider: form.provider || undefined,
        entry_date: new Date(form.entry_date).toISOString(),
        notes: form.notes || undefined,
        observations: form.observations || undefined,
        assessment: form.assessment || undefined,
        treatment_performed: form.treatment_performed || undefined,
        aftercare: form.aftercare || undefined,
        recommendations: form.recommendations || undefined,
      };
      if (mode === "edit" && editing) {
        await base44.entities.JournalEntry.update(editing.id, data);
        await logAudit("journal_update", "JournalEntry", editing.id, `Journal för ${data.customer_name} uppdaterad`, { customer_id: data.customer_id });
      } else {
        if (mode === "amend") {
          data.parent_id = form.parent_id;
          data.version = form.version;
        } else {
          data.version = 1;
        }
        const created = await base44.entities.JournalEntry.create(data);
        await logAudit(mode === "amend" ? "journal_amend" : "journal_create", "JournalEntry", created.id, `${mode === "amend" ? `Ny version (v${data.version}) för` : "Journal skapad för"} ${data.customer_name}`, { customer_id: data.customer_id, parent_id: data.parent_id });
      }
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const sign = async (j) => {
    try {
      await signJournalEntry({ journal_id: j.id });
      await load();
    } catch {
      // Swallow: fel vid signering visas inte för användaren här.
    }
  };

  const remove = async (j) => {
    if (confirm("Ta bort journalanteckningen?")) {
      await base44.entities.JournalEntry.delete(j.id);
      await logAudit("journal_delete", "JournalEntry", j.id, `Journal för ${j.customer_name} borttagen`, { customer_id: j.customer_id });
      await load();
    }
  };

  const field = (id, label, opts = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {opts.area ? (
        <Textarea id={id} value={form[id]} onChange={set(id)} rows={opts.rows || 2} />
      ) : (
        <Input id={id} value={form[id]} onChange={set(id)} type={opts.type || "text"} />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Journal</h1>
          <p className="text-sm text-muted-foreground">Skriv, signera och versionshantera journalanteckningar.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny journal</Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga journalanteckningar</p>
          <p className="mt-1 text-sm text-muted-foreground">Skapa din första journalanteckning.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((j) => (
            <div key={j.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{j.customer_name}</p>
                    {j.parent_id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                        <ScrollText className="w-3 h-3" /> v{j.version} rättelse
                      </span>
                    )}
                    {!j.parent_id && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">v{j.version || 1}</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {j.treatment_name || "Ingen behandling"} · {fmtDate(j.entry_date)}{j.provider ? ` · ${j.provider}` : ""}
                  </p>
                </div>
                {j.is_signed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <Lock className="w-3 h-3" /> Signerad
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <PenLine className="w-3 h-3" /> Osignerad
                  </span>
                )}
              </div>

              {j.notes && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{j.notes}</p>}

              {j.is_signed && (
                <p className="mt-2 text-xs text-muted-foreground">Signerad {fmtDate(j.signed_at)}{j.signed_by ? ` av ${j.signed_by}` : ""}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {!j.is_signed && (
                  <>
                    <Button size="sm" onClick={() => sign(j)}><PenLine className="w-4 h-4 mr-1" />Signera</Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(j)}><Pencil className="w-4 h-4 mr-1" />Redigera</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(j)}><Trash2 className="w-4 h-4 mr-1" />Ta bort</Button>
                  </>
                )}
                {j.is_signed && (
                  <Button size="sm" variant="outline" onClick={() => openAmend(j)}><ScrollText className="w-4 h-4 mr-1" />Skapa ny version</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Redigera journal" : mode === "amend" ? `Ny version (v${form.version})` : "Ny journalanteckning"}
            </DialogTitle>
            <DialogDescription>
              {mode === "amend"
                ? "Skapa en rättelse. Den ursprungliga versionen behålls oförändrad."
                : "Fyll i journalanteckningen. Signera när du är klar."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Kund</Label>
                <select id="customer_id" value={form.customer_id} onChange={set("customer_id")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Välj kund…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="treatment_id">Behandling</Label>
                <select id="treatment_id" value={form.treatment_id} onChange={set("treatment_id")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Ingen behandling</option>
                  {treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="provider">Behandlare</Label><Input id="provider" value={form.provider} onChange={set("provider")} /></div>
              <div className="space-y-2"><Label htmlFor="entry_date">Datum</Label><Input id="entry_date" type="datetime-local" value={form.entry_date} onChange={set("entry_date")} required /></div>
            </div>
            {field("notes", "Anteckningar", { area: true, rows: 3 })}
            {field("observations", "Observationer", { area: true })}
            {field("assessment", "Bedömning", { area: true })}
            {field("treatment_performed", "Utförd behandling", { area: true })}
            {field("aftercare", "Eftervård", { area: true })}
            {field("recommendations", "Rekommendationer", { area: true })}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.customer_id || !form.entry_date}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === "edit" ? "Spara" : mode === "amend" ? "Skapa version" : "Lägg till"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}