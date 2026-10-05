import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, Gift, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";
import FeatureGate from "@/components/FeatureGate";

const typeLabels = { giftcard: "Presentkort", klippkort: "Klippkort", paket: "Paket", medlemskap: "Medlemskap" };
const statusLabels = { active: "Aktiv", used: "Använd", expired: "Utgången", cancelled: "Makulerad" };
const statusColors = { active: "bg-emerald-100 text-emerald-700", used: "bg-muted text-muted-foreground", expired: "bg-rose-100 text-rose-700", cancelled: "bg-muted text-muted-foreground" };
const empty = { code: "", type: "giftcard", name: "", initial_balance: 0, balance: 0, initial_clips: 0, remaining_clips: 0, customer_name: "", valid_from: "", valid_until: "" };

export default function GiftCards() {
  return (
    <FeatureGate feature="gift_cards" moduleName="Presentkort & Klippkort">
      <GiftCardsContent />
    </FeatureGate>
  );
}

function GiftCardsContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.GiftCard.filter({}, { sort: "-created_date", limit: 200 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: ["initial_balance", "balance", "initial_clips", "remaining_clips"].includes(f) ? Number(e.target.value) : e.target.value }));

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setForm((s) => ({ ...s, code }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        ...form,
        balance: form.initial_balance,
        remaining_clips: form.initial_clips,
        purchased_at: new Date().toISOString(),
        clinic_id,
      };
      await base44.entities.GiftCard.create(data);
      setOpen(false); setForm(empty); await load();
    } finally { setSaving(false); }
  };

  const remove = async (g) => { if (confirm(`Makulera presentkort ${g.code}?`)) { await base44.entities.GiftCard.delete(g.id); await load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Presentkort & Klippkort</h1>
          <p className="text-sm text-muted-foreground">Skapa och hantera presentkort, klippkort, paket och medlemskap.</p>
        </div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Nytt kort</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Gift className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Inga kort</p>
          <p className="mt-1 text-sm text-muted-foreground">Skapa ditt första presentkort eller klippkort.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-medium">{g.code}</p>
                  <p className="text-xs text-muted-foreground">{typeLabels[g.type] || g.type}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[g.status] || "bg-muted")}>{statusLabels[g.status] || g.status}</span>
              </div>
              {g.name && <p className="mt-2 text-sm font-medium">{g.name}</p>}
              <div className="mt-3 space-y-1 text-sm">
                {g.type === "klippkort" ? (
                  <p><span className="text-muted-foreground">Klipp:</span> {g.remaining_clips} / {g.initial_clips}</p>
                ) : (
                  <p><span className="text-muted-foreground">Saldo:</span> {g.balance.toLocaleString("sv-SE")} kr</p>
                )}
                {g.customer_name && <p className="text-xs text-muted-foreground">Kund: {g.customer_name}</p>}
                {g.valid_until && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />Gäller till: {g.valid_until}</p>}
              </div>
              <Button size="sm" variant="ghost" className="mt-2 h-7 text-destructive" onClick={() => remove(g)}><Trash2 className="w-3 h-3 mr-1" />Makulera</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nytt presentkort / klippkort</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kod</Label>
              <div className="flex gap-2">
                <Input value={form.code} onChange={set("code")} required placeholder="Unik kod" />
                <Button type="button" variant="outline" size="sm" onClick={generateCode}>Generera</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Typ</Label><select value={form.type} onChange={set("type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1.5"><Label className="text-xs">Namn</Label><Input value={form.name} onChange={set("name")} placeholder="t.ex. 500 kr presentkort" /></div>
            </div>
            {form.type === "klippkort" ? (
              <div className="space-y-1.5"><Label className="text-xs">Antal klipp</Label><Input type="number" value={form.initial_clips} onChange={set("initial_clips")} min="1" /></div>
            ) : (
              <div className="space-y-1.5"><Label className="text-xs">Belopp (kr)</Label><Input type="number" value={form.initial_balance} onChange={set("initial_balance")} min="0" /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Gäller från</Label><Input type="date" value={form.valid_from} onChange={set("valid_from")} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Gäller till</Label><Input type="date" value={form.valid_until} onChange={set("valid_until")} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Kund (valfritt)</Label><Input value={form.customer_name} onChange={set("customer_name")} placeholder="Kundens namn" /></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving || !form.code}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Skapa</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}