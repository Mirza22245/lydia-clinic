import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const groupByCategory = (list) => {
  const map = new Map();
  list.forEach((t) => {
    const c = t.category || "Övrigt";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(t);
  });
  return [...map.entries()];
};

const priceLabel = (p) => (p > 0 ? `${p.toLocaleString("sv-SE")} kr` : "Kostnadsfri");

export default function TreatmentsSection({ treatments }) {
  const groups = groupByCategory(treatments);
  return (
    <section id="behandlingar" className="border-t border-black/10 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#65735d]">Våra tjänster</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-[#171714] sm:text-4xl">
            Behandlingar och priser
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-black/50 sm:text-base">
            Välj behandling, tid och fyll i dina uppgifter direkt online. Allt är klart för en trygg upplevelse.
          </p>
        </div>

        {groups.length === 0 && <p className="mt-12 text-center text-sm text-black/50">Inga behandlingar publicerade ännu.</p>}

        <div className="mt-12 grid gap-10 md:gap-14 md:grid-cols-2">
          {groups.map(([category, items]) => (
            <div key={category}>
              <h3 className="flex items-center gap-3 pb-3 font-heading text-lg font-semibold text-[#171714]">
                <span className="h-px w-6 bg-[#65735d]" />
                {category}
              </h3>
              <ul className="divide-y divide-black/5">
                {items.map((t) => (
                  <li key={t.id}>
                    <Link to={`/book?treatment=${t.id}`} className="group flex items-center justify-between gap-4 rounded-xl px-3 py-4 transition hover:bg-[#f8f6f1]">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#171714]">{t.name}</span>
                        <span className="text-sm text-black/45">{t.duration || 30} min</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold text-[#171714]">{priceLabel(t.price)}</span>
                        <ArrowRight className="h-4 w-4 text-black/20 transition group-hover:translate-x-0.5 group-hover:text-[#65735d]" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}