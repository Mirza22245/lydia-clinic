import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getPatientPortalData } from "@/functions/getPatientPortalData";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, CalendarDays, FileText, HeartPulse, ClipboardList, LogOut,
  Lock, PenLine, Stethoscope, ChevronDown, Mail, Phone, Cake,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" }) : "");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const bookingStatus = {
  pending: { label: "Väntar", cls: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Bekräftad", cls: "bg-blue-100 text-blue-700" },
  checked_in: { label: "Incheckad", cls: "bg-indigo-100 text-indigo-700" },
  in_progress: { label: "Pågår", cls: "bg-violet-100 text-violet-700" },
  completed: { label: "Klar", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Inställd", cls: "bg-rose-100 text-rose-700" },
  no_show: { label: "Utebliven", cls: "bg-rose-100 text-rose-700" },
  draft: { label: "Utkast", cls: "bg-secondary text-muted-foreground" },
};

function StatusBadge({ status }) {
  const st = bookingStatus[status] || { label: status, cls: "bg-secondary text-muted-foreground" };
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span>;
}

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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{j.treatment_name || "Journalanteckning"}</p>
        {j.is_signed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Lock className="w-3 h-3" />Signerad</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><PenLine className="w-3 h-3" />Utkast</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{fmtDateTime(j.entry_date)}{j.provider ? ` · ${j.provider}` : ""}</p>
      {j.notes && !open && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{j.notes}</p>}
      {hasDetails && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
            {open ? "Dölj detaljer" : "Visa detaljer"}
          </button>
          {open && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {j.notes && <div><p className="text-xs font-medium text-muted-foreground">Anteckningar</p><p className="text-sm whitespace-pre-wrap">{j.notes}</p></div>}
              {details.map((d) => (
                <div key={d.label}><p className="text-xs font-medium text-muted-foreground">{d.label}</p><p className="text-sm whitespace-pre-wrap">{d.value}</p></div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 w-6 h-6 opacity-50" />
      {text}
    </div>
  );
}

export default function Portal() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getPatientPortalData({});
        setData(res.data);
      } catch (e) {
        setError(e.message || "Kunde inte hämta din data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = () => base44.auth.logout("/login");

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Något gick fel: {error}</p>
        <Button variant="outline" size="sm" onClick={handleLogout}>Logga ut</Button>
      </div>
    );
  }
  if (!data || !data.customer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <FileText className="w-8 h-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Ingen patientprofil hittades</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Det finns ingen kundprofil kopplad till din e-postadress. Kontakta kliniken om du tror att detta är fel.</p>
        <Button variant="outline" size="sm" onClick={handleLogout}>Logga ut</Button>
      </div>
    );
  }

  const { customer, bookings, journals, healthDeclarations, formSubmissions } = data;
  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.start_time) >= now && !["cancelled", "no_show"].includes(b.status));
  const past = bookings.filter((b) => new Date(b.start_time) < now || ["cancelled", "no_show"].includes(b.status));

  const parseAnswers = (a) => {
    if (!a) return [];
    try { return Object.entries(JSON.parse(a)); } catch { return []; }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Patientportal</p>
            <h1 className="text-xl font-semibold font-heading">{customer.name}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4 mr-1" />Logga ut</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Kontaktuppgifter */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {customer.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{customer.email}</span>}
            {customer.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{customer.phone}</span>}
            {customer.birth_date && <span className="flex items-center gap-1.5"><Cake className="w-3.5 h-3.5" />{fmtDate(customer.birth_date)}</span>}
          </div>
        </div>

        <Tabs defaultValue="bookings">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="bookings">Bokningar</TabsTrigger>
            <TabsTrigger value="journals">Journal</TabsTrigger>
            <TabsTrigger value="health">Hälsodeklarationer</TabsTrigger>
            <TabsTrigger value="forms">Formulär</TabsTrigger>
          </TabsList>

          {/* Bokningar */}
          <TabsContent value="bookings" className="space-y-6">
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Kommande bokningar</h2>
              {upcoming.length === 0 ? (
                <EmptyState icon={CalendarDays} text="Du har inga kommande bokningar." />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((b) => (
                    <div key={b.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><CalendarDays className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{b.treatment_name || "Bokning"}</p>
                          <StatusBadge status={b.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">{fmtDateTime(b.start_time)}{b.staff_name ? ` · ${b.staff_name}` : ""}</p>
                        {b.notes && <p className="mt-1 text-sm text-muted-foreground">{b.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tidigare bokningar</h2>
              {past.length === 0 ? (
                <EmptyState icon={CalendarDays} text="Inga tidigare bokningar." />
              ) : (
                <div className="space-y-3">
                  {past.map((b) => (
                    <div key={b.id} className="flex gap-3 rounded-xl border border-border bg-card p-4 opacity-90">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Stethoscope className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{b.treatment_name || "Bokning"}</p>
                          <StatusBadge status={b.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">{fmtDateTime(b.start_time)}{b.staff_name ? ` · ${b.staff_name}` : ""}{b.price ? ` · ${b.price.toLocaleString("sv-SE")} kr` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Journal */}
          <TabsContent value="journals" className="space-y-3">
            <p className="text-sm text-muted-foreground">Här kan du läsa din journalhistorik. Signerade journaler är låsta och kan inte ändras.</p>
            {journals.length === 0 ? (
              <EmptyState icon={FileText} text="Inga journalanteckningar än." />
            ) : (
              journals.map((j) => <JournalCard key={j.id} j={j} />)
            )}
          </TabsContent>

          {/* Hälsodeklarationer */}
          <TabsContent value="health" className="space-y-3">
            {healthDeclarations.length === 0 ? (
              <EmptyState icon={HeartPulse} text="Inga hälsodeklarationer inlämnade." />
            ) : (
              healthDeclarations.map((h) => {
                const flags = [
                  h.pregnant && "Gravid", h.breastfeeding && "Ammar", h.heart_condition && "Hjärtbesvär",
                  h.high_blood_pressure && "Hög blodtryck", h.diabetes && "Diabetes", h.asthma && "Astma",
                  h.skin_condition && "Hudbesvär", h.smoking && "Rökning",
                ].filter(Boolean);
                return (
                  <div key={h.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Hälsodeklaration</p>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(h.submitted_at)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      {h.allergies && <div><span className="text-muted-foreground">Allergier: </span>{h.allergies}</div>}
                      {h.medications && <div><span className="text-muted-foreground">Mediciner: </span>{h.medications}</div>}
                      {h.conditions && <div><span className="text-muted-foreground">Sjukdomar: </span>{h.conditions}</div>}
                      {h.surgeries && <div><span className="text-muted-foreground">Operationer: </span>{h.surgeries}</div>}
                    </div>
                    {flags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {flags.map((f) => <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{f}</span>)}
                      </div>
                    )}
                    {h.other && <p className="mt-2 text-sm text-muted-foreground">{h.other}</p>}
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* Formulär */}
          <TabsContent value="forms" className="space-y-3">
            {formSubmissions.length === 0 ? (
              <EmptyState icon={ClipboardList} text="Inga ifyllda formulär." />
            ) : (
              formSubmissions.map((f) => {
                const answers = parseAnswers(f.answers);
                return (
                  <div key={f.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{f.template_name || "Formulär"}</p>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(f.submitted_at)}</span>
                    </div>
                    {answers.length > 0 && (
                      <dl className="mt-3 space-y-1.5 text-sm">
                        {answers.map(([q, a]) => (
                          <div key={q} className="flex gap-2">
                            <dt className="text-muted-foreground">{q}:</dt>
                            <dd>{String(a)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}