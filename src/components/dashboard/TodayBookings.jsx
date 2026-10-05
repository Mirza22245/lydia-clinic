import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { CalendarClock } from "lucide-react";
import Panel from "./Panel";

const statusLabels = {
  draft: "Utkast", pending: "Väntar", confirmed: "Bekräftad", checked_in: "Incheckad",
  in_progress: "Pågår", completed: "Klar", cancelled: "Inställd", no_show: "Utebliven",
};
const statusColors = {
  completed: "bg-emerald-100 text-emerald-700", confirmed: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700", cancelled: "bg-rose-100 text-rose-700",
  in_progress: "bg-violet-100 text-violet-700", no_show: "bg-rose-100 text-rose-700",
  checked_in: "bg-cyan-100 text-cyan-700", draft: "bg-slate-100 text-slate-600",
};
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "");

export default function TodayBookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        const page = await base44.entities.Booking.filter(
          { start_time: { $gte: start.toISOString(), $lt: end.toISOString() } },
          { sort: "start_time", limit: 50 }
        );
        setItems(page.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Panel
      title="Dagens bokningar"
      icon={CalendarClock}
      action={<Link to="/app/bookings" className="text-sm text-muted-foreground hover:text-foreground">Alla</Link>}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga bokningar idag.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-12 shrink-0 text-sm font-medium tabular-nums">{fmtTime(b.start_time)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.customer_name}</p>
                <p className="truncate text-sm text-muted-foreground">{b.treatment_name}{b.staff_name ? ` · ${b.staff_name}` : ""}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusColors[b.status] || "bg-slate-100 text-slate-600")}>
                {statusLabels[b.status] || b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}