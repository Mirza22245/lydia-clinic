import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const methodLabels = { card: "Kort", swish: "Swish", cash: "Kontant", invoice: "Faktura" };

export default function PaymentCheckoutDialog({ booking, open, onClose, onPaid }) {
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setMethod("card");
      setAmount(String(booking.price || 0));
    }
  }, [booking]);

  const submit = async () => {
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const countRes = await base44.entities.Payment.count();
      const seq = (countRes + 1).toString().padStart(4, "0");
      const amt = Number(amount) || 0;
      const vatRate = 25;
      await base44.entities.Payment.create({
        customer_id: booking.customer_id || "",
        customer_name: booking.customer_name,
        booking_id: booking.id,
        treatment_name: booking.treatment_name || "",
        amount: amt,
        vat: Math.round((amt * vatRate) / (100 + vatRate)),
        vat_rate: vatRate,
        method,
        status: "paid",
        paid_at: new Date().toISOString(),
        receipt_number: `R-${year}-${seq}`,
        clinic_id: booking.clinic_id,
      });
      onPaid?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrera betalning</DialogTitle>
          <DialogDescription>Behandlingen är markerad som klar. Bekräfta betalning för att generera kvitto.</DialogDescription>
        </DialogHeader>
        {booking && (
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/60 p-3 text-sm">
              <p className="font-medium">{booking.customer_name}</p>
              <p className="text-muted-foreground">{booking.treatment_name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay_amount">Belopp (kr)</Label>
              <Input id="pay_amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
          <Button variant="ghost" onClick={onClose}>Hoppa över</Button>
          <Button onClick={submit} disabled={saving || !amount}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Bekräfta & generera kvitto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}