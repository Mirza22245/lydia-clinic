import React from "react";
import { User } from "lucide-react";

export default function StaffSection({ staff }) {
  if (!staff?.length) return null;
  return (
    <section id="team" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center font-heading text-2xl font-semibold md:text-3xl">Vårt team</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {staff.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <User className="h-6 w-6" />
              </div>
              <p className="mt-3 font-medium">{s.name}</p>
              {s.title && <p className="text-sm text-muted-foreground">{s.title}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}