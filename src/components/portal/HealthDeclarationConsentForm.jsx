import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertCircle, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitHealthDeclarationConsent } from "@/functions/submitHealthDeclarationConsent";
import SignaturePad from "@/components/portal/SignaturePad";

const treatmentTypes = [
  { key: "filler", label: "Fillers" },
  { key: "botox", label: "Botox / botulinumtoxin" },
  { key: "injektion", label: "Annan injektionsbehandling" },
  { key: "hudvard", label: "Avancerad hudvård / CO2-laser / Peeling" },
  { key: "apparat", label: "Apparatbehandling (HIFU / Radiofrekvens / Fettreducering)" },
  { key: "annan", label: "Annan behandling" },
];

const medicalQuestions = [
  { key: "pregnant_breastfeeding", label: "Graviditet & Amning", question: "Är du gravid eller ammar du?", desc: "Absolut contraindikation för injektioner och vissa lasrar/apparater" },
  { key: "skin_infection", label: "Aktiv hudinfektion", question: "Har du pågående infektion, munsår (herpes), akne eller sår i det område som ska behandlas?" },
  { key: "blood_thinning", label: "Blödarsjuka / Blodförtunnande", question: "Tar du blodförtunnande mediciner (t.ex. Trombyl, Warfarin, Eliquis) eller höga doser Omega-3/NSAID?" },
  { key: "neuromuscular", label: "Sjukdomar & Hälsotillstånd", question: "Har du någon neuromuskulär sjukdom (t.ex. myasthenia gravis – viktigt vid botox), tendens till keloidbildning (skorv-/ärrbildning), eller nedsatt immunförsvar?" },
  { key: "previous_reactions", label: "Tidigare reaktioner", question: "Har du tidigare reagerat negativt på fillers, botox, bedövningsmedel (lidokain) eller laser?" },
  { key: "strong_skincare", label: "Läkemedel och hudvård", question: "Använder du starka hudvårdsprodukter (t.ex. Retin-A, Roaccutan/isotretinoin de senaste 6 månaderna) som påverkar hudens läkning?" },
];

function YesNoQuestion({ question, desc, value, onChange }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3.5">
      <p className="text-sm font-medium">{question}</p>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "rounded-lg border px-5 py-1.5 text-sm font-medium transition-colors",
            value === true ? "border-rose-300 bg-rose-50 text-rose-700" : "border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >Ja</button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "rounded-lg border px-5 py-1.5 text-sm font-medium transition-colors",
            value === false ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >Nej</button>
      </div>
    </div>
  );
}

function AckCheckbox({ checked, onChange, label, required }) {
  return (
    <label className={cn("flex items-start gap-2.5 rounded-lg border p-3.5 cursor-pointer transition-colors", checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30")}>
      <input
        type="checkbox"
        checked={checked || false}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span className="text-sm leading-relaxed">{label}{required && <span className="text-destructive"> *</span>}</span>
    </label>
  );
}

// Kombinerat formulär för hälsodeklaration + samtycke enligt IVO-krav.
// Skapar HealthDeclaration + Consent-poster vid submit, med digital signatur.
export default function HealthDeclarationConsentForm({ customer, bookings = [], onSubmitted, onCancel }) {
  const [form, setForm] = useState({
    name: customer?.name || "",
    personnummer: customer?.personnummer || "",
    phone: customer?.phone || "",
    email: customer?.email || "",
    booking_id: "",
    treatment_type: "",
    treatment_type_other: "",
    pregnant_breastfeeding: null,
    skin_infection: null,
    blood_thinning: null,
    neuromuscular: null,
    previous_reactions: null,
    strong_skincare: null,
    betanketid_acknowledged: false,
    risks_acknowledged: false,
    photo_consent: false,
    signature: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));
  const setBool = (f) => (v) => setForm((s) => ({ ...s, [f]: v }));
  const setCheck = (f) => (v) => setForm((s) => ({ ...s, [f]: v }));

  const isInjection = ["filler", "botox", "injektion"].includes(form.treatment_type);

  const validate = () => {
    if (!form.name.trim()) return "Namn saknas";
    if (!form.personnummer.trim()) return "Personnummer saknas (krävs för åldersverifiering 18+)";
    if (!form.phone.trim()) return "Telefonnummer saknas";
    if (!form.treatment_type) return "Välj typ av behandling";
    if (form.treatment_type === "annan" && !form.treatment_type_other.trim()) return "Beskriv den andra behandlingen";
    for (const q of medicalQuestions) {
      if (form[q.key] === null) return `Svara Ja eller Nej på: ${q.label}`;
    }
    if (!form.risks_acknowledged) return "Du måste bekräfta att du tagit del av riskinformation";
    if (isInjection && !form.betanketid_acknowledged) return "Betänketid måste bekräftas för injektionsbehandling";
    if (!form.signature) return "Signera formuläret med din digitala signatur";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);
    try {
      await submitHealthDeclarationConsent(form);
      onSubmitted?.();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Kunde inte skicka formuläret");
    } finally {
      setSubmitting(false);
    }
  };

  const now = new Date();
  const dateTimeStr = now.toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <PenLine className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-medium">Inför din behandling</h2>
        </div>

      {/* Section 1: Allmän Patientinformation */}
      <div className="pt-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Allmän Patientinformation</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Namn <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={set("name")} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Personnummer <span className="text-destructive">*</span></Label>
            <Input value={form.personnummer} onChange={set("personnummer")} placeholder="ÅÅMMDD-XXXX" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Telefon <span className="text-destructive">*</span></Label>
            <Input value={form.phone} onChange={set("phone")} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">E-post</Label>
            <Input type="email" value={form.email} onChange={set("email")} />
          </div>
        </div>
        {bookings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">Koppla till bokning (valfritt)</Label>
            <select value={form.booking_id} onChange={set("booking_id")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">— Ingen specifik bokning —</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>{b.treatment_name} — {new Date(b.start_time).toLocaleDateString("sv-SE")}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Section 2: Typ av behandling */}
      <div className="pt-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Vad ska du behandla?</h3>
        <p className="mb-3 text-sm text-muted-foreground">Välj den behandling du har bokat. Du får separat information och slutligt samtycke när betänketiden är klar.</p>
        <div className="space-y-2">
          {treatmentTypes.map((t) => (
            <label key={t.key} className={cn("flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors", form.treatment_type === t.key ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30")}>
              <input
                type="radio"
                name="treatment_type"
                value={t.key}
                checked={form.treatment_type === t.key}
                onChange={(e) => setForm((s) => ({ ...s, treatment_type: e.target.value }))}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{t.label}</span>
            </label>
          ))}
        </div>
        {form.treatment_type === "annan" && (
          <div className="mt-2 space-y-1.5">
            <Label className="text-xs">Beskriv behandling</Label>
            <Input value={form.treatment_type_other} onChange={set("treatment_type_other")} placeholder="Beskriv behandlingen" />
          </div>
        )}
      </div>

      {/* Section 3: Medicinsk Hälsodeklaration */}
      <div className="pt-2">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Medicinsk Hälsodeklaration</h3>
        <p className="mb-3 text-xs text-muted-foreground">Har du, eller har du haft, något av följande tillstånd? (Svara Ja / Nej)</p>
        <div className="space-y-2.5">
          {medicalQuestions.map((q) => (
            <YesNoQuestion
              key={q.key}
              question={q.question}
              desc={q.desc}
              value={form[q.key]}
              onChange={setBool(q.key)}
            />
          ))}
        </div>
      </div>

      {/* Section 4: Information om risker & Lagkrav (IVO) */}
      <div className="pt-2">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">4. Information om risker & Lagkrav (IVO)</h3>
        <div className="space-y-2">
          <AckCheckbox
            checked={form.betanketid_acknowledged}
            onChange={setCheck("betanketid_acknowledged")}
            label="Betänketid (Gäller endast injektioner): Jag är informerad om att lagstadgad betänketid på minst 48 timmar gäller vid min första injektionsbehandling (eller vid byte av substans)."
            required={isInjection}
          />
          <AckCheckbox
            checked={form.risks_acknowledged}
            onChange={setCheck("risks_acknowledged")}
            label="Risker & Biverkningar: Jag har tagit del av information kring förväntat resultat, eftervård samt risker (såsom svullnad, blåmärken, rodnad, pigmentförändringar eller sällsynta komplikationer beroende på vald behandling)."
            required
          />
          <AckCheckbox
            checked={form.photo_consent}
            onChange={setCheck("photo_consent")}
            label="Fotodokumentation: Jag godkänner att före/efter-bilder tas för dokumentation i min patientjournal."
          />
        </div>
      </div>

      {/* Section 5: Godkännande & Signering */}
      <div className="pt-2">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">5. Godkännande & Signering</h3>
        <div className="rounded-lg border border-border bg-muted/20 p-3.5 text-sm leading-relaxed">
          "Jag intygar att mina hälsouppgifter är korrekta och att jag har tagit del av den information som kliniken har lämnat inför behandlingen. Jag förstår att detta formulär inte ersätter det slutliga behandlingssamtycket."
        </div>
        <div className="mt-4">
          <SignaturePad onChange={setBool("signature")} label="Signatur (digital signatur på skärm)" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5" />
          Datum & Tid: <span className="font-medium text-foreground">{dateTimeStr}</span> (loggas automatiskt i systemets Audit-logg)
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Avbryt</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Skickar...</> : <><PenLine className="w-4 h-4 mr-2" />Bekräfta & Skicka</>}
        </Button>
      </div>
      </div>
    </form>
  );
}