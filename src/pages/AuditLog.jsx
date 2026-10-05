import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";

const eventLabels = {
  journal_create: "Journal skapad",
  journal_update: "Journal uppdaterad",
  journal_sign: "Journal signerad",
  journal_amend: "Ny journalversion",
  journal_delete: "Journal borttagen",
  consent_sign: "Samtycke signerat",
  booking_create: "Bokning skapad",
  booking_update: "Bokning uppdaterad",
  booking_status: "Bokningsstatus ändrad",
  booking_delete: "Bokning borttagen",
  payment_create: "Betalning registrerad",
  customer_create: "Kund skapad",
  customer_update: "Kund uppdaterad",
  customer_delete: "Kund borttagen",
};

const eventTone = {
  journal_sign: "bg-emerald-100 text-emerald-700",
  consent_sign: "bg-emerald-100 text-emerald-700",
  payment_create: "bg-emerald-100 text-emerald-700",
  journal_create: "bg-blue-100 text-blue-700",
  booking_create: "bg-blue-100 text-blue-700",
  customer_create: "bg-blue-100 text-blue-700",
  journal_update: "bg-amber-100 text-amber-700",
  booking_update: "bg-amber-100 text-amber-700",
  booking_status: "bg-amber-100 text-amber-700",
  customer_update: "bg-amber-100 text-amber-700",
  journal_amend: "bg-violet-100 text-violet-700",
  journal_delete: "bg-rose-100 text-rose-700",
  booking_delete: "bg-rose-100 text-rose-700",
  customer_delete: "bg-rose-100 text-rose-700",
};

const entityFilters = [
  { key: "all", label: "Alla" },
  { key: "JournalEntry", label: "Journal" },
  { key: "Consent", label: "Samtycke" },
  { key: "Booking", label: "Bokning" },
  { key: "Payment", label: "Betalning" },
  { key: "Customer", label: "Kund" },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function AuditLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (entity !== "all") query.entity_type = entity;
      if (search.trim()) query.description = { $regex: search.trim(), $options: "i" };
      const page = await base44.entities.AuditLog.filter(query, { sort: "-created_date", limit: 100 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [entity, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Audit-logg</h1>
        <p className="text-sm text-muted-foreground">Oföränderlig historik över vem som gjort vad, för patientsäkerhetens skull.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {entityFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setEntity(f.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                entity === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök i beskrivning…" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <ShieldCheck className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Inga audit-händelser</p>
          <p className="mt-1 text-sm text-muted-foreground">Händelser registreras automatiskt vid journal- och samtyckeshantering.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", eventTone[a.event_type] || "bg-slate-100 text-slate-600")}>
                    {eventLabels[a.event_type] || a.event_type}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.entity_type}</span>
                </div>
                <p className="mt-1 text-sm">{a.description || "—"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{a.user_name || "Okänd"}</span>
                  <span>{fmtDate(a.created_date)}</span>
                  {a.metadata && (() => {
                    let m = null;
                    try { m = JSON.parse(a.metadata); } catch { /* ignore */ }
                    return m && Object.keys(m).length > 0 ? (
                      <span className="truncate font-mono">{JSON.stringify(m)}</span>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}