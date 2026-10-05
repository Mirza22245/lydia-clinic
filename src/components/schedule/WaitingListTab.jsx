import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, Mail, Check, X } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

const statusLabels = { active: "Aktiv", offered: "Erbjuden", booked: "Bokad", expired: "Utgången", cancelled: "Avbruten" };
const statusColors = { active: "bg-amber-100 text-amber-700", offered: "bg-blue-100 text-blue-700", booked: "bg-emerald-100 text-emerald-700", expired: "bg-muted text-muted-foreground", cancelled: "bg-rose-100 text-rose-700" };
const emptyForm = { customer_name: "", customer_email: "", customer_phone: "", treatment_name: "", staff_name: "", desired_from: "", desired_until: "", note: "" };

export default function WaitingListTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.WaitingList.filter({}, { sort: "-created_date", limit: 200 });
      setItems(page.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer_name || !form.treatment_name) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      await base44.entities.WaitingList.create({
        clinic_id,
        customer_name: form.customer_name,
        customer_email: form.customer_email || undefined,
        customer_phone: form.customer_phone || undefined,
        treatment_name: form.treatment_name,
        staff_name: form.staff_name || undefined,
        desired_from: form.desired_from || undefined,
        desired_until: form.desired_until || undefined,
        note: form.note || undefined,
        status: "active",
      });
      setOpen(false); setForm(emptyForm); await load();
    } finally { setSaving(false); }
  };

  const updateStatus = async (w, status) => {
    const patch = { status };
    if (status === "offered") patch.notified_at = new Date().toISOString();
    await base44.entities.WaitingList.update(w.id, patch);
    await load();
  };

  const remove = async (w) => { if (confirm("Ta bort från väntelista?")) { await base44.entities.WaitingList.delete(w.id); await load(); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Lägg till på väntelista</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="font-medium">Inga på väntelistan</p>
          <p className="mt-1 text-sm text-muted-foreground">Kunder som väntar på en ledig tid visas här.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{w.customer_name} · {w.treatment_name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {w.staff_name ? `${w.staff_name} · ` : ""}{[w.customer_email, w.customer_phone].filter(Boolean).join(" · ") || "Ingen kontakt"}
                  {w.desired_from && ` · från ${w.desired_from}`}{w.desired_until && ` till ${w.desired_until}`}
                </p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusColors[w.status] || "bg-muted")}>{statusLabels[w.status] || w.status}</span>
              {w.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus(w, "offered")} title="Markera som erbjuden"><Mail className="w-4 h-4" /></Button>
              )}
              {w.status === "offered" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(w, "booked")} title="Bokad"><Check className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(w, "active")} title="Tillbaka till aktiv"><X className="w-4 h-4" /></Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(w)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lägg till på väntelista</DialogTitle>
            <DialogDescription>Kunden erbjuds automatiskt en tid vid avbokning som matchar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="customer_name">Namn *</Label><Input id="customer_name" value={form.customer_name} onChange={set("customer_name")} required /></div>
              <div className="space-y-2"><Label htmlFor="treatment_name">Behandling *</Label><Input id="treatment_name" value={form.treatment_name} onChange={set("treatment_name")} required /></div>
              <div className="space-y-2"><Label htmlFor="customer_email">E-post</Label><Input id="customer_email" type="email" value={form.customer_email} onChange={set("customer_email")} /></div>
              <div className="space-y-2"><Label htmlFor="customer_phone">Telefon</Label><Input id="customer_phone" value={form.customer_phone} onChange={set("customer_phone")} /></div>
              <div className="space-y-2"><Label htmlFor="staff_name">Önskad behandlare</Label><Input id="staff_name" value={form.staff_name} onChange={set("staff_name")} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label htmlFor="desired_from">Från</Label><Input id="desired_from" type="date" value={form.desired_from} onChange={set("desired_from")} /></div>
                <div className="space-y-2"><Label htmlFor="desired_until">Till</Label><Input id="desired_until" type="date" value={form.desired_until} onChange={set("desired_until")} /></div>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="note">Anteckning</Label><Textarea id="note" value={form.note} onChange={set("note")} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.customer_name || !form.treatment_name}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lägg till</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}