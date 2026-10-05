import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, CalendarDays, FileText, Lock, PenLine, User, Plus, Check, X, AlertTriangle, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBookingRequirements } from "@/functions/getBookingRequirements";
import { updateBookingStatus } from "@/functions/updateBookingStatus";
import TreatmentCompliancePanel from "@/components/TreatmentCompliancePanel";
import ClinicalRecordPanel from "@/components/ClinicalRecordPanel";
import BeforeAfterPanel from "@/components/BeforeAfterPanel";
import RescheduleDialog from "@/components/RescheduleDialog";

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

// Statusövergångar som personal kan utföra. Advancing-statusar valideras mot
// behandlingens obligatoriska krav i updateBookingStatus (server-side).
const statusActions = [
  { from: "pending", to: "confirmed", label: "Bekräfta", variant: "default" },
  { from: "confirmed", to: "checked_in", label: "Checka in", variant: "default" },
  { from: "checked_in", to: "in_progress", label: "Starta behandling", variant: "default" },
  { from: "in_progress", to: "completed", label: "Markera klar", variant: "default" },
];
const cancelActions = [
  { to: "cancelled", label: "Avboka", variant: "outline" },
  { to: "no_show", label: "Utebliven", variant: "outline" },
];

export default function BookingDetail() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [journals, setJournals] = useState([]);
  const [reqs, setReqs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [advancing, setAdvancing] = useState(null);
  const [advanceError, setAdvanceError] = useState(null);

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
        try {
          const r = await getBookingRequirements({ booking_id: id });
          setReqs(r.data);
        } catch { /* ingen behandling = inga krav */ }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const advance = async (to) => {
    setAdvanceError(null);
    setAdvancing(to);
    try {
      const res = await updateBookingStatus({ booking_id: id, status: to });
      if (res.data?.ok) {
        setBooking((prev) => ({ ...prev, status: to }));
        // Uppdatera kravbilden (t.ex. efter att betalning registrerats).
        try {
          const r = await getBookingRequirements({ booking_id: id });
          setReqs(r.data);
        } catch { /* ignore */ }
      } else {
        setAdvanceError(res.data?.error || "Kunde inte uppdatera status");
      }
    } catch (e) {
      const d = e?.response?.data;
      if (d?.code === "requirements_incomplete") {
        setAdvanceError({ incomplete: true, missing: d.missing || [], message: d.error });
      } else {
        setAdvanceError(d?.error || e.message || "Kunde inte uppdatera status");
      }
    } finally {
      setAdvancing(null);
    }
  };

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
  const enforceable = reqs?.requirements?.filter((r) => r.required) || [];
  const hasReqs = enforceable.length > 0;

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
          <div className="flex gap-2">
            <RescheduleDialog bookingId={booking.id} />
            <Button size="sm" asChild><Link to={newJournalUrl}><Plus className="w-4 h-4 mr-1" />Ny journal</Link></Button>
          </div>
        </div>

        {/* Statusåtgärder */}
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {statusActions.filter((a) => a.from === booking.status).map((a) => (
              <Button key={a.to} size="sm" variant={a.variant} disabled={advancing === a.to} onClick={() => advance(a.to)}>
                {advancing === a.to && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{a.label}
              </Button>
            ))}
            {!["completed", "cancelled", "no_show"].includes(booking.status) && cancelActions.map((a) => (
              <Button key={a.to} size="sm" variant={a.variant} disabled={advancing === a.to} onClick={() => advance(a.to)}>
                {advancing === a.to && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{a.label}
              </Button>
            ))}
          </div>
          {advanceError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
              <div>
                <p className="font-medium">{typeof advanceError === "string" ? advanceError : advanceError.message}</p>
                {advanceError?.incomplete && advanceError.missing.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-amber-700">
                    {advanceError.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Krav inför behandling */}
      {hasReqs && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold font-heading">Krav inför behandling</h2>
            {reqs.allCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Check className="w-3 h-3" />Alla uppfyllda</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><AlertTriangle className="w-3 h-3" />Saknas</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Behandlingens obligatoriska krav måste vara uppfyllda innan bokningen kan bekräftas eller checkas in.</p>
          <ul className="mt-3 space-y-2">
            {enforceable.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-sm">
                {r.completed
                  ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /></span>
                  : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700"><X className="w-3 h-3" /></span>}
                <span className={cn(r.completed ? "text-foreground" : "font-medium")}>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* IVO Compliance */}
      {booking.treatment_id && booking.customer_id && (
        <TreatmentCompliancePanel bookingId={booking.id} customerId={booking.customer_id} treatmentId={booking.treatment_id} />
      )}

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

      {/* Strukturerad behandlingsjournal */}
      {booking.customer_id && (
        <div className="rounded-xl border border-border bg-card p-5">
          <ClinicalRecordPanel customerId={booking.customer_id} customerName={booking.customer_name} bookingId={booking.id} treatmentId={booking.treatment_id} treatmentName={booking.treatment_name} />
        </div>
      )}

      {/* Före/efter-bilder */}
      {booking.customer_id && (
        <div className="rounded-xl border border-border bg-card p-5">
          <BeforeAfterPanel customerId={booking.customer_id} customerName={booking.customer_name} bookingId={booking.id} treatmentId={booking.treatment_id} treatmentName={booking.treatment_name} />
        </div>
      )}
    </div>
  );
}