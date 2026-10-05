import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Phone, Mail, MapPin, CalendarDays, FileText } from "lucide-react";
import ConsentsPanel from "@/components/ConsentsPanel";
import FormSubmissionsPanel from "@/components/FormSubmissionsPanel";
import HealthDeclarationsPanel from "@/components/HealthDeclarationsPanel";
import CareHistoryTimeline from "@/components/CareHistoryTimeline";
import ReceiptsPanel from "@/components/ReceiptsPanel";

const statusLabels = { active: "Aktiv", inactive: "Inaktiv", lead: "Lead" };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "");

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

      {/* Hälsodeklarationer */}
      <HealthDeclarationsPanel customerId={id} customerName={customer.name} />

      {/* Formulär */}
      <FormSubmissionsPanel customerId={id} />

      {/* Kvitton & betalningar */}
      <ReceiptsPanel customerId={id} clinicName="Lydia Demo Klinik" />

      {/* Samlad vårdhistorik */}
      <CareHistoryTimeline bookings={bookings} journals={journals} />
    </div>
  );
}