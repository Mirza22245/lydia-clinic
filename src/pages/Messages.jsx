import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Send, Mail, MailOpen, MessageSquare, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";
import FeatureGate from "@/components/FeatureGate";

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function Messages() {
  return (
    <FeatureGate feature="messages" moduleName="Meddelanden">
      <MessagesContent />
    </FeatureGate>
  );
}

function MessagesContent() {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customer_id: "", subject: "", body: "" });
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        base44.entities.Message.filter({}, { sort: "-sent_at", limit: 200 }),
        base44.entities.Customer.filter({}, { sort: "name", limit: 200, fields: ["name", "email", "phone"] }),
      ]);
      setItems(m.items || []);
      setCustomers(c.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (msg) => {
    if (!msg.is_read) {
      await base44.entities.Message.update(msg.id, { is_read: true, read_at: new Date().toISOString() });
      await load();
    }
  };

  const send = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const customer = customers.find((c) => c.id === form.customer_id);
      await base44.entities.Message.create({
        customer_id: form.customer_id,
        customer_name: customer?.name || "",
        direction: "outbound",
        subject: form.subject,
        body: form.body,
        is_read: true,
        sent_at: new Date().toISOString(),
        staff_name: "Personal",
        clinic_id,
      });
      setOpen(false); setForm({ customer_id: "", subject: "", body: "" }); await load();
    } finally { setSaving(false); }
  };

  const customerMessages = selectedCustomer ? items.filter((m) => m.customer_id === selectedCustomer) : items;
  const unreadCount = items.filter((m) => !m.is_read && m.direction === "inbound").length;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Meddelanden</h1>
          <p className="text-sm text-muted-foreground">Kommunikation med kunder. {unreadCount > 0 && `${unreadCount} olästa.`}</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ customer_id: "", subject: "", body: "" }); setOpen(true); }}><Send className="w-4 h-4 mr-1" />Nytt meddelande</Button>
      </div>

      {selectedCustomer && (
        <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}><ArrowLeft className="w-4 h-4 mr-1" />Alla meddelanden</Button>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <MessageSquare className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Inga meddelanden</p>
          <p className="mt-1 text-sm text-muted-foreground">Skicka ett meddelande till en kund eller ta emot frågor.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customerMessages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-3 rounded-xl border border-border bg-card p-4",
                m.direction === "inbound" && !m.is_read && "border-primary/30 bg-primary/5"
              )}
            >
              <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", m.direction === "inbound" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                {m.is_read ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {m.direction === "inbound" ? "Från: " : "Till: "}{m.customer_name || "—"}
                    {m.staff_name && m.direction === "outbound" && ` (${m.staff_name})`}
                  </p>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(m.sent_at)}</span>
                </div>
                {m.subject && <p className="text-xs font-medium text-muted-foreground">{m.subject}</p>}
                <p className="mt-1 text-sm">{m.body}</p>
                {m.direction === "inbound" && !m.is_read && (
                  <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => markRead(m)}>Markera som läst</Button>
                )}
                {m.direction === "inbound" && (
                  <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => setSelectedCustomer(m.customer_id)}>Visa konversation</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nytt meddelande</DialogTitle></DialogHeader>
          <form onSubmit={send} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kund</Label>
              <select value={form.customer_id} onChange={(e) => setForm((s) => ({ ...s, customer_id: e.target.value }))} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">Välj kund...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Ämne</Label><Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Meddelande</Label><Textarea value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} rows={4} required /></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving || !form.customer_id || !form.body.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Skicka</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}