import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users } from "lucide-react";
import Panel from "./Panel";

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function UpcomingMeetings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.Booking.filter(
          { start_time: { $gte: new Date().toISOString() }, status: { $nin: ["cancelled", "no_show", "completed"] } },
          { sort: "start_time", limit: 6 }
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
      title="Kommande kundmöten"
      icon={Users}
      action={<Link to="/app/bookings" className="text-sm text-muted-foreground hover:text-foreground">Kalender</Link>}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga kommande möten.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((b) => (
            <Link key={b.id} to={`/app/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.customer_name}</p>
                <p className="truncate text-sm text-muted-foreground">{b.treatment_name}{b.staff_name ? ` · ${b.staff_name}` : ""}</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{fmtDateTime(b.start_time)}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}