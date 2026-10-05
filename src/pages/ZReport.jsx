import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Banknote, Smartphone, FileText, Printer, Download, Loader2, Receipt, TrendingUp, Percent, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

const methodLabels = { card: "Kort", swish: "Swish", cash: "Kontant", invoice: "Faktura" };
const methodIcons = { card: CreditCard, swish: Smartphone, cash: Banknote, invoice: FileText };
const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n || 0);
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function dayRange(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function ZReport() {
  const today = new Date().toLocaleDateString("sv-CA");
  const [date, setDate] = useState(today);
  const [payments, setPayments] = useState([]);
  const [byMethod, setByMethod] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { start, end } = dayRange(date);
        const query = { paid_at: { $gte: start, $lt: end } };
        const [list, methodAgg, refundAgg, paidCount] = await Promise.all([
          base44.entities.Payment.filter(query, { sort: "paid_at", limit: 500 }),
          base44.entities.Payment.aggregate({ query: { ...query, status: "paid" }, groupBy: "method", sum: ["amount", "vat"] }),
          base44.entities.Payment.aggregate({ query: { ...query, status: "refunded" }, groupBy: "method", sum: ["amount", "vat"] }),
          base44.entities.Payment.count({ ...query, status: "paid" }),
        ]);
        setPayments(list.items || []);
        setByMethod((methodAgg.rows || []).map((r) => ({ method: r.method, amount: r.sum_amount || 0, vat: r.sum_vat || 0, count: r.count || 0 })));
        setRefunds((refundAgg.rows || []).map((r) => ({ method: r.method, amount: r.sum_amount || 0, vat: r.sum_vat || 0, count: r.count || 0 })));
        setCount(paidCount);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const totals = useMemo(() => {
    const gross = byMethod.reduce((s, m) => s + m.amount, 0);
    const vatTotal = byMethod.reduce((s, m) => s + m.vat, 0);
    const refundAmount = refunds.reduce((s, m) => s + m.amount, 0);
    const refundVat = refunds.reduce((s, m) => s + m.vat, 0);
    return { gross, vatTotal, net: gross - vatTotal, refundAmount, refundVat, netSales: gross - refundAmount, netVat: vatTotal - refundVat };
  }, [byMethod, refunds]);

  const exportCsv = () => {
    const header = ["Kvittonummer", "Tid", "Kund", "Behandling", "Metod", "Status", "Belopp", "Moms", "Momssats"];
    const rows = payments.map((p) => [
      p.receipt_number || "",
      p.paid_at ? new Date(p.paid_at).toLocaleString("sv-SE") : "",
      p.customer_name || "",
      p.treatment_name || "",
      methodLabels[p.method] || p.method || "",
      p.status === "refunded" ? "Återbetalad" : "Betald",
      p.amount || 0,
      p.vat || 0,
      p.vat_rate || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `z-rapport-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Z-rapport</h1>
          <p className="text-sm text-muted-foreground">Dagsavslut — sammanställning av dagens betalningar för bokföringen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="zr-date">Datum</label>
            <Input id="zr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || payments.length === 0}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={loading}>
            <Printer className="w-4 h-4 mr-1" />Skriv ut
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Sammanfattning */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
            {[
              { icon: TrendingUp, label: "Försäljning (exkl. moms)", value: fmtSEK(totals.net), suffix: " kr" },
              { icon: Percent, label: "Moms", value: fmtSEK(totals.netVat), suffix: " kr" },
              { icon: TrendingUp, label: "Totalt (inkl. moms)", value: fmtSEK(totals.netSales), suffix: " kr" },
              { icon: Hash, label: "Transaktioner", value: String(count), suffix: "" },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums font-heading">{k.value}{k.suffix}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 print:block">
            {/* Per betalningsmetod */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-medium">Per betalningsmetod</h2>
              </div>
              <div className="divide-y divide-border">
                {byMethod.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">Inga betalningar.</div>}
                {byMethod.map((m) => {
                  const Icon = methodIcons[m.method] || Receipt;
                  return (
                    <div key={m.method} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{methodLabels[m.method] || m.method}</p>
                        <p className="text-sm text-muted-foreground">{m.count} transaktioner · moms {fmtSEK(m.vat)} kr</p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{fmtSEK(m.amount)} kr</span>
                    </div>
                  );
                })}
                {refunds.length > 0 && (
                  <div className="px-5 py-3 bg-rose-50/50">
                    <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Återbetalningar</p>
                    {refunds.map((m) => (
                      <div key={m.method} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-muted-foreground">{methodLabels[m.method] || m.method} ({m.count})</span>
                        <span className="font-medium tabular-nums text-rose-700">-{fmtSEK(m.amount)} kr</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-4 bg-secondary/40">
                  <span className="font-medium">Totalt</span>
                  <span className="font-semibold tabular-nums">{fmtSEK(totals.netSales)} kr</span>
                </div>
              </div>
            </div>

            {/* Momssammanställning */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-medium">Momssammanställning</h2>
              </div>
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-muted-foreground">Försäljning exkl. moms</span>
                  <span className="font-medium tabular-nums">{fmtSEK(totals.net)} kr</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-muted-foreground">Moms (25%)</span>
                  <span className="font-medium tabular-nums">{fmtSEK(totals.netVat)} kr</span>
                </div>
                {totals.refundAmount > 0 && (
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-rose-700">Återbetalningar</span>
                    <span className="font-medium tabular-nums text-rose-700">-{fmtSEK(totals.refundAmount)} kr</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-5 py-4 bg-secondary/40">
                  <span className="font-medium">Totalt att redovisa</span>
                  <span className="font-semibold tabular-nums">{fmtSEK(totals.netSales)} kr</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaktionslista */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-medium">Transaktioner ({payments.length})</h2>
            </div>
            {payments.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">Inga transaktioner detta datum.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium">Tid</th>
                      <th className="px-5 py-2 text-left font-medium">Kund</th>
                      <th className="px-5 py-2 text-left font-medium">Behandling</th>
                      <th className="px-5 py-2 text-left font-medium">Metod</th>
                      <th className="px-5 py-2 text-left font-medium">Kvitto</th>
                      <th className="px-5 py-2 text-right font-medium">Belopp</th>
                      <th className="px-5 py-2 text-right font-medium">Moms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => (
                      <tr key={p.id} className={cn(p.status === "refunded" && "text-rose-700")}>
                        <td className="px-5 py-2 tabular-nums">{fmtDateTime(p.paid_at)}</td>
                        <td className="px-5 py-2">{p.customer_name}</td>
                        <td className="px-5 py-2 text-muted-foreground">{p.treatment_name || "—"}</td>
                        <td className="px-5 py-2">{methodLabels[p.method] || p.method}</td>
                        <td className="px-5 py-2 text-muted-foreground">{p.receipt_number || "—"}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{p.status === "refunded" ? "-" : ""}{fmtSEK(p.amount)} kr</td>
                        <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{fmtSEK(p.vat)} kr</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}