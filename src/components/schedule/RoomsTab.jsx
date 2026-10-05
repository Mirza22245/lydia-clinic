import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

const emptyForm = { name: "", description: "", active: true };

export default function RoomsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Room.filter({}, { sort: "name", limit: 100 });
      setItems(page.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ name: r.name || "", description: r.description || "", active: r.active !== false }); setOpen(true); };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = { clinic_id, name: form.name, description: form.description || undefined, active: form.active };
      if (editing) await base44.entities.Room.update(editing.id, data);
      else await base44.entities.Room.create(data);
      setOpen(false); setEditing(null); await load();
    } finally { setSaving(false); }
  };

  const remove = async (r) => { if (confirm(`Ta bort rummet "${r.name}"?`)) { await base44.entities.Room.delete(r.id); await load(); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Lägg till rum</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="font-medium">Inga rum</p>
          <p className="mt-1 text-sm text-muted-foreground">Lägg till behandlingsrum som kan bokas.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                {r.description && <p className="truncate text-sm text-muted-foreground">{r.description}</p>}
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", r.active === false ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700")}>
                {r.active === false ? "Inaktiv" : "Aktiv"}
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera rum" : "Lägg till rum"}</DialogTitle>
            <DialogDescription>Behandlingsrum som kan kopplas till behandlingar och bokas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Namn *</Label><Input id="name" value={form.name} onChange={set("name")} required /></div>
            <div className="space-y-2"><Label htmlFor="description">Beskrivning</Label><Textarea id="description" value={form.description} onChange={set("description")} rows={2} /></div>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 rounded border-input accent-primary" />
              <span className="text-sm">Aktiv</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.name}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}