import React from "react";

export default function FaqSection({ faq }) {
  if (!faq?.length) return null;
  return (
    <section id="faq" className="border-t border-border bg-card">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="text-center font-heading text-2xl font-semibold md:text-3xl">Vanliga frågor</h2>
        <div className="mt-10 space-y-4">
          {faq.map((f) => (
            <div key={f.q} className="rounded-xl border border-border bg-background p-5">
              <h3 className="font-medium">{f.q}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}