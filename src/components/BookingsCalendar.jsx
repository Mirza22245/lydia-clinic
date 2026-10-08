import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay,
  addDays, addWeeks, addMonths, eachDayOfInterval, format, isSameMonth, isToday,
} from "date-fns";
import { sv } from "date-fns/locale";

const statusLabels = {
  draft: "Utkast", pending: "Väntar", confirmed: "Bekräftad", checked_in: "Incheckad",
  in_progress: "Pågår", completed: "Klar", cancelled: "Inställd", no_show: "Utebliven",
};
const statusDot = {
  completed: "bg-emerald-500", confirmed: "bg-blue-500", pending: "bg-amber-500",
  cancelled: "bg-rose-500", in_progress: "bg-violet-500", no_show: "bg-rose-500",
  checked_in: "bg-cyan-500", draft: "bg-slate-400",
};
const statusPill = {
  completed: "bg-emerald-100 text-emerald-700", confirmed: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700", cancelled: "bg-rose-100 text-rose-700",
  in_progress: "bg-violet-100 text-violet-700", no_show: "bg-rose-100 text-rose-700",
  checked_in: "bg-cyan-100 text-cyan-700", draft: "bg-slate-100 text-slate-600",
};

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "");

const views = [
  { key: "day", label: "Dag" },
  { key: "week", label: "Vecka" },
  { key: "month", label: "Månad" },
];

function getRange(view, anchor) {
  if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
  if (view === "week") return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

export default function BookingsCalendar() {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => getRange(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Booking.filter(
        { start_time: { $gte: range.start.toISOString(), $lte: range.end.toISOString() } },
        { sort: "start_time", limit: 200 }
      );
      setBookings(page.items || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => { load(); }, [load]);

  const step = (dir) => {
    if (view === "day") setAnchor((d) => addDays(d, dir));
    else if (view === "week") setAnchor((d) => addWeeks(d, dir));
    else setAnchor((d) => addMonths(d, dir));
  };

  const title = useMemo(() => {
    if (view === "day") return format(anchor, "d MMMM yyyy", { locale: sv });
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      if (isSameMonth(s, e)) return `${format(s, "d", { locale: sv })}–${format(e, "d MMMM yyyy", { locale: sv })}`;
      return `${format(s, "d MMM", { locale: sv })} – ${format(e, "d MMM yyyy", { locale: sv })}`;
    }
    return format(anchor, "MMMM yyyy", { locale: sv });
  }, [view, anchor]);

  const byDay = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      if (!b.start_time) return;
      const key = new Date(b.start_time).toDateString();
      (map[key] = map[key] || []).push(b);
    });
    return map;
  }, [bookings]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Kalender</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => step(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Idag</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => step(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <span className="text-sm font-medium capitalize">{title}</span>
        </div>
        <div className="flex gap-1.5">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                view === v.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : view === "day" ? (
        <DayView date={anchor} bookings={byDay[anchor.toDateString()] || []} />
      ) : view === "week" ? (
        <WeekView anchor={anchor} byDay={byDay} />
      ) : (
        <MonthView anchor={anchor} byDay={byDay} onPick={(d) => { setAnchor(d); setView("day"); }} />
      )}
    </div>
  );
}

function BookingChip({ b, compact }) {
  return (
    <Link
      to={`/app/bookings/${b.id}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent transition-colors",
        b.status === "cancelled" && "opacity-60"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[b.status] || "bg-slate-400")} />
      <span className="font-medium text-muted-foreground">{fmtTime(b.start_time)}</span>
      <span className="truncate">{b.customer_name}</span>
      {!compact && b.treatment_name && <span className="truncate text-muted-foreground">· {b.treatment_name}</span>}
    </Link>
  );
}

function DayView({ date, bookings }) {
  if (bookings.length === 0) {
    return <div className="px-5 py-12 text-center text-sm text-muted-foreground">Inga bokningar denna dag.</div>;
  }
  return (
    <div className="divide-y divide-border">
      {bookings.map((b) => (
        <div key={b.id} className="flex items-center gap-3 px-5 py-3">
          <div className="w-14 shrink-0 text-sm font-medium text-muted-foreground">{fmtTime(b.start_time)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{b.customer_name} · {b.treatment_name}</p>
            {b.staff_name && <p className="truncate text-sm text-muted-foreground">{b.staff_name}</p>}
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusPill[b.status] || "bg-slate-100 text-slate-600")}>
            {statusLabels[b.status] || b.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function WeekView({ anchor, byDay }) {
  const days = eachDayOfInterval({
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  });
  return (
    <div className="grid grid-cols-7 border-t border-border">
      {days.map((d) => {
        const items = byDay[d.toDateString()] || [];
        const today = isToday(d);
        return (
          <div key={d.toISOString()} className="min-h-[140px] border-r border-border p-2 last:border-r-0">
            <div className={cn("mb-1.5 flex items-center gap-1.5", today && "font-semibold")}>
              <span className="text-xs capitalize text-muted-foreground">{format(d, "EEE", { locale: sv })}</span>
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", today ? "bg-primary text-primary-foreground" : "text-foreground")}>
                {format(d, "d")}
              </span>
            </div>
            <div className="space-y-1">
              {items.slice(0, 4).map((b) => <BookingChip key={b.id} b={b} compact />)}
              {items.length > 4 && <p className="px-1 text-xs text-muted-foreground">+{items.length - 4} till</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ anchor, byDay, onPick }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekDays = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  return (
    <div className="border-t border-border">
      <div className="grid grid-cols-7 border-b border-border bg-secondary/40">
        {weekDays.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay[d.toDateString()] || [];
          const inMonth = isSameMonth(d, anchor);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
              className={cn(
                "min-h-[88px] border-r border-b border-border p-1.5 text-left transition-colors hover:bg-accent/50 last:border-r-0",
                !inMonth && "bg-secondary/20 text-muted-foreground"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  today ? "bg-primary text-primary-foreground font-semibold" : inMonth ? "text-foreground" : "text-muted-foreground"
                )}>
                  {format(d, "d")}
                </span>
                {items.length > 0 && <span className="text-xs text-muted-foreground">{items.length}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {items.slice(0, 3).map((b) => (
                  <span key={b.id} className={cn("h-1.5 w-1.5 rounded-full", statusDot[b.status] || "bg-slate-400")} />
                ))}
                {items.length > 3 && <span className="text-[10px] text-muted-foreground">+{items.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}