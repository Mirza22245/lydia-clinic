import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";

const dayLabels = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const emptyForm = { staff_name: "", day_of_week: "1", start_time: "08:00", end_time: "17:00", room_id: "", effective_from: "", effective_until: "", note: "" };

export default function ScheduleTab() {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedPage, staffPage, roomPage] = await Promise.all([
        base44.entities.StaffSchedule.filter({}, { sort: "staff_name", limit: 200 }),
        base44.entities.Staff.filter({ active: { $ne: false } }, { sort: "name", limit: 100 }),
        base44.entities.Room.filter({ active: { $ne: false } }, { sort: "name", limit: 50 }),
      ]);
      setItems(schedPage.items || []);
      setStaff(staffPage.items || []);
      setRooms(roomPage.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      staff_name: s.staff_name || "",
      day_of_week: String(s.day_of_week ?? 1),
      start_time: s.start_time || "08:00",
      end_time: s.end_time || "17:00",
      room_id: s.room_id || "",
      effective_from: s.effective_from || "",
      effective_until: s.effective_until || "",
      note: s.note || "",
    });
    setOpen(true);
  };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.staff_name || !form.start_time || !form.end_time) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        clinic_id,
        staff_name: form.staff_name,
        day_of_week: parseInt(form.day_of_week, 10),
        start_time: form.start_time,
        end_time: form.end_time,
        room_id: form.room_id || undefined,
        effective_from: form.effective_from || undefined,
        effective_until: form.effective_until || undefined,
        note: form.note || undefined,
      };
      if (editing) await base44.entities.StaffSchedule.update(editing.id, data);
      else await base44.entities.StaffSchedule.create(data);
      setOpen(false); setEditing(null); await load();
    } finally { setSaving(false); }
  };

  const remove = async (s) => { if (confirm("Ta bort detta schema?")) { await base44.entities.StaffSchedule.delete(s.id); await load(); } };

  const grouped = items.reduce((acc, s) => { (acc[s.staff_name] = acc[s.staff_name] || []).push(s); return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Lägg till schema</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="font-medium">Inga scheman</p>
          <p className="mt-1 text-sm text-muted-foreground">Lägg till arbetstider för behandlarna.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([name, entries]) => (
            <div key={name} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-2.5 font-medium">{name}</div>
              <div className="divide-y divide-border">
                {entries.sort((a, b) => a.day_of_week - b.day_of_week).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-24 shrink-0 text-sm text-muted-foreground">{dayLabels[s.day_of_week]}</div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{s.start_time}–{s.end_time}</span>
                      {s.room_id && <span className="ml-2 text-sm text-muted-foreground">· Rum: {rooms.find((r) => r.id === s.room_id)?.name || s.room_id}</span>}
                      {((s.effective_from || s.effective_until) && (
                        <span className="ml-2 text-xs text-muted-foreground">gäller {s.effective_from || "…"}–{s.effective_until || "…"}</span>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(s)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera schema" : "Lägg till schema"}</DialogTitle>
            <DialogDescription>Ange arbetstid för en veckodag.</DialogDescription>
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
              <div className="space-y-2">
                <Label htmlFor="day_of_week">Veckodag</Label>
                <select id="day_of_week" value={form.day_of_week} onChange={set("day_of_week")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  {dayLabels.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room_id">Standardrum</Label>
                <select id="room_id" value={form.room_id} onChange={set("room_id")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Inget</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="start_time">Start</Label><Input id="start_time" type="time" value={form.start_time} onChange={set("start_time")} required /></div>
              <div className="space-y-2"><Label htmlFor="end_time">Slut</Label><Input id="end_time" type="time" value={form.end_time} onChange={set("end_time")} required /></div>
              <div className="space-y-2"><Label htmlFor="effective_from">Gäller från</Label><Input id="effective_from" type="date" value={form.effective_from} onChange={set("effective_from")} /></div>
              <div className="space-y-2"><Label htmlFor="effective_until">Gäller till</Label><Input id="effective_until" type="date" value={form.effective_until} onChange={set("effective_until")} /></div>
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