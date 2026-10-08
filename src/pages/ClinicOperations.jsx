import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getClinicId } from "@/lib/currentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const modules = [
  { key:"cash", label:"1. Kassa", entity:"CashRegister", fields:[["name","Namn"],["register_id","Kassabeteckning"],["control_unit_id","Kontrollenhet/kontrollsystem"],["manufacturer_declaration","Tillverkardeklaration"],["receipt_series","Kvittoserie"],["vat_rates","Momssatser"],["opening_balance","Växelkassa"]] },
  { key:"waiting", label:"2. Betänketid", entity:"WaitingPeriodRule", fields:[["name","Namn"],["treatment_name","Behandling"],["days","Dagar"],["rule_type","Regeltyp"],["notes","Anteckningar"]] },
  { key:"age", label:"3. Ålder", entity:"AgeVerificationRule", fields:[["name","Namn"],["treatment_name","Behandling"],["minimum_age","Minimiålder"],["verification_method","Verifieringsmetod"],["notes","Anteckningar"]] },
  { key:"info", label:"4. Behandlingsinfo", entity:"TreatmentInformation", fields:[["treatment_name","Behandling"],["title","Titel"],["version","Version"],["content","Information"],["published_at","Publicerad"]] },
  { key:"license", label:"5. Personalbehörighet", entity:"StaffLicense", fields:[["staff_name","Personal"],["license_type","Legitimation/behörighet"],["license_number","Legitimationsnummer"],["valid_until","Giltig till"],["specialist_competence","Specialistkompetens"]] },
  { key:"radiation", label:"6. Strålning & maskiner", entity:"RadiationEquipment", fields:[["equipment_name","Utrustning"],["radiation_type","Teknik"],["manufacturer","Tillverkare"],["model","Modell"],["serial_number","Serienummer"],["ssm_notification","SSM-anmälan"],["last_service","Senaste service"],["next_service","Nästa service"]] },
  { key:"incident", label:"7. Avvikelse", entity:"Incident", fields:[["occurred_at","Tidpunkt"],["type","Typ"],["severity","Allvarlighetsgrad"],["customer_id","Kund-ID"],["booking_id","Bokning-ID"],["description","Beskrivning"],["action_taken","Åtgärd"],["follow_up","Uppföljning"],["responsible_person","Ansvarig"]] },
  { key:"hygiene", label:"8. Hygien", entity:"HygieneCheck", fields:[["area","Område"],["check_type","Kontroll"],["frequency","Frekvens"],["last_checked","Senast kontrollerad"],["next_due","Nästa kontroll"],["result","Resultat"],["responsible_person","Ansvarig"],["notes","Anteckningar"]] },
  { key:"inventory", label:"9. Lagerbatch", entity:"InventoryLot", fields:[["product_name","Produkt"],["batch_number","Batch/Lot"],["expires_at","Utgångsdatum"],["quantity","Antal"],["unit","Enhet"],["cost","Kostnad"]] },
  { key:"attendance", label:"10. Personalliggare", entity:"StaffAttendance", fields:[["staff_id","Personal-ID"],["staff_name","Personal"],["date","Datum"],["clock_in","In"],["clock_out","Ut"],["break_minutes","Rast minuter"]] },
  { key:"communication", label:"11. Kommunikation", entity:"CommunicationRule", fields:[["name","Namn"],["event","Händelse"],["channel","Kanal"],["template","Mall"],["delay_minutes","Fördröjning minuter"]] },
  { key:"booking", label:"12. Bokningsregler", entity:"BookingRule", fields:[["name","Namn"],["treatment_name","Behandling"],["rule_type","Regeltyp"],["value","Värde"],["notes","Anteckningar"]] },
];

export default function ClinicOperations() {
  const [active, setActive] = useState("cash");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const mod = useMemo(() => modules.find(x => x.key === active) || modules[0], [active]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await base44.entities[mod.entity].filter({}, { sort:"-created_date", limit:300 });
      setRows(result.items || []);
    } finally { setLoading(false); }
  }, [mod.entity]);

  useEffect(() => { setForm(null); load(); }, [load]);

  const openNew = () => {
    const data = {};
    mod.fields.forEach(([key]) => { data[key] = ""; });
    setForm(data);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities[mod.entity].create({ ...form, clinic_id });
      setForm(null);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Klinikens drift & regler</h1>
        <p className="text-sm text-muted-foreground">Alla 12 moduler är byggda som separata konfigurerbara funktioner. De är inte automatiskt aktiverade.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {modules.map(x => <button key={x.key} onClick={() => setActive(x.key)} className={cn("rounded-full px-3 py-2 text-xs font-medium", active===x.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{x.label}</button>)}
      </div>
      <div className="flex items-center justify-between">
        <div><h2 className="font-semibold">{mod.label}</h2><p className="text-xs text-muted-foreground">{mod.entity}</p></div>
        <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Ny</Button>
      </div>
      {form && <form onSubmit={save} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {mod.fields.map(([key,label]) => <div key={key} className={key==="content"||key==="description"||key==="action_taken"||key==="follow_up"||key==="template"||key==="notes" ? "sm:col-span-2" : ""}>
          <Label>{label}</Label>
          {(key==="content"||key==="description"||key==="action_taken"||key==="follow_up"||key==="template"||key==="notes") ?
            <textarea className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})}/> :
            <Input className="mt-1" value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})}/>
          }
        </div>)}
        <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setForm(null)}>Avbryt</Button><Button type="submit" disabled={saving}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Spara</Button></div>
      </form>}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin"/></div> :
        rows.length ? <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-secondary/40"><tr><th className="px-4 py-3 text-left">Post</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Skapad</th></tr></thead><tbody className="divide-y divide-border">{rows.map(r=><tr key={r.id}><td className="px-4 py-3">{r.name||r.treatment_name||r.equipment_name||r.product_name||r.staff_name||r.type||"Post"}</td><td className="px-4 py-3">{r.status||r.result||"—"}</td><td className="px-4 py-3">{r.created_date ? new Date(r.created_date).toLocaleDateString("sv-SE") : "—"}</td></tr>)}</tbody></table></div> :
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground"><ShieldCheck className="mx-auto mb-2 h-6 w-6"/>Inga poster ännu.</div>}
    </div>
  );
}
