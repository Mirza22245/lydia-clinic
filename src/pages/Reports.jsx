import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, CheckCircle2, XCircle, UserX, TrendingUp, Wallet, Users, Percent, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { cn } from "@/lib/utils";

const fmtSEK = (n) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n) => new Intl.NumberFormat("sv-SE").format(n || 0);

const PERIODS = [
  { key: "month", label: "Denna månad" },
  { key: "last_month", label: "Förra månaden" },
  { key: "year", label: "I år" },
  { key: "all", label: "All tid" },
];

const STATUS_COLORS = {
  completed: "#10b981", confirmed: "#3b82f6", pending: "#f59e0b",
  cancelled: "#f43f5e", no_show: "#ef4444", in_progress: "#8b5cf6",
  checked_in: "#06b6d4", draft: "#94a3b8",
};
const statusLabel = (s) => ({ draft: "Utkast", pending: "Väntar", confirmed: "Bekräftad", checked_in: "Incheckad", in_progress: "Pågår", completed: "Klar", cancelled: "Inställd", no_show: "Utebliven" }[s] || s);

function rangeFor(period) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let end = null;
  if (period === "month") { start.setDate(1); }
  else if (period === "last_month") { start.setMonth(start.getMonth() - 1); start.setDate(1); end = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (period === "year") { start.setMonth(0); start.setDate(1); }
  else if (period === "all") { return { start: null, end: null }; }
  return { start: start.toISOString(), end: end ? end.toISOString() : null };
}

export default function Reports() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);\n  const [payments, setPayments] = useState([]);

  const range = useMemo(() => rangeFor(period), [period]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const bookQ = {};
        const payQ = {};
        if (range.start) { bookQ.start_time = { $gte: range.start }; payQ.paid_at = { $gte: range.start }; }
        if (range.end) { bookQ.start_time = { ...(bookQ.start_time || {}), $lt: range.end }; payQ.paid_at = { ...(payQ.paid_at || {}), $lt: range.end }; }

        const [byStatus, byStaff, byCustomer, revByTreatment, completedValue, paymentRows] = await Promise.all([
          base44.entities.Booking.aggregate({ query: bookQ, groupBy: "status" }),
          base44.entities.Booking.aggregate({ query: bookQ, groupBy: "staff_name" }),
          base44.entities.Booking.aggregate({ query: bookQ, groupBy: "customer_id" }),
          base44.entities.Payment.aggregate({ query: payQ, groupBy: "treatment_name", sum: "amount", sort: "-sum_amount" }),
          base44.entities.Booking.aggregate({ query: { ...bookQ, status: "completed" }, sum: "price" }),\n          base44.entities.Payment.filter(payQ, { sort: "-paid_at", limit: 500 }),
        ]);

        setPayments(paymentRows.items || []);\n        const statusMap = {};
        (byStatus.rows || []).forEach((r) => { statusMap[r.status] = r.count; });
        const total = (byStatus.rows || []).reduce((a, r) => a + r.count, 0);
        const completed = statusMap.completed || 0;
        const cancelled = statusMap.cancelled || 0;
        const noShow = statusMap.no_show || 0;
        const revenue = (revByTreatment.rows || []).reduce((a, r) => a + (r.sum_amount || 0), 0);\n        const paidPayments = (paymentRows.items || []).filter(p => p.status === "paid");\n        const refundedPayments = (paymentRows.items || []).filter(p => p.status === "refunded");\n        const vat = paidPayments.reduce((a, p) => a + Number(p.vat || 0), 0);\n        const refunded = refundedPayments.reduce((a, p) => a + Number(p.amount || 0), 0);\n        const byMethod = {};\n        paidPayments.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount || 0); });
        const completedVal = completedValue.rows[0]?.sum_price || 0;
        const outstanding = Math.max(0, completedVal - revenue);
        const newCust = (byCustomer.rows || []).filter((r) => r.count <= 1).length;
        const returning = (byCustomer.rows || []).filter((r) => r.count > 1).length;
        const utilization = total > 0 ? Math.round((completed / total) * 100) : 0;

        setData({
          statusMap, total, completed, cancelled, noShow, revenue, outstanding, newCust, returning, utilization, vat, refunded, byMethod,
          byStaff: (byStaff.rows || []).filter((r) => r.staff_name).sort((a, b) => b.count - a.count),
          revByTreatment: (revByTreatment.rows || []).filter((r) => r.treatment_name),
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [period]);

  const kpis = [
    { icon: CalendarDays, label: "Bokningar", value: fmtNum(data?.total) },
    { icon: CheckCircle2, label: "Genomförda", value: fmtNum(data?.completed) },
    { icon: XCircle, label: "Inställda", value: fmtNum(data?.cancelled) },
    { icon: UserX, label: "Uteblivna", value: fmtNum(data?.noShow) },
    { icon: Percent, label: "Utnyttjande", value: `${data?.utilization ?? 0}%` },
    { icon: TrendingUp, label: "Intäkt", value: fmtSEK(data?.revenue) },
    { icon: Wallet, label: "Obetalda", value: fmtSEK(data?.outstanding) },\n    { icon: Wallet, label: "Moms", value: fmtSEK(data?.vat) },\n    { icon: XCircle, label: "Återbetalat", value: fmtSEK(data?.refunded) },
    { icon: Users, label: "Nya / Återkommande", value: `${fmtNum(data?.newCust)} / ${fmtNum(data?.returning)}` },
  ];

  const exportCsv = () => {
    const rows = [["Behandling", "Intäkt (kr)"], ...(data?.revByTreatment || []).map((r) => [r.treatment_name, r.sum_amount || 0])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `lydia-rapport-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Rapporter</h1>
          <p className="text-sm text-muted-foreground">Intäkter, bokningar och kundstatistik per period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || !data}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
                  <p className="mt-3 text-sm text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-xl font-semibold font-heading">{k.value}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-medium">Intäkt per behandling</h2>
              {(data?.revByTreatment || []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Ingen intäkt under perioden.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.revByTreatment.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => `${v}`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="treatment_name" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip formatter={(v) => fmtSEK(v)} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="sum_amount" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-medium">Bokningar per status</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={Object.entries(data?.statusMap || {}).map(([k, v]) => ({ name: statusLabel(k), count: v, key: k }))}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {Object.entries(data?.statusMap || {}).map(([k]) => <Cell key={k} fill={STATUS_COLORS[k] || "#94a3b8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>


          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-medium">Betalningar per metod</h2>
              <div className="space-y-3">
                {Object.entries(data?.byMethod || {}).map(([method, value]) => <div key={method} className="flex items-center justify-between"><span>{({card:"Kort",swish:"Swish",cash:"Kontant",invoice:"Faktura"})[method] || method}</span><span className="font-medium">{fmtSEK(value)}</span></div>)}
                {Object.keys(data?.byMethod || {}).length === 0 && <p className="text-sm text-muted-foreground">Inga registrerade betalningar.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-medium">Kassasammanfattning</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Betalt</p><p className="text-lg font-semibold">{fmtSEK(data?.revenue)}</p></div>
                <div><p className="text-muted-foreground">Moms</p><p className="text-lg font-semibold">{fmtSEK(data?.vat)}</p></div>
                <div><p className="text-muted-foreground">Återbetalat</p><p className="text-lg font-semibold">{fmtSEK(data?.refunded)}</p></div>
                <div><p className="text-muted-foreground">Transaktioner</p><p className="text-lg font-semibold">{fmtNum(payments.length)}</p></div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4"><h2 className="font-medium">Bokningar per behandlare</h2></div>
            <div className="divide-y divide-border">
              {(data?.byStaff || []).length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">Inga bokningar under perioden.</p>
              ) : data.byStaff.map((r) => (
                <div key={r.staff_name} className="flex items-center justify-between px-5 py-3">
                  <span className="font-medium">{r.staff_name}</span>
                  <span className="text-sm text-muted-foreground">{r.count} bokningar</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}