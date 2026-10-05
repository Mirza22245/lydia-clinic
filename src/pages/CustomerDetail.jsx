import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Phone, Mail, MapPin, CalendarDays, FileText, Lock, PenLine, Sparkles } from "lucide-react";
import ConsentsPanel from "@/components/ConsentsPanel";
import { cn } from "@/lib/utils";

const statusLabels = { active: "Aktiv", inactive: "Inaktiv", lead: "Lead" };
const bookingStatus = {
  draft: { label: "Utkast", cls: "bg-secondary text-muted-foreground" },
  pending: { label: "Väntar", cls: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Bekräftad", cls: "bg-blue-100 text-blue-700" },
  checked_in: { label: "Incheckad", cls: "bg-indigo-100 text-indigo-700" },
  in_progress: { label: "Pågår", cls: "bg-violet-100 text-violet-700" },
  completed: { label: "Klar", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Inställd", cls: "bg-rose-100 text-rose-700" },
  no_show: { label: "Utebliven", cls: "bg-rose-100 text-rose-700" },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, b, j] = await Promise.all([
          base44.entities.Customer.get(id).catch(() => null),
          base44.entities.Booking.filter({ customer_id: id }, { sort: "-start_time", limit: 100 }),
          base44.entities.JournalEntry.filter({ customer_id: id }, { sort: "-entry_date", limit: 100 }),
        ]);
        if (!c) { setNotFound(true); return; }
        setCustomer(c);
        setBookings(b.items || []);
        setJournals(j.items || []);
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
        <Button variant="ghost" size="sm" asChild><Link to="/app/customers"><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Link></Button>
        <p className="text-muted-foreground">Kunden hittades inte.</p>
      </div>
    );
  }

  const totalSpent = bookings.filter((b) => b.status === "completed").reduce((s, b) => s + (b.price || 0), 0);

  const timeline = [
    ...bookings.map((b) => ({ type: "booking", date: b.start_time, item: b })),
    ...journals.map((j) => ({ type: "journal", date: j.entry_date, item: j })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/app/customers"><ArrowLeft className="w-4 h-4 mr-1" />Alla kunder</Link></Button>

      {/* Kundkort */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight font-heading">{customer.name}</h1>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">{statusLabels[customer.status] || customer.status}</span>
              {customer.tags && <span className="rounded bg-secondary px-2 py-0.5 text-xs">{customer.tags}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {customer.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{customer.email}</span>}
              {customer.address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{customer.address}</span>}
              {customer.birth_date && <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{fmtDate(customer.birth_date)}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild><Link to="/app/journal"><FileText className="w-4 h-4 mr-1" />Ny journal</Link></Button>
            <Button size="sm" variant="outline" asChild><Link to="/app/bookings"><CalendarDays className="w-4 h-4 mr-1" />Ny bokning</Link></Button>
          </div>
        </div>
        {customer.notes && <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">{customer.notes}</p>}
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Bokningar</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{bookings.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Journalanteckningar</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{journals.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Totalt spenderat</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{totalSpent.toLocaleString("sv-SE")} kr</p>
        </div>
      </div>

      {/* Samtycken */}
      <ConsentsPanel customerId={id} customerName={customer.name} />

      {/* Tidslinje */}
      <div>
        <h2 className="mb-3 text-lg font-semibold font-heading">Historik</h2>
        {timeline.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            Ingen historik än. Skapa en bokning eller journalanteckning för denna kund.
          </div>
        ) : (
          <div className="space-y-3">
            {timeline.map((t) => {
              if (t.type === "booking") {
                const b = t.item;
                const st = bookingStatus[b.status] || { label: b.status, cls: "bg-secondary text-muted-foreground" };
                return (
                  <div key={`b-${b.id}`} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><CalendarDays className="w-4 h-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{b.treatment_name || "Bokning"}</p>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{fmtDateTime(b.start_time)}{b.staff_name ? ` · ${b.staff_name}` : ""}{b.price ? ` · ${b.price.toLocaleString("sv-SE")} kr` : ""}</p>
                      {b.notes && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{b.notes}</p>}
                    </div>
                  </div>
                );
              }
              const j = t.item;
              return (
                <div key={`j-${j.id}`} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><FileText className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{j.treatment_name || "Journalanteckning"} <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">v{j.version || 1}</span></p>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}