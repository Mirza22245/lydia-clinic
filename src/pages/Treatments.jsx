import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Clock } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";

const empty = { name: "", description: "", duration: 30, price: 0, category: "", vat: 25 };
const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n || 0);

export default function Treatments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Treatment.filter({}, { sort: "name", limit: 100 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (t) => { setEditing(t); setForm({ ...empty, ...t }); setOpen(true); };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: f === "duration" || f === "price" || f === "vat" ? Number(e.target.value) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = { ...form, clinic_id, description: form.description || undefined, category: form.category || undefined };
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Behandlingar</h1>
          <p className="text-sm text-muted-foreground">Definiera klinikens behandlingar och priser.</p>
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
          {items.map((t) => (
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
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera behandling" : "Ny behandling"}</DialogTitle>
            <DialogDescription>{editing ? "Uppdatera behandlingen." : "Lägg till en ny behandling."}</DialogDescription>
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