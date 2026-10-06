import React, { useEffect, useState } from "react";
import { getPublicBookingData } from "@/functions/getPublicBookingData";
import { getAvailableSlots } from "@/functions/getAvailableSlots";
import { createPublicBooking } from "@/functions/createPublicBooking";
import StripePaymentStep from "@/components/stripe/StripePaymentStep";
import { canPerform } from "@/lib/staffCompetence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles, CalendarDays, User, Check, ArrowLeft, Loader2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { n: 1, label: "Behandling", icon: Sparkles },
  { n: 2, label: "Behandlare", icon: User },
  { n: 3, label: "Tid", icon: CalendarDays },
  { n: 4, label: "Uppgifter", icon: Check },
  { n: 5, label: "Bekräftelse", icon: CheckCircle2 },
];

// All visning sker i klinikens tidszon, oavsett besökarens enhet.
const TZ = "Europe/Stockholm";
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const hourOf = (iso) => parseInt(new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", hour12: false, timeZone: TZ }), 10);
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const fmtFull = (iso) => new Date(iso).toLocaleString("sv-SE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const slotGroups = (slots) => [
  { label: "Förmiddag", slots: slots.filter((s) => hourOf(s) < 12) },
  { label: "Eftermiddag", slots: slots.filter((s) => hourOf(s) >= 12) },
].filter((g) => g.slots.length > 0);

const treatmentRequirements = (t) => {
  if (!t) return [];
  const r = [];
  if (t.requires_health_declaration) r.push("Hälsodeklaration");
  if (t.requires_consent) r.push("Samtycke");
  if (t.requires_treatment_info) r.push("Behandlingsinformation & risker");
  if (t.requires_aftercare) r.push("Eftervårdsinformation");
  if (t.requires_payment) r.push("Betalning");
  if (t.min_age > 0) r.push(`Ålderskontroll (minst ${t.min_age} år)`);
  if (t.waiting_period_days > 0) r.push(`Väntetid ${t.waiting_period_days} dagar`);
  let formCount = 0;
  try { formCount = JSON.parse(t.required_form_ids || "[]").length; } catch { /* ignore */ }
  if (formCount > 0) r.push(`${formCount} formulär`);
  return r;
};

export default function PublicBooking() {
  const [init, setInit] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState(null);

  const [step, setStep] = useState(1);
  const [treatment, setTreatment] = useState(null);
  const [staff, setStaff] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState(null);

  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", birth_date: "", personnummer: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [pendingBooking, setPendingBooking] = useState(null);
  const [payError, setPayError] = useState(null);
  const [pendingReqs, setPendingReqs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getPublicBookingData({});
        setInit(res.data);
        const wanted = new URLSearchParams(window.location.search).get("treatment");
        const pre = res.data.treatments.find((t) => t.id === wanted);
        if (pre) { setTreatment(pre); setStep(2); }
      } catch (e) {
        setInitError(e.message || "Kunde inte ladda");
      } finally {
        setLoadingInit(false);
      }
    })();
  }, []);

  const loadSlots = async (staffName, dateStr, t) => {
    if (!staffName || !dateStr || !t) { setSlots([]); return; }
    setLoadingSlots(true);
    setSlot(null);
    try {
      const res = await getAvailableSlots({ clinic_id: init.clinic.id, staff_name: staffName, date: dateStr, duration: t.duration || 30, treatment_id: t.id });
      setSlots(res.data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const pickTreatment = (t) => { setTreatment(t); setStaff(null); setSlot(null); setStep(2); };
  const pickStaff = (s) => { setStaff(s); setSlot(null); setStep(3); loadSlots(s.name, date, treatment); };
  const onDateChange = (e) => {
    const d = e.target.value;
    setDate(d);
    setSlot(null);
    if (staff) loadSlots(staff.name, d, treatment);
  };

  const submit = async () => {
    setSubmitError(null);
    if (!customer.name || !customer.email) { setSubmitError("Namn och e-post krävs"); return; }
    setSubmitting(true);
    try {
      const res = await createPublicBooking({
        clinic_id: init.clinic.id,
        treatment_id: treatment.id,
        staff_name: staff.name,
        start_time: slot,
        customer,
      });
      const booking = res.data.booking;
      setPendingReqs(res.data.requirements || []);
      if (treatment.requires_payment && treatment.price > 0) {
        setPendingBooking(booking);
        setPayError(null);
        setStep(5);
      } else {
        setConfirmation(booking);
        setStep(5);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "Kunde inte boka";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Endast behandlare som får utföra vald behandling visas (servern nekar dessutom alla andra).
  const eligibleStaff = (init?.staff || []).filter((s) => canPerform(s, treatment?.id));

  if (loadingInit) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (initError) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center"><p className="text-sm text-muted-foreground">{initError}</p></div>;
  }
  if (!init) return null;

  if (confirmation) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="mx-auto max-w-2xl px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{init.clinic.brand_name || init.clinic.name}</p>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <CheckCircle2 className="mx-auto mb-4 w-12 h-12 text-emerald-500" />
          <h1 className="text-2xl font-semibold font-heading">Bokning bekräftad!</h1>
          <p className="mt-2 text-muted-foreground">Vi ser fram emot att se dig.</p>
          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-border bg-card p-5 text-left">
            <p className="font-medium">{confirmation.treatment_name}</p>
            <p className="text-sm text-muted-foreground">{fmtFull(confirmation.start_time)}</p>
            <p className="text-sm text-muted-foreground">Behandlare: {confirmation.staff_name}</p>
            {confirmation.price != null && <p className="mt-2 text-sm">Pris: {confirmation.price.toLocaleString("sv-SE")} kr</p>}
          </div>
          {pendingReqs.length > 0 && (
            <div className="mx-auto mt-4 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm">
              <p className="font-medium text-amber-900">Att göra före besöket</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
                {pendingReqs.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="mt-2 text-amber-700">Skapa ett konto med samma e-postadress ({customer.email}) – <a href="/register" className="underline">registrera dig</a> eller <a href="/login" className="underline">logga in</a> – för att komplettera i kundportalen.</p>
            </div>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            Vid frågor, kontakta kliniken{init.clinic.phone ? ` på ${init.clinic.phone}` : ""}.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{init.clinic.brand_name || init.clinic.name}</p>
          <h1 className="text-xl font-semibold font-heading">Boka tid</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.n;
            const done = step > s.n;
            return (
              <React.Fragment key={s.n}>
                <button
                  type="button"
                  disabled={s.n >= step}
                  onClick={() => s.n < step && setStep(s.n)}
                  className={cn("flex items-center gap-2", s.n < step ? "cursor-pointer" : "cursor-default")}
                >
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium", active ? "border-primary bg-primary text-primary-foreground" : done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-muted-foreground")}>
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </span>
                  <span className={cn("hidden text-sm sm:block", active ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className={cn("h-px flex-1", step > s.n ? "bg-emerald-500" : "bg-border")} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {step === 1 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">Välj behandling</h2>
            <p className="mb-4 text-sm text-muted-foreground">Välj den behandling du vill boka.</p>
            {init.treatments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga behandlingar tillgängliga just nu.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {init.treatments.map((t) => (
                  <button key={t.id} type="button" onClick={() => pickTreatment(t)} className={cn("rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary", treatment?.id === t.id && "border-primary ring-1 ring-primary")}>
                    <p className="font-medium">{t.name}</p>
                    {t.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                    <p className="mt-2 text-sm text-muted-foreground">{t.duration || 30} min{t.price != null ? ` · ${t.price.toLocaleString("sv-SE")} kr` : ""}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">Välj behandlare</h2>
            <p className="mb-4 text-sm text-muted-foreground">Vem vill du bli behandlad av?</p>
            {eligibleStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen behandlare kan utföra den här behandlingen online just nu. Kontakta kliniken.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {eligibleStaff.map((s) => (
                  <button key={s.id} type="button" onClick={() => pickStaff(s)} className={cn("flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary", staff?.id === s.id && "border-primary ring-1 ring-primary")}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground"><User className="w-5 h-5" /></span>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.title && <p className="text-sm text-muted-foreground">{s.title}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">Välj dag och tid</h2>
            <p className="mb-4 text-sm text-muted-foreground">Välj en ledig tid för din behandling.</p>
            <div className="mb-4 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{treatment?.name}</p>
                  <p className="text-muted-foreground">{staff?.name}</p>
                </div>
                {treatment?.price != null && <p className="shrink-0 font-medium">{treatment.price.toLocaleString("sv-SE")} kr</p>}
              </div>
            </div>
            <div className="mb-4">
              <Label htmlFor="date" className="mb-1.5 block">Datum</Label>
              <Input id="date" type="date" value={date} min={todayStr()} onChange={onDateChange} className="max-w-[200px]" />
            </div>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Hämtar tillgängliga tider...</div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga lediga tider denna dag. Prova ett annat datum.</p>
            ) : (
              <div className="space-y-4">
                {slotGroups(slots).map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {group.slots.map((s) => (
                        <button key={s} type="button" onClick={() => { setSlot(s); setStep(4); }} className={cn("rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-accent", slot === s && "border-primary bg-primary text-primary-foreground")}>{fmtTime(s)}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Button>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-md">
            <h2 className="mb-1 text-lg font-semibold">Dina uppgifter</h2>
            <p className="mb-4 text-sm text-muted-foreground">Bekräfta din bokning.</p>
            <div className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">{treatment.name}</p>
              <p className="text-muted-foreground">{fmtFull(slot)}</p>
              <p className="text-muted-foreground">Behandlare: {staff.name}</p>
              {treatment.price != null && <p className="mt-1">Pris: {treatment.price.toLocaleString("sv-SE")} kr</p>}
            </div>
            {treatmentRequirements(treatment).length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium text-amber-900">Krav före behandling</p>
                <p className="text-amber-700">Följande måste kompletteras i kundportalen innan besöket:</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-800">
                  {treatmentRequirements(treatment).map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <Label htmlFor="name" className="mb-1.5 block">Namn *</Label>
                <Input id="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="email" className="mb-1.5 block">E-post *</Label>
                <Input id="email" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="phone" className="mb-1.5 block">Telefon</Label>
                <Input id="phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
              {treatment?.min_age > 0 && (
                <div>
                  <Label htmlFor="birth_date" className="mb-1.5 block">Födelsedatum *<span className="ml-1 text-xs text-muted-foreground">(ålderskontroll, minst {treatment.min_age} år)</span></Label>
                  <Input id="birth_date" type="date" value={customer.birth_date} onChange={(e) => setCustomer({ ...customer, birth_date: e.target.value })} max={todayStr()} />
                </div>
              )}
              <div>
                <Label htmlFor="personnummer" className="mb-1.5 block">Personnummer <span className="text-xs text-muted-foreground">(frivilligt)</span></Label>
                <Input id="personnummer" value={customer.personnummer} onChange={(e) => setCustomer({ ...customer, personnummer: e.target.value })} placeholder="ÅÅMMDD-XXXX" />
              </div>
            </div>
            {submitError && <p className="mt-3 text-sm text-rose-600">{submitError}</p>}
            <Button className="mt-4 w-full" disabled={submitting} onClick={submit}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Bekräftar...</> : "Bekräfta bokning"}
            </Button>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Button>
          </div>
        )}

        {step === 5 && pendingBooking && (
          <div className="max-w-md">
            <h2 className="mb-1 text-lg font-semibold">Betalning</h2>
            <p className="mb-4 text-sm text-muted-foreground">Slutför bokningen genom att betala nu.</p>
            <div className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">{treatment.name}</p>
              <p className="text-muted-foreground">{fmtFull(pendingBooking.start_time)}</p>
              <p className="text-muted-foreground">Behandlare: {pendingBooking.staff_name}</p>
              <p className="mt-1">Att betala: {treatment.price.toLocaleString("sv-SE")} kr</p>
            </div>
            {payError && <p className="mb-3 text-sm text-rose-600">{payError}</p>}
            <StripePaymentStep
              booking={pendingBooking}
              amountLabel={`${treatment.price.toLocaleString("sv-SE")} kr`}
              onPaid={() => { setConfirmation(pendingBooking); setStep(5); }}
              onError={(m) => setPayError(m)}
              onSkip={() => { setConfirmation(pendingBooking); setStep(5); }}
            />
            <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setStep(4)}><ArrowLeft className="w-4 h-4 mr-1" />Tillbaka</Button>
          </div>
        )}
      </main>
    </div>
  );
}