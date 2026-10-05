import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Loader2, Printer } from "lucide-react";

const methodLabels = { card: "Kort", swish: "Swish", cash: "Kontant", invoice: "Faktura" };
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function ReceiptsPanel({ customerId, clinicName }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await base44.entities.Payment.filter({ customer_id: customerId }, { sort: "-paid_at", limit: 100 });
        setPayments(p.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-medium"><Receipt className="w-4 h-4" />Kvitton & betalningar</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : payments.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga kvitton än.</div>
      ) : (
        <div className="divide-y divide-border">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.treatment_name || "Behandling"}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {p.receipt_number} · {methodLabels[p.method]} · {fmtDateTime(p.paid_at)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">{p.amount.toLocaleString("sv-SE")} kr</span>
              <Button size="sm" variant="outline" onClick={() => setView(p)}>Kvitto</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kvitto {view?.receipt_number}</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="space-y-4 text-sm">
              <div className="text-center">
                <p className="font-semibold font-heading">{clinicName || "Klinik"}</p>
                <p className="text-muted-foreground">Kvittonummer: {view.receipt_number}</p>
              </div>
              <div className="space-y-1 border-y border-border py-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Kund</span><span className="font-medium">{view.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Behandling</span><span className="font-medium">{view.treatment_name || "–"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Datum</span><span>{fmtDateTime(view.paid_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Betalningsmetod</span><span>{methodLabels[view.method]}</span></div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Belopp exkl. moms</span><span className="tabular-nums">{(view.amount - (view.vat || 0)).toLocaleString("sv-SE")} kr</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Moms ({view.vat_rate || 25}%)</span><span className="tabular-nums">{(view.vat || 0).toLocaleString("sv-SE")} kr</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Att betala</span><span className="tabular-nums">{view.amount.toLocaleString("sv-SE")} kr</span></div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Tack för besöket!</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setView(null)}>Stäng</Button>
            <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" />Skriv ut</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}