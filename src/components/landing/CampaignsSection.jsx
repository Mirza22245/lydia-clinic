import React from "react";
import { Tag } from "lucide-react";

const offerLabel = (c) => {
  if (c.discount_type === "percent") return `${c.discount_value} % rabatt`;
  if (c.discount_type === "amount") return `${c.discount_value} kr rabatt`;
  if (c.discount_type === "2for1") return "2 för 1";
  return "";
};

export default function CampaignsSection({ campaigns }) {
  if (!campaigns?.length) return null;
  return (
    <section className="border-t border-border bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Tag className="h-4 w-4" />{c.name}</div>
            {offerLabel(c) && <p className="mt-1 font-heading text-xl font-semibold">{offerLabel(c)}</p>}
            {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
            {c.valid_until && <p className="mt-2 text-xs text-muted-foreground">Gäller till {c.valid_until}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}