import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, CalendarDays, Lock, PenLine, Stethoscope, ChevronDown, Activity } from "lucide-react";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const bookingStatus = {
  completed: { label: "Klar", cls: "bg-emerald-100 text-emerald-700" },
  in_progress: { label: "Pågår", cls: "bg-violet-100 text-violet-700" },
  cancelled: { label: "Inställd", cls: "bg-rose-100 text-rose-700" },
  no_show: { label: "Utebliven", cls: "bg-rose-100 text-rose-700" },
};

const FILTERS = [
  { key: "all", label: "Allt" },
  { key: "treatment", label: "Behandlingar" },
  { key: "journal", label: "Journalanteckningar" },
];

// En enskild journalpost med utfällbara detaljer.
function JournalCard({ j }) {
  const [open, setOpen] = useState(false);
  const details = [
    { label: "Observationer", value: j.observations },
    { label: "Bedömning", value: j.assessment },
    { label: "Utförd behandling", value: j.treatment_performed },
    { label: "Eftervård", value: j.aftercare },
    { label: "Rekommendationer", value: j.recommendations },
  ].filter((d) => d.value);
  const hasDetails = details.length > 0 || j.notes;

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        <FileText className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {j.treatment_name || "Journalanteckning"}
            <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">v{j.version || 1}</span>
          </p>
          {j.is_signed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <Lock className="w-3 h-3" />Signerad
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <PenLine className="w-3 h-3" />Osignerad
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {fmtDateTime(j.entry_date)}{j.provider ? ` · ${j.provider}` : ""}
        </p>
        {j.notes && !open && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{j.notes}</p>}
        {hasDetails && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
              {open ? "Dölja detaljer" : "Visa detaljer"}
            </button>
            {open && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {j.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Anteckningar</p>
                    <p className="text-sm whitespace-pre-wrap">{j.notes}</p>
                  </div>
                )}
                {details.map((d) => (
                  <div key={d.label}>
                    <p className="text-xs font-medium text-muted-foreground">{d.label}</p>
                    <p className="text-sm whitespace-pre-wrap">{d.value}</p>
                  </div>
                ))}
                {j.is_signed && j.signed_by && (
                  <p className="text-xs text-muted-foreground">Signerad av {j.signed_by}{j.signed_at ? ` · ${fmtDateTime(j.signed_at)}` : ""}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// En genomförd behandling (bokning).
function TreatmentCard({ b }) {
  const st = bookingStatus[b.status] || { label: b.status, cls: "bg-secondary text-muted-foreground" };
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        <Stethoscope className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{b.treatment_name || "Behandling"}</p>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {fmtDateTime(b.start_time)}{b.staff_name ? ` · ${b.staff_name}` : ""}{b.price ? ` · ${b.price.toLocaleString("sv-SE")} kr` : ""}
        </p>
        {b.notes && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{b.notes}</p>}
      </div>
    </div>
  );
}

// Samlad vy över kundens vårdhistorik: journalanteckningar och genomförda behandlingar.
export default function CareHistoryTimeline({ bookings = [], journals = [] }) {
  const [filter, setFilter] = useState("all");

  // Genomförda och pågående behandlingar räknas som vårdhistorik.
  const treatments = useMemo(
    () => bookings.filter((b) => ["completed", "in_progress"].includes(b.status)),
    [bookings]
  );

  const events = useMemo(() => {
    const items = [];
    if (filter !== "journal") {
      treatments.forEach((b) => items.push({ kind: "treatment", date: b.start_time, item: b }));
    }
    if (filter !== "treatment") {
      journals.forEach((j) => items.push({ kind: "journal", date: j.entry_date, item: j }));
    }
    return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [filter, treatments, journals]);

  // Gruppera per månad för överblick.
  const grouped = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      const d = e.date ? new Date(e.date) : new Date(0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { label: d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" }), items: [] });
      map.get(key).items.push(e);
    });
    return Array.from(map.entries()).map(([key, group]) => ({ key, ...group }));
  }, [events]);

  const counts = {
    all: treatments.length + journals.length,
    treatment: treatments.length,
    journal: journals.length,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold font-heading">
          <Activity className="w-5 h-5 text-primary" /> Vårdhistorik
        </h2>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          Ingen vårdhistorik att visa för denna kund.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
              <div className="space-y-3">
                {group.items.map((e) =>
                  e.kind === "journal" ? (
                    <JournalCard key={`j-${e.item.id}`} j={e.item} />
                  ) : (
                    <TreatmentCard key={`t-${e.item.id}`} b={e.item} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}