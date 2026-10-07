import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, ShieldCheck, User, Check, Headset } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import StaffTreatmentPicker from "@/components/staff/StaffTreatmentPicker";
import { parseAllowed } from "@/lib/staffCompetence";
import {
  PERMISSION_AREAS, ROLE_PERMISSIONS, ROLE_LABELS, ROLE_DESCRIPTIONS,
  getPermissions,
} from "@/lib/staffPermissions";

const roleBadge = {
  administratör: "bg-primary/10 text-primary",
  behandlare: "bg-secondary text-secondary-foreground",
  reception: "bg-amber-100 text-amber-700",
};

const roleIcon = {
  administratör: ShieldCheck,
  behandlare: User,
  reception: Headset,
};

const emptyForm = { name: "", email: "", phone: "", title: "", role: "behandlare", active: true, permissions: {}, allowed: null };

export default function Staff() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Staff.filter({}, { sort: "name", limit: 100 });
      setItems(page.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, permissions: { ...ROLE_PERMISSIONS.behandlare } });
    setOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name || "",
      email: s.email || "",
      phone: s.phone || "",
      title: s.title || "",
      role: s.role || "behandlare",
      active: s.active !== false,
      permissions: getPermissions(s),
      allowed: parseAllowed(s.allowed_treatment_ids),
    });
    setOpen(true);
  };

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  const onRoleChange = (role) => {
    setForm((s) => ({ ...s, role, permissions: { ...ROLE_PERMISSIONS[role] } }));
  };

  const togglePerm = (area) => {
    setForm((s) => ({ ...s, permissions: { ...s.permissions, [area]: !s.permissions[area] } }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        clinic_id,
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        title: form.title || undefined,
        role: form.role,
        active: form.active,
        permissions: JSON.stringify(form.permissions),
        // Tom sträng = får utföra alla behandlingar; annars endast de listade (kontrolleras server-side vid bokning).
        allowed_treatment_ids: form.allowed === null ? "" : JSON.stringify(form.allowed),
      };
      if (editing) {
        await base44.entities.Staff.update(editing.id, data);
        if (form.email) {
          await base44.auth.adminInviteStaff({ name: form.name, email: form.email, staff_role: form.active ? form.role : "" || "behandlare" });
        }
      } else {
        if (form.email) {
          await base44.auth.adminInviteStaff({ name: form.name, email: form.email, staff_role: form.active ? form.role : "behandlare" });
        }
        await base44.entities.Staff.create(data);
        if (form.email) toast({ title: "Personal tillagd", description: "En aktiveringslänk har skickats till e-posten." });
      }
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (confirm(`Ta bort ${s.name}?`)) {
      await base44.entities.Staff.delete(s.id);
      await load();
    }
  };

  const activeCount = items.filter((s) => s.active !== false).length;
  const adminCount = items.filter((s) => s.role === "administratör").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Personal</h1>
          <p className="text-sm text-muted-foreground">Hantera anställda och deras roller.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Lägg till personal</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total personal</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{items.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Aktiva</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Administratörer</p>
          <p className="mt-1 text-2xl font-semibold font-heading">{adminCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Ingen personal</p>
          <p className="mt-1 text-sm text-muted-foreground">Lägg till din första medarbetare.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.map((s) => {
            const perms = getPermissions(s);
            const granted = PERMISSION_AREAS.filter((a) => perms[a.key]).length;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", roleBadge[s.role] || "bg-secondary")}>
                  {(() => { const Icon = roleIcon[s.role] || User; return <Icon className="w-4 h-4" />; })()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{s.name}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", roleBadge[s.role] || "bg-secondary")}>
                      {ROLE_LABELS[s.role] || s.role}
                    </span>
                    {s.active === false && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inaktiv</span>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[s.title, s.email, s.phone].filter(Boolean).join(" · ") || "Inga uppgifter"}
                    <span className="ml-1">· {granted}/{PERMISSION_AREAS.length} behörigheter</span>
                    <span className="ml-1">· {parseAllowed(s.allowed_treatment_ids) === null ? "alla behandlingar" : `${parseAllowed(s.allowed_treatment_ids).length} behandlingar`}</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(s)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera personal" : "Lägg till personal"}</DialogTitle>
            <DialogDescription>Välj roll för att tilldela standardbehörigheter, eller anpassa per område.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="name">Namn *</Label><Input id="name" value={form.name} onChange={set("name")} required /></div>
              <div className="space-y-2"><Label htmlFor="title">Befattning</Label><Input id="title" value={form.title} onChange={set("title")} placeholder="Valfritt" /></div>
              <div className="space-y-2"><Label htmlFor="email">E-post</Label><Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="Valfritt" /></div>
              <div className="space-y-2"><Label htmlFor="phone">Telefon</Label><Input id="phone" value={form.phone} onChange={set("phone")} placeholder="Valfritt" /></div>
            </div>

            <div className="space-y-2">
              <Label>Roll</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(ROLE_PERMISSIONS).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRoleChange(r)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      form.role === r ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {(() => { const Icon = roleIcon[r] || User; return <Icon className={cn("w-4 h-4", r === "administratör" ? "text-primary" : "text-muted-foreground")} />; })()}
                      <span className="font-medium">{ROLE_LABELS[r]}</span>
                      {form.role === r && <Check className="ml-auto w-4 h-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Behörigheter</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border p-2">
                {PERMISSION_AREAS.map((a) => (
                  <label key={a.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={form.permissions[a.key] === true}
                      onChange={() => togglePerm(a.key)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-sm">{a.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Kryssa ur för att begränsa åtkomst utöver rollens standard.</p>
            </div>

            <StaffTreatmentPicker value={form.allowed} onChange={(v) => setForm((s) => ({ ...s, allowed: v }))} />

            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 rounded border-input accent-primary" />
              <span className="text-sm">Aktiv</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button>
              <Button type="submit" disabled={saving || !form.name}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Lägg till"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}