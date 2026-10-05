import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, CalendarDays, CheckCircle2, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookingsCalendar from "@/components/BookingsCalendar";
import TodayBookings from "@/components/dashboard/TodayBookings";
import UpcomingMeetings from "@/components/dashboard/UpcomingMeetings";
import TodoSummary from "@/components/dashboard/TodoSummary";
import UnsignedJournals from "@/components/dashboard/UnsignedJournals";
import { cn } from "@/lib/utils";

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
const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n || 0);

export default function Dashboard() {
  const [stats, setStats] = useState({ customers: 0, bookings: 0, completed: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [custCount, bookCount, doneCount, revAgg] = await Promise.all([
          base44.entities.Customer.count(),
          base44.entities.Booking.count(),
          base44.entities.Booking.count({ status: "completed" }),
          base44.entities.Booking.aggregate({ query: { status: "completed" }, sum: "price" }),
        ]);
        setStats({
          customers: custCount,
          bookings: bookCount,
          completed: doneCount,
          revenue: revAgg.rows[0]?.sum_price || 0,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = [
    { icon: Users, label: "Kunder", value: stats.customers },
    { icon: CalendarDays, label: "Bokningar", value: stats.bookings },
    { icon: CheckCircle2, label: "Genomförda", value: stats.completed },
    { icon: TrendingUp, label: "Intäkt", value: fmtSEK(stats.revenue) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Översikt över din klinik.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild><Link to="/app/bookings"><Plus className="w-4 h-4 mr-1" />Ny bokning</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/app/customers"><Plus className="w-4 h-4 mr-1" />Ny kund</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="w-5 h-5" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold font-heading">{loading ? "–" : k.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TodayBookings />
        <UnsignedJournals />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingMeetings />
        <TodoSummary />
      </div>

      <BookingsCalendar />
    </div>
  );
}