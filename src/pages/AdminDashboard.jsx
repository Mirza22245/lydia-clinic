import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CalendarDays, Users, CheckCircle2, TrendingUp, UserCog, Settings, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtTime = (d) => new Date(d).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ customers: 0, bookings: 0, completed: 0, revenue: 0, today: [], pending: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const now = new Date();
        const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
        const safeCount = async (entity, query = {}) => {
          try {
            const value = await entity.count(query);
            return Number(value) || 0;
          } catch (e) {
            console.error("[dashboard-count]", e);
            return 0;
          }
        };
        const [customers, bookings, completed, revenue, todayPage, pending] = await Promise.all([
          safeCount(base44.entities.Customer),
          safeCount(base44.entities.Booking),
          safeCount(base44.entities.Booking, { status: "completed" }),
          base44.entities.Booking.aggregate({ query: { status: "completed" }, sum: "price" }).catch(() => ({ rows: [] })),
          base44.entities.Booking.filter({}, { sort: "start_time", limit: 100 }).catch(() => ({ items: [] })),
          safeCount(base44.entities.Booking, { status: "pending" }),
        ]);
        const todayItems = (todayPage.items || []).filter((b) =>
          b.start_time && new Date(b.start_time).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }) === today &&
          !["cancelled", "no_show"].includes(b.status)
        ).slice(0, 8);
        if (active) setData({
          customers, bookings, completed,
          revenue: revenue?.rows?.[0]?.sum_price || 0,
          today: todayItems, pending,
        });
      } catch (e) {
        if (active) setError(e.message || "Kunde inte läsa dashboarddata.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const kpis = [
    [Users, "Kunder", data.customers],
    [CalendarDays, "Bokningar", data.bookings],
    [CheckCircle2, "Genomförda", data.completed],
    [TrendingUp, "Intäkt", fmtSEK(data.revenue)],
  ];

  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Administratör</p><h1 className="text-2xl font-semibold font-heading">Klinikdashboard</h1><p className="text-sm text-muted-foreground">Översikt för {user?.full_name || "kliniken"}.</p></div>
      <div className="flex gap-2"><Button size="sm" asChild><Link to="/app/bookings"><Plus className="mr-1 h-4 w-4"/>Ny bokning</Link></Button><Button size="sm" variant="outline" asChild><Link to="/app/staff"><UserCog className="mr-1 h-4 w-4"/>Personal</Link></Button></div>
    </div>
    {error && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4"/>{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map(([Icon,label,value]) => <div key={label} className="rounded-xl border bg-card p-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5"/></div><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold font-heading">{loading ? "–" : value}</p></div>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Dagens bokningar</h2><p className="text-sm text-muted-foreground">{data.today.length} visade</p></div><Button variant="ghost" size="sm" asChild><Link to="/app/bookings">Visa alla</Link></Button></div>
        <div className="mt-4 space-y-2">{data.today.length ? data.today.map(b => <Link key={b.id} to={"/app/bookings/"+b.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent"><span className="w-12 font-medium">{fmtTime(b.start_time)}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{b.customer_name || "Kund"}</p><p className="truncate text-xs text-muted-foreground">{b.treatment_name || "Behandling"} · {b.staff_name || "Behandlare"}</p></div><span className={cn("rounded-full px-2 py-1 text-xs", b.status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}>{b.status === "confirmed" ? "Bekräftad" : "Väntar"}</span></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">Inga bokningar idag.</p>}</div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Väntar på åtgärd</p><p className="mt-1 text-3xl font-semibold">{loading ? "–" : data.pending}</p><p className="mt-1 text-xs text-muted-foreground">bokningar med status väntar</p><Button className="mt-4 w-full" variant="outline" asChild><Link to="/app/bookings">Hantera bokningar</Link></Button></div>
        <div className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Administration</h2><div className="mt-3 grid gap-2"><Button variant="outline" className="justify-start" asChild><Link to="/app/staff"><UserCog className="mr-2 h-4 w-4"/>Personal & behörigheter</Link></Button><Button variant="outline" className="justify-start" asChild><Link to="/app/settings"><Settings className="mr-2 h-4 w-4"/>Inställningar</Link></Button></div></div>
      </aside>
    </div>
  </div>;
}
