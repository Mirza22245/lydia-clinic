import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

const typeLabels = { semester: "Semester", sjuk: "Sjuk", blocked: "Blockerad", rast: "Rast", annat: "Annat" };
const typeColors = { semester: "bg-blue-100 text-blue-700", sjuk: "bg-rose-100 text-rose-700", blocked: "bg-slate-100 text-slate-600", rast: "bg-amber-100 text-amber-700", annat: "bg-muted text-muted-foreground" };

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const emptyForm = { staff_name: "", start: "", end: "", type: "blocked", note: "" };

export default function TimeOffTab() {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [offPage, staffPage] = await Promise.all([
        base44.entities.StaffTimeOff.filter({}, { sort: "-start", limit: 200 }),
        base44.entities.Staff.filter({ active: { $ne: false } }, { sort: "name", limit: 100 }),
      ]);
      setItems(offPage.items || []);
      setStaff(staffPage.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ staff_name: s.staff_name || "", start: toLocalInput(s.start), end: toLocalInput(s.end), type: s.type || "blocked", note: s.note || "" });
    setOpen(true);
  };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.staff_name || !form.start || !form.end) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        clinic_id,
        staff_name: form.staff_name,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        type: form.type,
        note: form.note || undefined,
      };
      if (editing) await base44.entities.StaffTimeOff.update(editing.id, data);
      else await base44.entities.StaffTimeOff.create(data);
      setOpen(false); setEditing(null); await load();
    } finally { setSaving(false); }
  };

  const remove = async (s) => { if (confirm("Ta bort frånvaro?")) { await base44.entities.StaffTimeOff.delete(s.id); await load(); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Lägg till frånvaro</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="font-medium">Ingen frånvaro</p>
          <p className="mt-1 text-sm text-muted-foreground">Semester, sjuk, rast och blockerade tider visas här.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.staff_name}</p>
                <p className="truncate text-sm text-muted-foreground">{fmtDate(s.start)} – {fmtDate(s.end)}{s.note ? ` · ${s.note}` : ""}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", typeColors[s.type] || "bg-muted")}>{typeLabels[s.type] || s.type}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(s)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera frånvaro" : "Lägg till frånvaro"}</DialogTitle>
            <DialogDescription>Blockera tider för semester, sjukdom, rast m.m.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff_name">Behandlare</Label>
              <select id="staff_name" value={form.staff_name} onChange={set("staff_name")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">Välj behandlare…</option>
                {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="start">Från</Label><Input id="start" type="datetime-local" value={form.start} onChange={set("start")} required /></div>
              <div className="space-y-2"><Label htmlFor="end">Till</Label><Input id="end" type="datetime-local" value={form.end} onChange={set("end")} required /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <select id="type" value={form.type} onChange={set("type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="note">Anteckning</Label><Input id="note" value={form.note} onChange={set("note")} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.staff_name}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}