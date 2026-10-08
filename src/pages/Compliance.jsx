import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getClinicId } from "@/lib/currentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ShieldCheck, Wrench, UserCheck, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  ["equipment", "Utrustning & maskiner", Wrench],
  ["qualifications", "Personalens kompetens", UserCheck],
  ["checks", "Säkerhetskontroller", ClipboardCheck],
];

export default function Compliance() {
  const [tab, setTab] = useState("equipment");
  const [equipment, setEquipment] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [checks, setChecks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eq, q, ch, st] = await Promise.all([
        base44.entities.Equipment.filter({}, { sort: "-created_date", limit: 300 }),
        base44.entities.StaffQualification.filter({}, { sort: "-created_date", limit: 300 }),
        base44.entities.SafetyCheck.filter({}, { sort: "-created_date", limit: 300 }),
        base44.entities.Staff.filter({ active: { $ne: false } }, { sort: "name", limit: 200 }),
      ]);
      setEquipment(eq.items || []);
      setQualifications(q.items || []);
      setChecks(ch.items || []);
      setStaff(st.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    if (tab === "equipment") setForm({ type: "equipment", name: "", category: "", manufacturer: "", model: "", serial_number: "", status: "active", service_date: "", next_service_date: "", responsible_person: "", notes: "" });
    if (tab === "qualifications") setForm({ type: "qualification", staff_id: "", staff_name: "", qualification_type: "", issuer: "", issue_date: "", expiry_date: "", status: "active", notes: "" });
    if (tab === "checks") setForm({ type: "check", equipment_id: "", equipment_name: "", check_type: "", check_date: new Date().toISOString().slice(0, 10), next_check_date: "", responsible_person: "", result: "ok", notes: "" });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const { type, ...data } = form;
      if (type === "equipment") await base44.entities.Equipment.create({ ...data, clinic_id });
      if (type === "qualification") await base44.entities.StaffQualification.create({ ...data, clinic_id });
      if (type === "check") await base44.entities.SafetyCheck.create({ ...data, clinic_id });
      setForm(null);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Säkerhet & Compliance</h1>
        <p className="text-sm text-muted-foreground">Utrustning, kompetens och återkommande säkerhetskontroller för kliniken.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label, Icon]) => <button key={key} onClick={() => { setTab(key); setForm(null); }} className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium", tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}><Icon className="h-4 w-4" />{label}</button>)}
        <Button size="sm" className="ml-auto" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Ny</Button>
      </div>

      {tab === "equipment" && <Table title="Utrustning" headers={["Namn", "Kategori", "Modell", "Serienummer", "Nästa service"]} rows={equipment.map(x => [x.name, x.category, x.model, x.serial_number, x.next_service_date])} />}
      {tab === "qualifications" && <Table title="Kompetens" headers={["Personal", "Kompetens", "Utfärdare", "Giltig till", "Status"]} rows={qualifications.map(x => [x.staff_name, x.qualification_type, x.issuer, x.expiry_date, x.status])} />}
      {tab === "checks" && <Table title="Kontroller" headers={["Utrustning", "Kontroll", "Datum", "Nästa", "Resultat"]} rows={checks.map(x => [x.equipment_name, x.check_type, x.check_date, x.next_check_date, x.result])} />}

      {form && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{form.type === "equipment" ? "Ny utrustning" : form.type === "qualification" ? "Ny kompetens" : "Ny säkerhetskontroll"}</h2>
          <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
            {form.type === "equipment" && <>
              <Field label="Namn" value={form.name} onChange={v => setForm({...form,name:v})} required />
              <Field label="Kategori" value={form.category} onChange={v => setForm({...form,category:v})} />
              <Field label="Tillverkare" value={form.manufacturer} onChange={v => setForm({...form,manufacturer:v})} />
              <Field label="Modell" value={form.model} onChange={v => setForm({...form,model:v})} />
              <Field label="Serienummer" value={form.serial_number} onChange={v => setForm({...form,serial_number:v})} />
              <Field label="Senaste service" type="date" value={form.service_date} onChange={v => setForm({...form,service_date:v})} />
              <Field label="Nästa service" type="date" value={form.next_service_date} onChange={v => setForm({...form,next_service_date:v})} />
              <Field label="Ansvarig" value={form.responsible_person} onChange={v => setForm({...form,responsible_person:v})} />
            </>}
            {form.type === "qualification" && <>
              <div><Label>Personal</Label><select value={form.staff_id} onChange={e => { const s=staff.find(x=>x.id===e.target.value); setForm({...form,staff_id:e.target.value,staff_name:s?.name||""}); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Välj</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <Field label="Kompetens / utbildning" value={form.qualification_type} onChange={v => setForm({...form,qualification_type:v})} required />
              <Field label="Utfärdare" value={form.issuer} onChange={v => setForm({...form,issuer:v})} />
              <Field label="Utfärdad" type="date" value={form.issue_date} onChange={v => setForm({...form,issue_date:v})} />
              <Field label="Giltig till" type="date" value={form.expiry_date} onChange={v => setForm({...form,expiry_date:v})} />
              <div><Label>Status</Label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="active">Aktiv</option><option value="pending">Pågående</option><option value="expired">Utgången</option></select></div>
            </>}
            {form.type === "check" && <>
              <div><Label>Utrustning</Label><select value={form.equipment_id} onChange={e=>{const x=equipment.find(q=>q.id===e.target.value);setForm({...form,equipment_id:e.target.value,equipment_name:x?.name||""})}} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Välj</option>{equipment.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <Field label="Kontrolltyp" value={form.check_type} onChange={v=>setForm({...form,check_type:v})} required />
              <Field label="Kontrolldatum" type="date" value={form.check_date} onChange={v=>setForm({...form,check_date:v})} />
              <Field label="Nästa kontroll" type="date" value={form.next_check_date} onChange={v=>setForm({...form,next_check_date:v})} />
              <Field label="Ansvarig" value={form.responsible_person} onChange={v=>setForm({...form,responsible_person:v})} />
              <div><Label>Resultat</Label><select value={form.result} onChange={e=>setForm({...form,result:e.target.value})} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="ok">OK</option><option value="action_required">Åtgärd krävs</option><option value="failed">Underkänd</option></select></div>
            </>}
            <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setForm(null)}>Avbryt</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Spara</Button></div>
          </form>
        </div>
      )}

      {!loading && tab === "equipment" && equipment.length === 0 && <Empty />}
      {!loading && tab === "qualifications" && qualifications.length === 0 && <Empty />}
      {!loading && tab === "checks" && checks.length === 0 && <Empty />}
    </div>
  );
}

function Field({label,value,onChange,type="text",required=false}) {
  return <div><Label>{label}</Label><Input type={type} value={value||""} onChange={e=>onChange(e.target.value)} required={required}/></div>;
}
function Table({title,headers,rows}) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-secondary/40"><tr>{headers.map(h=><th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className="px-4 py-3">{v||"—"}</td>)}</tr>)}</tbody></table></div>;
}
function Empty() { return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground"><ShieldCheck className="mx-auto mb-2 h-6 w-6" />Inga poster ännu.</div>; }
