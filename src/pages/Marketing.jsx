import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Loader2, Pencil, Trash2, Megaphone, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";
import FeatureGate from "@/components/FeatureGate";

const typeLabels = { discount: "Rabatt", last_minute: "Sista minuten", recall: "Återbesök", loyalty: "Lojalitet", segment: "Segment" };
const statusLabels = { draft: "Utkast", active: "Aktiv", paused: "Pausad", expired: "Utgången" };
const statusColors = { draft: "bg-slate-100 text-slate-600", active: "bg-emerald-100 text-emerald-700", paused: "bg-amber-100 text-amber-700", expired: "bg-muted text-muted-foreground" };
const discountTypeLabels = { percent: "%", amount: "kr", "2for1": "2-för-1" };

const emptyCampaign = { name: "", type: "discount", discount_type: "percent", discount_value: 0, valid_from: "", valid_until: "", status: "draft", description: "" };
const emptyCode = { code: "", discount_type: "percent", discount_value: 0, max_uses: 0, valid_until: "", active: true };

export default function Marketing() {
  return (
    <FeatureGate feature="marketing" moduleName="Marknadsföring">
      <MarketingContent />
    </FeatureGate>
  );
}

function MarketingContent() {
  const [campaigns, setCampaigns] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campOpen, setCampOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [campForm, setCampForm] = useState(emptyCampaign);
  const [codeForm, setCodeForm] = useState(emptyCode);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        base44.entities.Campaign.filter({}, { sort: "-created_date", limit: 100 }),
        base44.entities.DiscountCode.filter({}, { sort: "-created_date", limit: 100 }),
      ]);
      setCampaigns(c.items || []);
      setCodes(d.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveCampaign = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities.Campaign.create({ ...campForm, clinic_id });
      setCampOpen(false); setCampForm(emptyCampaign); await load();
    } finally { setSaving(false); }
  };

  const saveCode = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities.DiscountCode.create({ ...codeForm, used_count: 0, clinic_id });
      setCodeOpen(false); setCodeForm(emptyCode); await load();
    } finally { setSaving(false); }
  };

  const removeCampaign = async (c) => { if (confirm(`Ta bort kampanj "${c.name}"?`)) { await base44.entities.Campaign.delete(c.id); await load(); } };
  const removeCode = async (d) => { if (confirm(`Ta bort kod "${d.code}"?`)) { await base44.entities.DiscountCode.delete(d.id); await load(); } };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Marknadsföring</h1>
        <p className="text-sm text-muted-foreground">Kampanjer, rabattkoder och marknadsföringsaktiviteter.</p>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Kampanjer</TabsTrigger>
          <TabsTrigger value="codes">Rabattkoder</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-end"><Button size="sm" onClick={() => { setCampForm(emptyCampaign); setCampOpen(true); }}><Plus className="w-4 h-4 mr-1" />Ny kampanj</Button></div>
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-16 text-center">
              <Megaphone className="mx-auto w-8 h-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Inga kampanjer</p>
              <p className="mt-1 text-sm text-muted-foreground">Skapa din första kampanj.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{typeLabels[c.type] || c.type}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[c.status] || "bg-muted")}>{statusLabels[c.status] || c.status}</span>
                      </div>
                      <p className="mt-1.5 font-medium">{c.name}</p>
                      {c.discount_value > 0 && <p className="text-sm text-muted-foreground">{c.discount_value} {discountTypeLabels[c.discount_type] || ""} rabatt</p>}
                      {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCampaign(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="codes" className="space-y-4">
          <div className="flex justify-end"><Button size="sm" onClick={() => { setCodeForm(emptyCode); setCodeOpen(true); }}><Plus className="w-4 h-4 mr-1" />Ny rabattkod</Button></div>
          {codes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-16 text-center">
              <Ticket className="mx-auto w-8 h-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Inga rabattkoder</p>
              <p className="mt-1 text-sm text-muted-foreground">Skapa din första rabattkod.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {codes.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{d.code}</p>
                    <p className="text-xs text-muted-foreground">{d.discount_value} {discountTypeLabels[d.discount_type] || "%"} rabatt
                      {d.max_uses > 0 && ` · ${d.used_count}/${d.max_uses} använd`}
                      {d.valid_until && ` · giltig t.o.m. ${d.valid_until}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", d.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>{d.active ? "Aktiv" : "Inaktiv"}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCode(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={campOpen} onOpenChange={setCampOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ny kampanj</DialogTitle></DialogHeader>
          <form onSubmit={saveCampaign} className="space-y-3">
            <div className="space-y-1.5"><Label>Namn</Label><Input value={campForm.name} onChange={(e) => setCampForm((s) => ({ ...s, name: e.target.value }))} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Typ</Label><select value={campForm.type} onChange={(e) => setCampForm((s) => ({ ...s, type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1.5"><Label className="text-xs">Rabattyp</Label><select value={campForm.discount_type} onChange={(e) => setCampForm((s) => ({ ...s, discount_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(discountTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Rabattvärde</Label><Input type="number" value={campForm.discount_value} onChange={(e) => setCampForm((s) => ({ ...s, discount_value: Number(e.target.value) }))} min="0" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Gäller från</Label><Input type="date" value={campForm.valid_from} onChange={(e) => setCampForm((s) => ({ ...s, valid_from: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Gäller till</Label><Input type="date" value={campForm.valid_until} onChange={(e) => setCampForm((s) => ({ ...s, valid_until: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Beskrivning</Label><Textarea value={campForm.description} onChange={(e) => setCampForm((s) => ({ ...s, description: e.target.value }))} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setCampOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving || !campForm.name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Skapa</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ny rabattkod</DialogTitle></DialogHeader>
          <form onSubmit={saveCode} className="space-y-3">
            <div className="space-y-1.5"><Label>Kod</Label><Input value={codeForm.code} onChange={(e) => setCodeForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} required autoFocus placeholder="t.ex. SOMMAR20" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Rabattyp</Label><select value={codeForm.discount_type} onChange={(e) => setCodeForm((s) => ({ ...s, discount_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="percent">Procent</option><option value="amount">Belopp (kr)</option></select></div>
              <div className="space-y-1.5"><Label className="text-xs">Rabattvärde</Label><Input type="number" value={codeForm.discount_value} onChange={(e) => setCodeForm((s) => ({ ...s, discount_value: Number(e.target.value) }))} min="0" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Max användningar (0 = obegränsat)</Label><Input type="number" value={codeForm.max_uses} onChange={(e) => setCodeForm((s) => ({ ...s, max_uses: Number(e.target.value) }))} min="0" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Gäller till</Label><Input type="date" value={codeForm.valid_until} onChange={(e) => setCodeForm((s) => ({ ...s, valid_until: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setCodeOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving || !codeForm.code.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Skapa</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}