import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// value: null = alla behandlingar, annars array med Treatment-ID.
export default function StaffTreatmentPicker({ value, onChange }) {
  const [treatments, setTreatments] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    base44.entities.Treatment.filter({}, { sort: "name", limit: 200 }).then((p) => setTreatments(p.items || []));
  }, []);

  const restricted = value !== null;
  const shown = treatments.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <Label>Behandlingar personen får utföra</Label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange(null)} className={`rounded-lg border p-2 text-sm ${!restricted ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>Alla behandlingar</button>
        <button type="button" onClick={() => restricted || onChange([])} className={`rounded-lg border p-2 text-sm ${restricted ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>Endast valda</button>
      </div>
      {restricted && (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök behandling…" />
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {shown.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 rounded border-input accent-primary" />
                <span className="text-sm">{t.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{value.length} valda. Bokning av andra behandlingar nekas av systemet.</p>
        </div>
      )}
    </div>
  );
}