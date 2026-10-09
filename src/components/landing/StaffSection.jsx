import React from "react";
import { User } from "lucide-react";

export default function StaffSection({ staff }) {
  if (!staff?.length) return null;
  return (
    <section id="team" className="border-t border-black/10 bg-[#f8f6f1]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#65735d]">Möt oss</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-[#171714] sm:text-4xl">Vårt team</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {staff.map((s) => (
            <div key={s.id} className="rounded-2xl border border-black/10 bg-white p-6 text-center transition hover:shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef1eb] text-[#65735d]">
                <User className="h-7 w-7" />
              </div>
              <p className="mt-4 font-heading text-lg font-semibold text-[#171714]">{s.name}</p>
              {s.title && <p className="mt-1 text-sm text-black/50">{s.title}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}