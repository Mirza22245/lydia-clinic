import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Eye } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import PaymentCheckoutDialog from "@/components/PaymentCheckoutDialog";
import { logAudit } from "@/lib/audit";
import { sendBookingConfirmation } from "@/functions/sendBookingConfirmation";

const statusLabels = {
  draft: "Utkast", pending: "Väntar", confirmed: "Bekräftad", checked_in: "Incheckad",
  in_progress: "Pågår", completed: "Klar", cancelled: "Inställd", no_show: "Utebliven",
};
const statusColors = {
  completed: "bg-emerald-100 text-emerald-700", confirmed: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700", cancelled: "bg-rose-100 text-rose-700",
  in_progress: "bg-violet-100 text-violet-700", no_show: "bg-rose-100 text-rose-700",
  checked_in: "bg-cyan-100 text-cyan-700", draft: "bg-slate-100 text-slate-600",
};
const filters = [
  { key: "all", label: "Alla" },
  { key: "pending", label: "Väntar" },
  { key: "confirmed", label: "Bekräftad" },
  { key: "completed", label: "Klart" },
  { key: "cancelled", label: "Inställd" },
];
const emptyForm = { customer_id: "", treatment_id: "", staff_name: "", start_time: "", status: "pending", notes: "" };

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function Bookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [checkout, setCheckout] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (filter !== "all") query.status = filter;
      const page = await base44.entities.Booking.filter(query, { sort: "-start_time", limit: 50 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const fetchOptions = async () => {
    const [c, t] = await Promise.all([
      base44.entities.Customer.filter({}, { limit: 200 }),
      base44.entities.Treatment.filter({}, { limit: 200 }),
    ]);
    setCustomers(c.items || []);
    setTreatments(t.items || []);
  };

  const openCreate = async () => {
    setEditing(null);
    setForm(emptyForm);
    await fetchOptions();
    setOpen(true);
  };
  const openEdit = async (b) => {
    setEditing(b);
    setForm({
      customer_id: b.customer_id || "",
      treatment_id: b.treatment_id || "",
      staff_name: b.staff_name || "",
      start_time: b.start_time ? toLocalInput(b.start_time) : "",
      status: b.status || "pending",
      notes: b.notes || "",
    });
    await fetchOptions();
    setOpen(true);
  };

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.treatment_id || !form.start_time) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const cust = customers.find((x) => x.id === form.customer_id);
      const treat = treatments.find((x) => x.id === form.treatment_id);
      const start = new Date(form.start_time);
      const end = new Date(start.getTime() + (treat?.duration || 30) * 60000);
      const data = {
        clinic_id,
        customer_id: form.customer_id,
        customer_name: cust?.name || "",
        treatment_id: form.treatment_id,
        treatment_name: treat?.name || "",
        staff_name: form.staff_name || undefined,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: form.status,
        price: treat?.price ?? 0,
        notes: form.notes || undefined,
      };
      if (editing) {
        await base44.entities.Booking.update(editing.id, data);
        await logAudit("booking_update", "Booking", editing.id, `Bokning för ${data.customer_name} uppdaterad`, { status: data.status });
        if (form.status === "completed" && editing.status !== "completed") {
          const existing = await base44.entities.JournalEntry.filter({ booking_id: editing.id }, { limit: 1 });
          if (!existing.items || existing.items.length === 0) {
            await base44.entities.JournalEntry.create({
              clinic_id,
              booking_id: editing.id,
              customer_id: data.customer_id,
              customer_name: data.customer_name,
              treatment_id: data.treatment_id,
              treatment_name: data.treatment_name,
              provider: data.staff_name || undefined,
              entry_date: new Date().toISOString(),
              notes: "",
              version: 1,
              is_signed: false,
            });
          }
          await logAudit("booking_status", "Booking", editing.id, `Bokning för ${data.customer_name} markerad som klar`, { from: editing.status, to: "completed" });
          setCheckout({
            id: editing.id,
            customer_id: data.customer_id,
            customer_name: data.customer_name,
            treatment_name: data.treatment_name,
            price: data.price,
            clinic_id,
          });
        }
      } else {
        const created = await base44.entities.Booking.create(data);
        await logAudit("booking_create", "Booking", created.id, `Bokning skapad för ${data.customer_name}`, { treatment: data.treatment_name });
        // Automatisk bokningsbekräftelse till patienten — får inte blockera.
        if (cust?.email) {
          try {
            await sendBookingConfirmation({ booking_id: created.id });
          } catch {
            // Swallow: e-post får inte blockera bokningen.
          }
        }
      }
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    if (confirm("Ta bort bokningen?")) {
      await base44.entities.Booking.delete(b.id);
      await logAudit("booking_delete", "Booking", b.id, `Bokning för ${b.customer_name} borttagen`, { treatment: b.treatment_name });
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Bokningar</h1>
          <p className="text-sm text-muted-foreground">Se och hantera klinikens bokningar.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny bokning</Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga bokningar</p>
          <p className="mt-1 text-sm text-muted-foreground">{filter === "all" ? "Skapa din första bokning." : "Inget i den här vyn."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.customer_name} · {b.treatment_name}</p>
                <p className="truncate text-sm text-muted-foreground">{fmtDate(b.start_time)}{b.staff_name ? ` · ${b.staff_name}` : ""}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusColors[b.status] || "bg-slate-100 text-slate-600")}>
                {statusLabels[b.status] || b.status}
              </span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Öppna bokning"><Link to={`/app/bookings/${b.id}`}><Eye className="w-4 h-4" /></Link></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(b)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera bokning" : "Ny bokning"}</DialogTitle>
            <DialogDescription>{editing ? "Uppdatera bokningen." : "Skapa en ny bokning."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Kund</Label>
              <select id="customer_id" value={form.customer_id} onChange={set("customer_id")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">Välj kund…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="treatment_id">Behandling</Label>
              <select id="treatment_id" value={form.treatment_id} onChange={set("treatment_id")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">Välj behandling…</option>
                {treatments.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration} min)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="staff_name">Behandlare</Label><Input id="staff_name" value={form.staff_name} onChange={set("staff_name")} placeholder="Valfritt" /></div>
              <div className="space-y-2"><Label htmlFor="start_time">Starttid</Label><Input id="start_time" type="datetime-local" value={form.start_time} onChange={set("start_time")} required /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select id="status" value={form.status} onChange={set("status")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="pending">Väntar</option>
                <option value="confirmed">Bekräftad</option>
                <option value="checked_in">Incheckad</option>
                <option value="in_progress">Pågår</option>
                <option value="completed">Klar</option>
                <option value="cancelled">Inställd</option>
                <option value="no_show">Utebliven</option>
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="notes">Anteckningar</Label><Textarea id="notes" value={form.notes} onChange={set("notes")} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.customer_id || !form.treatment_id || !form.start_time}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <PaymentCheckoutDialog
        booking={checkout}
        open={!!checkout}
        onClose={() => setCheckout(null)}
        onPaid={() => load()}
      />
    </div>
  );
}