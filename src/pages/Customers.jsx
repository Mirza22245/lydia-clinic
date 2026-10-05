import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Search, Loader2, Pencil, Trash2, Phone, Mail, Eye, BadgeCheck } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { Link } from "react-router-dom";
import { logAudit } from "@/lib/audit";

const empty = { name: "", email: "", phone: "", address: "", birth_date: "", personnummer: "", status: "active", tags: "", notes: "" };
const statusLabels = { active: "Aktiv", inactive: "Inaktiv", lead: "Lead" };

export default function Customers() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (search.trim()) query.name = { $regex: search.trim(), $options: "i" };
      const page = await base44.entities.Customer.filter(query, { sort: "-created_date", limit: 50 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...empty, ...c }); setOpen(true); };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        ...form,
        clinic_id,
        birth_date: form.birth_date || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        tags: form.tags || undefined,
        notes: form.notes || undefined,
      };
      if (editing) {
        await base44.entities.Customer.update(editing.id, data);
        await logAudit("customer_update", "Customer", editing.id, `Kund "${data.name}" uppdaterad`, {});
      } else {
        const created = await base44.entities.Customer.create(data);
        await logAudit("customer_create", "Customer", created.id, `Kund "${data.name}" skapad`, {});
      }
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (confirm(`Ta bort kunden "${c.name}"?`)) {
      await base44.entities.Customer.delete(c.id);
      await logAudit("customer_delete", "Customer", c.id, `Kund "${c.name}" borttagen`, {});
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Kunder</h1>
          <p className="text-sm text-muted-foreground">Hantera dina kundprofiler.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny kund</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök kund…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga kunder</p>
          <p className="mt-1 text-sm text-muted-foreground">Lägg till din första kund.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{statusLabels[c.status] || c.status}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Öppna kund"><Link to={`/app/customers/${c.id}`}><Eye className="w-4 h-4" /></Link></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {c.personnummer && <p className="flex items-center gap-2"><BadgeCheck className="w-3.5 h-3.5" />{c.personnummer}</p>}
                {c.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{c.phone}{c.phone_verified && <span className="text-emerald-600">✓</span>}</p>}
                {c.email && <p className="flex items-center gap-2 truncate"><Mail className="w-3.5 h-3.5" />{c.email}{c.email_verified && <span className="text-emerald-600">✓</span>}</p>}
                {c.tags && <p className="mt-2"><span className="rounded bg-secondary px-2 py-0.5 text-xs">{c.tags}</span></p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera kund" : "Ny kund"}</DialogTitle>
            <DialogDescription>{editing ? "Uppdatera kunduppgifter." : "Lägg till en ny kundprofil."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Namn</Label><Input id="name" value={form.name} onChange={set("name")} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="email">E-post</Label><Input id="email" type="email" value={form.email} onChange={set("email")} /></div>
              <div className="space-y-2"><Label htmlFor="phone">Telefon</Label><Input id="phone" value={form.phone} onChange={set("phone")} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Adress</Label><Input id="address" value={form.address} onChange={set("address")} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="personnummer">Personnummer</Label><Input id="personnummer" value={form.personnummer} onChange={set("personnummer")} placeholder="ÅÅMMDD-XXXX" /></div>
              <div className="space-y-2"><Label htmlFor="birth_date">Födelsedatum</Label><Input id="birth_date" type="date" value={form.birth_date} onChange={set("birth_date")} /></div>
              <div className="space-y-2"><Label htmlFor="status">Status</Label>
                <select id="status" value={form.status} onChange={set("status")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                  <option value="lead">Lead</option>
                </select>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="tags">Taggar</Label><Input id="tags" value={form.tags} onChange={set("tags")} placeholder="t.ex. VIP, botox" /></div>
            <div className="space-y-2"><Label htmlFor="notes">Anteckningar</Label><Textarea id="notes" value={form.notes} onChange={set("notes")} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}