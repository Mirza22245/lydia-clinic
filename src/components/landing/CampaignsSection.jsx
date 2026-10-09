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
    <section className="border-t border-black/10 bg-[#f8f6f1]">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:px-8 md:grid-cols-3">
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-2xl border border-black/10 bg-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef1eb]"><Tag className="h-4 w-4 text-[#65735d]" /></div>
            <p className="mt-4 font-medium text-[#171714]">{c.name}</p>
            {offerLabel(c) && <p className="mt-1 font-heading text-xl font-semibold text-[#65735d]">{offerLabel(c)}</p>}
            {c.description && <p className="mt-2 text-sm leading-6 text-black/55">{c.description}</p>}
            {c.valid_until && <p className="mt-3 text-xs text-black/40">Gäller till {c.valid_until}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}