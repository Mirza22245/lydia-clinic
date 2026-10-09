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
import UnderConstruction from "@/components/UnderConstruction";

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
  const [slotError, setSlotError] = useState(null);
  const [nextAvailable, setNextAvailable] = useState([]);
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

  const loadSlots = async (staffName, dateStr, t, { suggestNext = true } = {}) => {
    if (!staffName || !dateStr || !t) { setSlots([]); return; }
    setLoadingSlots(true);
    setSlot(null);
    setSlotError(null);
    setNextAvailable([]);
    try {
      const res = await getAvailableSlots({
        clinic_id: init.clinic.id,
        staff_name: staffName,
        date: dateStr,
        duration: t.duration || 30,
        treatment_id: t.id,
      });
      const found = res.data.slots || [];
      setSlots(found);

      if (!found.length && suggestNext) {
        const base = new Date(`${dateStr}T12:00:00`);
        const candidates = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(base);
          d.setDate(d.getDate() + i + 1);
          return d.toLocaleDateString("sv-SE");
        });
        const results = await Promise.all(candidates.map(async (d) => {
          try {
            const r = await getAvailableSlots({
              clinic_id: init.clinic.id,
              staff_name: staffName,
              date: d,
              duration: t.duration || 30,
              treatment_id: t.id,
            });
            return { date: d, slots: r.data.slots || [] };
          } catch {
            return { date: d, slots: [] };
          }
        }));
        setNextAvailable(results.filter((x) => x.slots.length > 0).slice(0, 3));
      }
    } catch (e) {
      setSlots([]);
      setNextAvailable([]);
      setSlotError(e?.response?.data?.error || e?.message || "Kunde inte hämta lediga tider.");
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
      const booking = { ...res.data.booking, payment_token: res.data.payment_token };
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
  if (!init.booking_open) return <UnderConstruction clinic={init.clinic} />;

  if (confirmation) {
    return (
      <div className="min-h-screen bg-[#f8f6f1] text-[#171714]">
        <header className="border-b border-black/10 bg-white/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
            <p className="font-heading text-lg font-semibold tracking-tight">{init.clinic.brand_name || init.clinic.name}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eee4] px-3 py-1.5 text-xs font-medium text-[#52634c]"><CheckCircle2 className="h-3.5 w-3.5" /> Bokning klar</span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-16">
          <CheckCircle2 className="mx-auto mb-4 w-12 h-12 text-emerald-500" />
          <h1 className="text-2xl font-semibold font-heading">Bokning bekräftad!</h1>
          <p className="mt-2 text-muted-foreground">Din tid är nu bokad. Eventuella hälsouppgifter, formulär och betänketider hanteras separat före själva behandlingen.</p>
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
    <div className="min-h-screen bg-[#f8f6f1] pb-8 text-[#171714]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f8f6f1]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <a href="/" className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold tracking-tight">{init.clinic.brand_name || init.clinic.name}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-black/45">Onlinebokning</p>
          </a>
          <a href="/login" className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold transition hover:bg-black/5 sm:text-sm">Logga in</a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Steg {Math.min(step, 4)} av 4</p>
          <p className="truncate text-xs font-medium text-black/65">{steps[Math.min(step - 1, 3)]?.label || "Bokning"}</p>
        </div>
        <div className="flex items-center gap-2">
          {steps.slice(0, 4).map((s, i) => {
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
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors sm:h-9 sm:w-9", active ? "border-[#171714] bg-[#171714] text-white" : done ? "border-[#65735d] bg-[#65735d] text-white" : "border-black/10 bg-[#f8f6f1] text-black/35")}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className={cn("hidden text-sm sm:block", active ? "font-semibold text-[#171714]" : done ? "text-[#65735d]" : "text-black/40")}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className={cn("h-px flex-1", step > s.n ? "bg-[#65735d]" : "bg-black/10")} />}
              </React.Fragment>
            );
          })}
        </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        {step === 1 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#65735d]">Välkommen</p>
            <h2 className="mb-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Vad vill du boka?</h2>
            <p className="mb-5 max-w-xl text-sm leading-6 text-black/55 sm:text-base">Välj en behandling för att se tillgängliga tider och hitta det som passar dig.</p>
            {init.treatments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga behandlingar tillgängliga just nu.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {init.treatments.map((t) => (
                  <button key={t.id} type="button" onClick={() => pickTreatment(t)} className={cn("group relative flex min-h-[132px] w-full flex-col rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#65735d]/60 hover:shadow-md active:scale-[0.99] sm:p-5", treatment?.id === t.id && "border-[#65735d] ring-2 ring-[#65735d]/15")}>
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef1e9] text-[#65735d]"><Sparkles className="h-5 w-5" /></span>
                    <span className="pr-5 font-semibold leading-snug">{t.name}</span>
                    {t.description && <span className="mt-1.5 line-clamp-2 text-sm leading-5 text-black/55">{t.description}</span>}
                    <span className="mt-auto flex w-full items-center justify-between gap-2 pt-4 text-sm">
                      <span className="text-black/50">{t.duration || 30} min</span>
                      <span className="font-semibold">{t.price != null ? `${t.price.toLocaleString("sv-SE")} kr` : "Pris vid konsultation"} <span className="ml-1 text-[#65735d]">→</span></span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Välj behandlare</h2>
            <p className="mb-5 text-sm leading-6 text-black/55">Vem vill du bli behandlad av?</p>
            {eligibleStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen behandlare kan utföra den här behandlingen online just nu. Kontakta kliniken.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {eligibleStaff.map((s) => (
                  <button key={s.id} type="button" onClick={() => pickStaff(s)} className={cn("flex min-h-[84px] items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:border-[#65735d]/60 hover:shadow-md", staff?.id === s.id && "border-[#65735d] ring-2 ring-[#65735d]/15")}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef1e9] text-[#65735d]"><User className="h-5 w-5" /></span>
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
            <h2 className="mb-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Hitta en tid som passar</h2>
            <p className="mb-5 text-sm leading-6 text-black/55">Välj datum och sedan en av de lediga tiderna.</p>
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
            ) : slotError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                Kunde inte hämta lediga tider: {slotError}
              </div>
            ) : slots.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Inga lediga tider denna dag.</p>
                {nextAvailable.length > 0 ? (
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-sm font-medium">Nästa lediga dagar</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {nextAvailable.map((item) => (
                        <Button key={item.date} type="button" variant="outline" size="sm" onClick={() => { setDate(item.date); setSlots(item.slots); setNextAvailable([]); }}>
                          {new Date(`${item.date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                          <span className="ml-1 text-muted-foreground">({item.slots.length} tider)</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Ingen ledig tid hittades de närmaste 7 dagarna. Välj ett annat datum eller kontakta kliniken.</p>
                )}
              </div>
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
            <h2 className="mb-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Nästan klart</h2>
            <p className="mb-5 text-sm leading-6 text-black/55">Fyll i dina uppgifter för att skicka bokningen.</p>
            <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm">
              <p className="font-medium">{treatment.name}</p>
              <p className="text-muted-foreground">{fmtFull(slot)}</p>
              <p className="text-muted-foreground">Behandlare: {staff.name}</p>
              {treatment.price != null && <p className="mt-1">Pris: {treatment.price.toLocaleString("sv-SE")} kr</p>}
            </div>
            {treatmentRequirements(treatment).length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium text-amber-900">Krav före behandlingen</p>
                <p className="text-amber-700">Följande kan behöva kompletteras före själva behandlingen:</p>
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
            <div className="mb-4 rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm">
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