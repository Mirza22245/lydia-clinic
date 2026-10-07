import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CalendarDays, Clock, CheckCircle2, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

const TZ = "Europe/Stockholm";
const fmtTime = (d) => new Date(d).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtDate = (d) => new Date(d).toLocaleDateString("sv-SE", { weekday:"short", day:"numeric", month:"short", timeZone: TZ });

export default function StaffDashboard() {
  const { user } = useAuth();
  const [staff, setStaff] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const email = String(user?.email || "").toLowerCase();
        const staffPage = await base44.entities.Staff.filter({ email }, { limit: 10 });
        const me = (staffPage.items || []).find(s => String(s.email || "").toLowerCase() === email && s.active !== false);
        if (!me) throw new Error("Din personalprofil är inte kopplad till kontot.");
        const page = await base44.entities.Booking.filter({ staff_name: me.name }, { sort: "start_time", limit: 200 });
        const now = Date.now();
        const items = (page.items || []).filter(b => b.start_time && !["cancelled","no_show"].includes(b.status) && new Date(b.start_time).getTime() >= now - 24*3600000);
        if (active) { setStaff(me); setBookings(items); }
      } catch (e) { if (active) setError(e.message || "Kunde inte läsa din dashboard."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user?.email]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const todayBookings = bookings.filter(b => new Date(b.start_time).toLocaleDateString("sv-SE", { timeZone: TZ }) === today);
  const upcoming = bookings.filter(b => new Date(b.start_time).getTime() >= Date.now()).slice(0, 10);
  const completedToday = todayBookings.filter(b => b.status === "completed").length;

  return <div className="space-y-8">
    <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{staff?.role || "Personal"}</p><h1 className="text-2xl font-semibold font-heading">Min dashboard</h1><p className="text-sm text-muted-foreground">Ditt schema, dina bokningar och dagens arbete.</p></div>
    {error && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4"/>{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-5"><CalendarDays className="h-5 w-5 text-primary"/><p className="mt-3 text-sm text-muted-foreground">Idag</p><p className="text-2xl font-semibold">{loading ? "–" : todayBookings.length}</p></div>
      <div className="rounded-xl border bg-card p-5"><CheckCircle2 className="h-5 w-5 text-primary"/><p className="mt-3 text-sm text-muted-foreground">Klara idag</p><p className="text-2xl font-semibold">{loading ? "–" : completedToday}</p></div>
      <div className="rounded-xl border bg-card p-5"><Clock className="h-5 w-5 text-primary"/><p className="mt-3 text-sm text-muted-foreground">Kommande</p><p className="text-2xl font-semibold">{loading ? "–" : upcoming.length}</p></div>
    </div>
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Mina kommande tider</h2><p className="text-sm text-muted-foreground">{staff?.name || ""}</p></div><Button size="sm" variant="outline" asChild><Link to="/app/bookings">Bokningskalender</Link></Button></div>
      <div className="mt-4 space-y-2">{upcoming.length ? upcoming.map(b => <Link key={b.id} to={"/app/bookings/"+b.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent"><div className="w-20 shrink-0"><p className="font-medium">{fmtDate(b.start_time)}</p><p className="text-xs text-muted-foreground">{fmtTime(b.start_time)}</p></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{b.customer_name || "Kund"}</p><p className="truncate text-xs text-muted-foreground">{b.treatment_name || "Behandling"}</p></div><User className="h-4 w-4 text-muted-foreground"/></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">Inga kommande bokningar.</p>}</div>
    </section>
  </div>;
}
