import React from "react";
import { Check, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Framträdande "REDO FÖR BEHANDLING" / "INTE REDO"-panel.
// Visar en checklista av alla obligatoriska krav med uppfyllelsestatus.
// Används i BookingDetail så personal snabbt ser om patienten är redo.
export default function ReadyForTreatmentPanel({ booking, reqs }) {
  if (!reqs || !reqs.requirements) return null;

  const enforceable = reqs.requirements.filter((r) => r.required);
  const allReady = reqs.allCompleted;
  const missing = enforceable.filter((r) => !r.completed);

  if (enforceable.length === 0) return null;

  return (
    <div className={cn(
      "rounded-xl border-2 p-5",
      allReady ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          allReady ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
        )}>
          {allReady ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div>
          <p className={cn("text-lg font-bold tracking-tight", allReady ? "text-emerald-700" : "text-amber-700")}>
            {allReady ? "REDO FÖR BEHANDLING" : "INTE REDO"}
          </p>
          <p className="text-sm text-muted-foreground">
            {allReady
              ? "Alla obligatoriska krav är uppfyllda. Behandling kan påbörjas."
              : `${missing.length} obligatoriskt krav saknas innan behandling kan påbörjas.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {enforceable.map((r) => (
          <div key={r.key} className="flex items-center gap-2 text-sm">
            <span className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              r.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            )}>
              {r.completed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            </span>
            <span className={cn(r.completed ? "text-foreground" : "font-medium text-amber-800")}>
              {r.label}
            </span>
          </div>
        ))}
      </div>

      {!allReady && missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Saknas</p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
            {missing.map((r) => <li key={r.key}>• {r.label}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}