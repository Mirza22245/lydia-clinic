import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Loader2, CreditCard, Banknote, Smartphone, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendReceiptEmail } from "@/functions/sendReceiptEmail";
import { useToast } from "@/components/ui/use-toast";
import { logAudit } from "@/lib/audit";
import { getClinicId } from "@/lib/currentUser";

const methodLabels = { card: "Kort", swish: "Swish", cash: "Kontant", invoice: "Faktura" };
const methodIcons = { card: CreditCard, swish: Smartphone, cash: Banknote, invoice: FileText };
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function POS() {
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState(null);
  const { toast } = useToast();

  useEffect(() => { getClinicId().then(setClinicId).catch(() => setClinicId(null)); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        base44.entities.Booking.filter(
          { clinic_id: clinicId, status: { $in: ["completed", "checked_in", "in_progress"] } },
          { sort: "-start_time", limit: 100 }
        ),
        base44.entities.Payment.filter({ clinic_id: clinicId }, { sort: "-paid_at", limit: 200 }),
      ]);
      setBookings(b.items || []);
      setPayments(p.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (clinicId) load(); }, [clinicId]);

  const paidBookingIds = useMemo(() => new Set(payments.filter((p) => p.status === "paid").map((p) => p.booking_id).filter(Boolean)), [payments]);

  const unpaid = bookings.filter((b) => !paidBookingIds.has(b.id));
  const paidToday = payments.filter((p) => {
    const d = new Date(p.paid_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });

  const openCheckout = (b) => {
    setActive(b);
    setMethod("card");
    setAmount(String(b.price || 0));
  };

  const submit = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const flags = await base44.entities.FeatureFlag.filter({ clinic_id: active.clinic_id, key: "cash_register" }, { limit: 1 }).catch(() => ({ items: [] }));
      const cashFlag = (flags.items || [])[0];
      if (cashFlag?.status === "enabled") {
        let cashConfig = {};
        try { cashConfig = typeof cashFlag.config === "string" ? JSON.parse(cashFlag.config || "{}") : (cashFlag.config || {}); } catch {}
        if (cashConfig.require_active_register !== false) {
        const registers = await base44.entities.CashRegister.filter({ clinic_id: active.clinic_id, status: "active" }, { limit: 1 }).catch(() => ({ items: [] }));
        if (!(registers.items || []).length) throw new Error("Kassaregister är PÅ men inget aktivt kassaregister är konfigurerat i Inställningar.");
        }
      }
      const year = new Date().getFullYear();
      const seq = (payments.length + 1).toString().padStart(4, "0");
      const amt = Number(amount) || 0;
      const vatRate = 25;
      const created = await base44.entities.Payment.create({
        customer_id: active.customer_id || "",
        customer_name: active.customer_name,
        booking_id: active.id,
        treatment_name: active.treatment_name || "",
        amount: amt,
        vat: Math.round(amt * vatRate / (100 + vatRate)),
        vat_rate: vatRate,
        method,
        status: "paid",
        paid_at: new Date().toISOString(),
        receipt_number: `R-${year}-${seq}`,
        clinic_id: active.clinic_id,
      });
      await logAudit("payment_create", "Payment", created.id, `Betalning ${amt} kr registrerad för ${active.customer_name}`, { booking_id: active.id, method, receipt_number: created.receipt_number });
      try {
        const res = await sendReceiptEmail({ payment_id: created.id });
        if (res?.data?.sent) {
          toast({ title: "Kvitto skickat", description: `E-post skickat till ${res.data.to}` });
        } else {
          toast({ variant: "destructive", title: "Betalning registrerad", description: res?.data?.error || "Kunde inte skicka e-post." });
        }
      } catch {
        toast({ variant: "destructive", title: "Betalning registrerad", description: "Kunde inte skicka e-post." });
      }
      setActive(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Kassa</h1>
        <p className="text-sm text-muted-foreground">Markera behandlingar som betalda och generera kvitton.</p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-medium"><Receipt className="w-4 h-4" />Att ta betalt</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : unpaid.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Inga obetalda behandlingar.</div>
        ) : (
          <div className="divide-y divide-border">
            {unpaid.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.customer_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{b.treatment_name} · {fmtDateTime(b.start_time)}</p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{(b.price || 0).toLocaleString("sv-SE")} kr</span>
                <Button size="sm" onClick={() => openCheckout(b)}>Ta betalt</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-medium">Betalt idag</h2>
        </div>
        {paidToday.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga betalningar idag.</div>
        ) : (
          <div className="divide-y divide-border">
            {paidToday.map((p) => {
              const Icon = methodIcons[p.method] || Receipt;
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.customer_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{p.treatment_name} · {methodLabels[p.method]} · {p.receipt_number}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{p.amount.toLocaleString("sv-SE")} kr</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta betalt</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/60 p-3 text-sm">
                <p className="font-medium">{active.customer_name}</p>
                <p className="text-muted-foreground">{active.treatment_name} · {fmtDateTime(active.start_time)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Belopp (kr)</Label>
                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Betalningsmetod</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(methodLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Avbryt</Button>
            <Button onClick={submit} disabled={saving || !amount}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Bekräfta betalning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}