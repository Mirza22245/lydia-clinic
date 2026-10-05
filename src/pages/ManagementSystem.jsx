import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, FileCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";

const typeLabels = { rutin: "Rutin", sop: "SOP", policy: "Policy", styrdokument: "Styrdokument", riskanalys: "Riskanalys", egenkontroll: "Egenkontroll", avvikelse: "Avvikelse", incident: "Incident", klagomal: "Klagomål", forbattringsatalgard: "Förbättringsåtgärd" };
const statusLabels = { draft: "Utkast", active: "Aktiv", archived: "Arkiverad" };
const statusColors = { draft: "bg-slate-100 text-slate-600", active: "bg-emerald-100 text-emerald-700", archived: "bg-muted text-muted-foreground" };

const empty = { title: "", type: "rutin", category: "", content: "", responsible_person: "", version: 1, status: "draft", valid_from: "", valid_until: "", annual_review_date: "" };

// Ledningssystem för patientsäkerhetsarbete: rutiner, SOP, policys,
// riskanalyser, avvikelser, incidenter, klagomål och förbättringsåtgärder.
export default function ManagementSystem() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.ManagementDocument.filter({}, { sort: "-created_date", limit: 200 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (d) => { setEditing(d); setForm({ ...empty, ...d }); setOpen(true); };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: f === "version" ? Number(e.target.value) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = { ...form, clinic_id };
      if (editing) await base44.entities.ManagementDocument.update(editing.id, data);
      else await base44.entities.ManagementDocument.create(data);
      setOpen(false);
      setEditing(null);
      await load();
    } finally { setSaving(false); }
  };

  const approve = async (d) => {
    await base44.entities.ManagementDocument.update(d.id, { status: "active", approved_at: new Date().toISOString(), approved_by: "System" });
    await load();
  };

  const remove = async (d) => {
    if (confirm(`Ta bort "${d.title}"?`)) { await base44.entities.ManagementDocument.delete(d.id); await load(); }
  };

  const filtered = filter === "all" ? items : items.filter((d) => d.type === filter);
  const typeCounts = items.reduce((acc, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Ledningssystem</h1>
          <p className="text-sm text-muted-foreground">Rutiner, policys, avvikelser, incidenter och patientsäkerhetsarbete.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nytt dokument</Button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>Alla ({items.length})</button>
        {Object.entries(typeLabels).map(([k, v]) => typeCounts[k] ? (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>{v} ({typeCounts[k]})</button>
        ) : null)}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga dokument</p>
          <p className="mt-1 text-sm text-muted-foreground">Skapa rutiner, policys eller registrera en avvikelse.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{typeLabels[d.type] || d.type}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[d.status] || "bg-slate-100")}>{statusLabels[d.status] || d.status}</span>
                    {d.version > 1 && <span className="text-xs text-muted-foreground">v{d.version}</span>}
                  </div>
                  <p className="mt-1.5 font-medium">{d.title}</p>
                  {d.category && <p className="text-xs text-muted-foreground">{d.category}</p>}
                </div>
                <div className="flex gap-1">
                  {d.status === "draft" && <Button size="sm" variant="ghost" className="h-8" onClick={() => approve(d)}><FileCheck className="w-4 h-4 mr-1" />Godkänn</Button>}
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(d)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              {d.content && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{d.content}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {d.responsible_person && <span>Ansvarig: {d.responsible_person}</span>}
                {d.valid_from && <span>Gäller från: {d.valid_from}</span>}
                {d.valid_until && <span>Till: {d.valid_until}</span>}
                {d.annual_review_date && <span>Översyn: {d.annual_review_date}</span>}
                {d.approved_at && <span>Godkänd: {new Date(d.approved_at).toLocaleDateString("sv-SE")}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera dokument" : "Nytt dokument"}</DialogTitle>
            <DialogDescription>Rutiner, policys, avvikelser, incidenter m.m. för patientsäkerhetsarbete.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="title">Titel</Label><Input id="title" value={form.title} onChange={set("title")} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="type" className="text-xs">Typ</Label><select id="type" value={form.type} onChange={set("type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="status" className="text-xs">Status</Label><select id="status" value={form.status} onChange={set("status")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="category" className="text-xs">Kategori</Label><Input id="category" value={form.category} onChange={set("category")} placeholder="t.ex. Hygien, Medicinsk, Administrativ" /></div>
            <div className="space-y-1.5"><Label htmlFor="content" className="text-xs">Innehåll</Label><Textarea id="content" value={form.content} onChange={set("content")} rows={5} /></div>
            <div className="space-y-1.5"><Label htmlFor="responsible" className="text-xs">Ansvarig person</Label><Input id="responsible" value={form.responsible_person} onChange={set("responsible_person")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="valid_from" className="text-xs">Gäller från</Label><Input id="valid_from" type="date" value={form.valid_from} onChange={set("valid_from")} /></div>
              <div className="space-y-1.5"><Label htmlFor="valid_until" className="text-xs">Gäller till</Label><Input id="valid_until" type="date" value={form.valid_until} onChange={set("valid_until")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="review" className="text-xs">Årlig översyn</Label><Input id="review" type="date" value={form.annual_review_date} onChange={set("annual_review_date")} /></div>
              <div className="space-y-1.5"><Label htmlFor="version" className="text-xs">Version</Label><Input id="version" type="number" min="1" value={form.version} onChange={set("version")} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button><Button type="submit" disabled={saving || !form.title.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Skapa"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}