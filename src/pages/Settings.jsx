import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getClinicId } from "@/lib/currentUser";
import FeatureFlagsPanel from "@/components/FeatureFlagsPanel";
import IntegrationsPanel from "@/components/IntegrationsPanel";
import PublicSiteCard from "@/components/settings/PublicSiteCard";

const empty = { name: "", org_number: "", email: "", phone: "", address: "", industry: "", verksamhetschef: "", ivo_registration: "", patient_insurance: "", ssm_notification: "", compliance_contact: "" };

export default function Settings() {
  const [clinic, setClinic] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const id = await getClinicId();
        if (!id) { setLoading(false); return; }
        const c = await base44.entities.Clinic.get(id);
        setClinic(c);
        setForm({ ...empty, ...c });
      } catch {
        // Kliniken kunde inte hämtas
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!clinic?.id) return;
    setSaving(true);
    try {
      const data = {
        name: form.name || undefined,
        org_number: form.org_number || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        industry: form.industry || undefined,
        verksamhetschef: form.verksamhetschef || undefined,
        ivo_registration: form.ivo_registration || undefined,
        patient_insurance: form.patient_insurance || undefined,
        ssm_notification: form.ssm_notification || undefined,
        compliance_contact: form.compliance_contact || undefined,
      };
      const updated = await base44.entities.Clinic.update(clinic.id, data);
      setClinic(updated);
      setForm({ ...empty, ...updated });
      toast({ title: "Sparat", description: "Klinikens uppgifter har uppdaterats." });
    } catch (err) {
      toast({ variant: "destructive", title: "Kunde inte spara", description: err?.message || "Försök igen." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!clinic) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <Building2 className="mx-auto w-8 h-8 text-muted-foreground" />
        <p className="mt-2 font-medium">Ingen klinik kopplad</p>
        <p className="mt-1 text-sm text-muted-foreground">Ditt konto är inte kopplat till en klinik än.</p>
      </div>
    );
  }

  const field = (id, label, opts = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={form[id]} onChange={set(id)} type={opts.type || "text"} placeholder={opts.placeholder} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Inställningar</h1>
        <p className="text-sm text-muted-foreground">Klinikens uppgifter visas på kvitton och dokument.</p>
      </div>

      <form onSubmit={save} className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-medium">Klinikuppgifter</h2>
          </div>
          {field("name", "Klinikens namn", { placeholder: "t.ex. Lydiakliniken Stockholm" })}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("org_number", "Organisationsnummer", { placeholder: "556xxx-xxxx" })}
            {field("industry", "Bransch", { placeholder: "t.ex. Estetisk klinik" })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="border-b border-border pb-3">
            <h2 className="font-medium">Vårdgivare & tillsyn</h2>
            <p className="mt-1 text-xs text-muted-foreground">Registrera klinikens egna uppgifter för IVO, patientförsäkring och Strålsäkerhetsmyndigheten.</p>
          </div>
          {field("verksamhetschef", "Verksamhetschef")}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("ivo_registration", "IVO vårdgivarregister / registreringsuppgift")}
            {field("patient_insurance", "Patientförsäkring")}
            {field("ssm_notification", "SSM anmälan / referens")}
            {field("compliance_contact", "Compliance-ansvarig")}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h2 className="font-medium">Kontaktuppgifter</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("email", "E-post", { type: "email", placeholder: "info@klinik.se" })}
            {field("phone", "Telefon", { placeholder: "08-xxx xxx xx" })}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adress</Label>
            <Textarea id="address" value={form.address} onChange={set("address")} rows={2} placeholder="Gatuadress, postnummer och ort" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !form.name?.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Spara uppgifter
          </Button>
        </div>
      </form>

      <PublicSiteCard key={clinic.id} clinic={clinic} onSaved={setClinic} />

      <div className="max-w-2xl space-y-6">
        <IntegrationsPanel />
        <FeatureFlagsPanel />
      </div>
    </div>
  );
}