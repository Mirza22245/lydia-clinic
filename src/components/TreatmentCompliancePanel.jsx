import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, Check, X, Info, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkTreatmentCompliance } from "@/functions/checkTreatmentCompliance";

// Visar IVO-compliance-status för en bokning. Returnerar null om behandlingen
// inte har några compliance-krav (icke-injektionsbehandlingar utan betänketid).
export default function TreatmentCompliancePanel({ bookingId, customerId, treatmentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checkTreatmentCompliance({ customer_id: customerId, treatment_id: treatmentId, booking_id: bookingId });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Kunde inte hämta compliance-status");
    } finally {
      setLoading(false);
    }
  }, [bookingId, customerId, treatmentId]);

  useEffect(() => { load(); }, [load]);

  const recordInfo = async () => {
    setRecording(true);
    setError(null);
    try {
      const res = await checkTreatmentCompliance({ customer_id: customerId, treatment_id: treatmentId, booking_id: bookingId, action: "record_information" });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Kunde inte registrera information");
    } finally {
      setRecording(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Hämtar compliance-status...</div>;
  }

  if (error) {
    return <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>;
  }

  const checks = data?.checks || [];
  if (checks.length === 0) return null;

  const eligible = data?.eligible;
  const compliance = data?.compliance;
  const betanketidActive = compliance?.information_given_at && compliance?.betanketid_ends_at && new Date() < new Date(compliance.betanketid_ends_at);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold font-heading">IVO Compliance</h2>
        {eligible ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"><Check className="w-3 h-3" />Uppfylld</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"><AlertTriangle className="w-3 h-3" />Saknas</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Legal kontroll för injektionsbehandlingar — ålder, betänketid, samtycke och uprepningsregel.</p>

      <ul className="mt-4 space-y-2.5">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 text-sm">
            {c.passed
              ? <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /></span>
              : <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><X className="w-3 h-3" /></span>}
            <div className="min-w-0">
              <p className={cn(c.passed ? "text-foreground" : "font-medium")}>{c.label}</p>
              {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
            </div>
          </li>
        ))}
      </ul>

      {compliance && !compliance.information_given_at && (
        <div className="mt-4">
          <Button size="sm" variant="outline" disabled={recording} onClick={recordInfo}>
            {recording && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Info className="w-4 h-4 mr-1" />
            Registrera att behandlingsinformation lämnats
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">Detta startar betänketiden och dokumenterar vilken informationsversion patienten fick.</p>
        </div>
      )}

      {betanketidActive && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Betänketid aktiv — samtycke kan lämnas från{" "}
            <strong>{new Date(compliance.betanketid_ends_at).toLocaleString("sv-SE")}</strong>
          </span>
        </div>
      )}
    </div>
  );
}