import React, { useEffect, useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ChevronLeft, ChevronRight, CalendarDays, Save } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, format, isSameMonth, isToday, getISOWeek } from "date-fns";
import { sv } from "date-fns/locale";

const days = [
  { value: 1, label: "Måndag", short: "Mån" },
  { value: 2, label: "Tisdag", short: "Tis" },
  { value: 3, label: "Onsdag", short: "Ons" },
  { value: 4, label: "Torsdag", short: "Tor" },
  { value: 5, label: "Fredag", short: "Fre" },
  { value: 6, label: "Lördag", short: "Lör" },
  { value: 0, label: "Söndag", short: "Sön" },
];

const emptyDay = () => ({ enabled: false, start_time: "08:00", end_time: "17:00", room_id: "" });

function dayOfWeek(date) { return date.getDay(); }
function toDateKey(date) { return format(date, "yyyy-MM-dd"); }

export default function ScheduleTab() {
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [view, setView] = useState("week");
  const [month, setMonth] = useState(new Date());
  const [weekForm, setWeekForm] = useState(Object.fromEntries(days.map((d) => [d.value, emptyDay()])));
  const [savingWeek, setSavingWeek] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingDay, setEditingDay] = useState(null);
  const [savingDay, setSavingDay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedPage, staffPage, roomPage] = await Promise.all([
        base44.entities.StaffSchedule.filter({}, { sort: "staff_name", limit: 500 }),
        base44.entities.Staff.filter({ active: { $ne: false } }, { sort: "name", limit: 100 }),
        base44.entities.Room.filter({ active: { $ne: false } }, { sort: "name", limit: 50 }),
      ]);
      setItems(schedPage.items || []);
      setStaff(staffPage.items || []);
      setRooms(roomPage.items || []);
      if (!selectedStaff && staffPage.items?.[0]) setSelectedStaff(staffPage.items[0].name);
    } finally {
      setLoading(false);
    }
  }, [selectedStaff]);

  useEffect(() => { load(); }, [load]);

  const recurringForStaff = useMemo(
    () => items.filter((s) => s.staff_name === selectedStaff && !s.effective_from && !s.effective_until),
    [items, selectedStaff]
  );

  useEffect(() => {
    const form = Object.fromEntries(days.map((d) => [d.value, emptyDay()]));
    recurringForStaff.forEach((s) => {
      form[Number(s.day_of_week)] = {
        enabled: true,
        start_time: s.start_time || "08:00",
        end_time: s.end_time || "17:00",
        room_id: s.room_id || "",
      };
    });
    setWeekForm(form);
  }, [selectedStaff, items]);

  const saveWeek = async () => {
    if (!selectedStaff) return;
    setSavingWeek(true);
    try {
      const clinic_id = await getClinicId();
      const existing = items.filter((s) => s.staff_name === selectedStaff && !s.effective_from && !s.effective_until);
      for (const d of days) {
        const current = existing.filter((s) => Number(s.day_of_week) === d.value);
        const value = weekForm[d.value];
        if (value.enabled) {
          const payload = { clinic_id, staff_name: selectedStaff, day_of_week: d.value, start_time: value.start_time, end_time: value.end_time, room_id: value.room_id || undefined };
          if (current[0]) await base44.entities.StaffSchedule.update(current[0].id, payload);
          else await base44.entities.StaffSchedule.create(payload);
          for (const duplicate of current.slice(1)) await base44.entities.StaffSchedule.delete(duplicate.id);
        } else {
          for (const row of current) await base44.entities.StaffSchedule.delete(row.id);
        }
      }
      await load();
    } finally {
      setSavingWeek(false);
    }
  };

  const openDay = (date) => {
    const key = toDateKey(date);
    const row = items.find((s) =>
      s.staff_name === selectedStaff &&
      Number(s.day_of_week) === dayOfWeek(date) &&
      (!s.effective_from || key >= s.effective_from) &&
      (!s.effective_until || key <= s.effective_until)
    );
    setEditingDay({
      date: key,
      day_of_week: dayOfWeek(date),
      start_time: row?.start_time || weekForm[dayOfWeek(date)]?.start_time || "08:00",
      end_time: row?.end_time || weekForm[dayOfWeek(date)]?.end_time || "17:00",
      room_id: row?.room_id || weekForm[dayOfWeek(date)]?.room_id || "",
      existing_id: row?.id || null,
    });
  };

  const saveDay = async () => {
    if (!editingDay || !selectedStaff) return;
    setSavingDay(true);
    try {
      const clinic_id = await getClinicId();
      const payload = {
        clinic_id,
        staff_name: selectedStaff,
        day_of_week: editingDay.day_of_week,
        start_time: editingDay.start_time,
        end_time: editingDay.end_time,
        room_id: editingDay.room_id || undefined,
        effective_from: editingDay.date,
        effective_until: editingDay.date,
      };
      if (editingDay.existing_id) await base44.entities.StaffSchedule.update(editingDay.existing_id, payload);
      else await base44.entities.StaffSchedule.create(payload);
      setEditingDay(null);
      await load();
    } finally {
      setSavingDay(false);
    }
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const scheduleForDate = (date) => {
    const key = toDateKey(date);
    return items.filter((s) =>
      s.staff_name === selectedStaff &&
      Number(s.day_of_week) === dayOfWeek(date) &&
      (!s.effective_from || key >= s.effective_from) &&
      (!s.effective_until || key <= s.effective_until)
    );
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium">
            {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <div className="flex rounded-full bg-secondary p-1">
            <button onClick={() => setView("week")} className={cn("rounded-full px-3 py-1.5 text-sm", view === "week" && "bg-background shadow-sm")}>Veckoschema</button>
            <button onClick={() => setView("month")} className={cn("rounded-full px-3 py-1.5 text-sm", view === "month" && "bg-background shadow-sm")}>Månad</button>
            <button onClick={() => setView("list")} className={cn("rounded-full px-3 py-1.5 text-sm", view === "list" && "bg-background shadow-sm")}>Lista</button>
          </div>
        </div>
        {view === "week" && <Button size="sm" onClick={saveWeek} disabled={savingWeek || !selectedStaff}>{savingWeek ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Spara hela veckan</Button>}
      </div>

      {view === "week" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2"><p className="font-medium">Återkommande veckoschema</p><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">Vecka {getISOWeek(new Date())}</span></div>
            <p className="text-sm text-muted-foreground">Ställ in personalens arbetstid en gång. Tiderna återkommer varje vecka.</p>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-7">
            {days.map((d) => {
              const value = weekForm[d.value];
              return (
                <div key={d.value} className="min-h-[190px] bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.label}</span>
                    <input type="checkbox" checked={value.enabled} onChange={(e) => setWeekForm((x) => ({ ...x, [d.value]: { ...x[d.value], enabled: e.target.checked } }))} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{value.enabled ? "Arbetar" : "Ledig"}</p>
                  {value.enabled && (
                    <div className="mt-4 space-y-3">
                      <div><Label className="text-xs">Start</Label><Input type="time" value={value.start_time} onChange={(e) => setWeekForm((x) => ({ ...x, [d.value]: { ...x[d.value], start_time: e.target.value } }))} /></div>
                      <div><Label className="text-xs">Slut</Label><Input type="time" value={value.end_time} onChange={(e) => setWeekForm((x) => ({ ...x, [d.value]: { ...x[d.value], end_time: e.target.value } }))} /></div>
                      <div><Label className="text-xs">Rum</Label><select value={value.room_id} onChange={(e) => setWeekForm((x) => ({ ...x, [d.value]: { ...x[d.value], room_id: e.target.value } }))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Inget</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">Vecka {getISOWeek(month)}</span>
              <Button size="icon" variant="ghost" onClick={() => setMonth((d) => addMonths(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => setMonth(new Date())}>Idag</Button>
              <Button size="icon" variant="ghost" onClick={() => setMonth((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
              <span className="font-medium capitalize">{format(month, "MMMM yyyy", { locale: sv })}</span>
            </div>
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-7 border-b border-border bg-secondary/40">
            {days.map((d) => <div key={d.value} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d.short}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((date) => {
              const entries = scheduleForDate(date);
              return (
                <button key={date.toISOString()} onClick={() => openDay(date)} className={cn("min-h-[110px] border-r border-b border-border p-2 text-left hover:bg-accent/50", !isSameMonth(date, month) && "bg-secondary/20 text-muted-foreground")}>
                  <div className="flex items-center justify-between">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(date) && "bg-primary text-primary-foreground")}>{format(date, "d")}</span>
                    {entries.length > 0 && <span className="text-[10px] text-muted-foreground">{entries.length} pass</span>}
                  </div>
                  <div className="mt-2 space-y-1">
                    {entries.map((s) => <div key={s.id} className="rounded bg-primary/10 px-1.5 py-1 text-[11px] font-medium">{s.start_time}–{s.end_time}</div>)}
                    {entries.length === 0 && <span className="text-[11px] text-muted-foreground">Ledig</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="font-medium">Schemaposter</p>
            <p className="text-sm text-muted-foreground">Återkommande schema visas här som referens.</p>
          </div>
          <div className="divide-y divide-border">
            {days.map((d) => {
              const rows = recurringForStaff.filter((s) => Number(s.day_of_week) === d.value);
              return <div key={d.value} className="flex items-center gap-4 px-4 py-3"><div className="w-24 font-medium">{d.label}</div><div className="flex-1">{rows.length ? rows.map((s) => <span key={s.id} className="mr-2 inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs">{s.start_time}–{s.end_time}</span>) : <span className="text-sm text-muted-foreground">Ledig</span>}</div></div>;
            })}
          </div>
        </div>
      )}

      {editingDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setEditingDay(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Ändra {format(new Date(editingDay.date + "T12:00:00"), "d MMMM yyyy", { locale: sv })}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Detta är ett undantag för vald dag.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="time" value={editingDay.start_time} onChange={(e) => setEditingDay((x) => ({ ...x, start_time: e.target.value }))} /></div>
              <div><Label>Slut</Label><Input type="time" value={editingDay.end_time} onChange={(e) => setEditingDay((x) => ({ ...x, end_time: e.target.value }))} /></div>
            </div>
            <div className="mt-3"><Label>Rum</Label><select value={editingDay.room_id} onChange={(e) => setEditingDay((x) => ({ ...x, room_id: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Inget</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingDay(null)}>Avbryt</Button><Button onClick={saveDay} disabled={savingDay}>{savingDay ? <Loader2 className="h-4 w-4 animate-spin" /> : "Spara datum"}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
