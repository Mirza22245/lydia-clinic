import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, CalendarDays, FileText, Lock, PenLine, User, Plus } from "lucide-react";
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
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function BookingDetail() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const b = await base44.entities.Booking.get(id).catch(() => null);
        if (!b) { setNotFound(true); return; }
        setBooking(b);
        if (b.customer_id) {
          const j = await base44.entities.JournalEntry.filter({ customer_id: b.customer_id }, { sort: "-entry_date", limit: 100 });
          setJournals(j.items || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (notFound) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/app/bookings"><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Link></Button>
        <p className="text-muted-foreground">Bokningen hittades inte.</p>
      </div>
    );
  }

  const newJournalUrl = `/app/journal?booking_id=${booking.id}${booking.customer_id ? `&customer_id=${booking.customer_id}` : ""}${booking.treatment_id ? `&treatment_id=${booking.treatment_id}` : ""}`;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/app/bookings"><ArrowLeft className="w-4 h-4 mr-1" />Alla bokningar</Link></Button>

      {/* Bokningskort */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight font-heading">{booking.treatment_name || "Bokning"}</h1>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusColors[booking.status] || "bg-slate-100 text-slate-600")}>
                {statusLabels[booking.status] || booking.status}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="w-4 h-4" />{fmtDateTime(booking.start_time)}
              {booking.end_time ? ` – ${new Date(booking.end_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {booking.customer_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {booking.customer_id ? <Link to={`/app/customers/${booking.customer_id}`} className="hover:underline">{booking.customer_name}</Link> : booking.customer_name}
                </span>
              )}
              {booking.staff_name && <span>Behandlare: {booking.staff_name}</span>}
              {booking.price ? <span>{booking.price.toLocaleString("sv-SE")} kr</span> : null}
            </div>
            {booking.notes && <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">{booking.notes}</p>}
          </div>
          <Button size="sm" asChild><Link to={newJournalUrl}><Plus className="w-4 h-4 mr-1" />Ny journal för bokning</Link></Button>
        </div>
      </div>

      {/* Kundens journalhistorik */}
      <div>
        <h2 className="mb-3 text-lg font-semibold font-heading">Kundens journalhistorik</h2>
        {journals.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            Inga journalanteckningar för denna kund ännu.
          </div>
        ) : (
          <div className="space-y-3">
            {journals.map((j) => (
              <div key={j.id} className={cn("flex gap-3 rounded-xl border bg-card p-4", j.booking_id === booking.id ? "border-primary/40 ring-1 ring-primary/20" : "border-border")}>
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><FileText className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {j.treatment_name || "Journalanteckning"}
                      <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">v{j.version || 1}</span>
                      {j.booking_id === booking.id && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">Kopplad till denna bokning</span>}
                    </p>
                    {j.is_signed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Lock className="w-3 h-3" />Signerad</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><PenLine className="w-3 h-3" />Osignerad</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{fmtDateTime(j.entry_date)}{j.provider ? ` · ${j.provider}` : ""}</p>
                  {j.notes && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{j.notes}</p>}
                  {j.is_signed && j.signed_by && <p className="mt-1 text-xs text-muted-foreground">Signerad av {j.signed_by}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}