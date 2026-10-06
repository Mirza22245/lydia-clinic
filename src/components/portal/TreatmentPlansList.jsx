import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";

const statusLabel = { active: "Pågår", completed: "Avslutad", cancelled: "Avbruten" };

export default function TreatmentPlansList({ plans }) {
  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
        <ClipboardList className="mx-auto mb-2 h-6 w-6 opacity-50" />Ingen behandlingsplan än.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <div key={p.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{p.treatment_name}</p>
            <span className="text-xs text-muted-foreground">{statusLabel[p.status] || p.status}</span>
          </div>
          {p.recommended_interval_days > 0 && <p className="text-sm text-muted-foreground">Rekommenderat intervall: ca {p.recommended_interval_days} dagar</p>}
          {p.next_recommended_date && <p className="text-sm text-muted-foreground">Nästa rekommenderade besök: {p.next_recommended_date}</p>}
          {p.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{p.notes}</p>}
          {p.status === "active" && <Button size="sm" variant="outline" className="mt-3" asChild><Link to="/book">Boka tid</Link></Button>}
        </div>
      ))}
    </div>
  );
}