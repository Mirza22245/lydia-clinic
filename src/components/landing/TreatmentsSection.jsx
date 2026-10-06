import React from "react";
import { Link } from "react-router-dom";

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
    <section id="behandlingar" className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center font-heading text-2xl font-semibold md:text-3xl">Behandlingar och priser</h2>
        {groups.length === 0 && <p className="mt-8 text-center text-muted-foreground">Inga behandlingar publicerade ännu.</p>}
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          {groups.map(([category, items]) => (
            <div key={category}>
              <h3 className="border-b border-border pb-2 font-heading text-lg font-semibold">{category}</h3>
              <ul className="divide-y divide-border">
                {items.map((t) => (
                  <li key={t.id}>
                    <Link to={`/book?treatment=${t.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.name}</span>
                        <span className="text-sm text-muted-foreground">{t.duration || 30} min</span>
                      </span>
                      <span className="shrink-0 text-sm font-medium">{priceLabel(t.price)}</span>
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