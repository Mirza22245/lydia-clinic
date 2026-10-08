import React from "react";
import { Link } from "react-router-dom";
import { Construction, LockKeyhole } from "lucide-react";

export default function UnderConstruction({ clinic }) {
  const name = clinic?.brand_name || clinic?.name || "Lydia Estetisk";
  return (
    <div className="min-h-screen bg-[#f8f6f1] text-[#171714]">
      <header className="border-b border-black/10 bg-white/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <span className="font-heading text-xl font-semibold">{name}</span>
          <div className="flex items-center gap-4"><a href="https://lydiaestetisk.se/" className="text-sm font-medium text-black/55 hover:text-black">Klinikens webbplats</a><Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-black/60 hover:text-black"><LockKeyhole className="h-4 w-4" /> Personal</Link></div>
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-5 py-16 sm:px-8">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#171714] text-white shadow-sm"><Construction className="h-7 w-7" /></div>
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-black/45">Under uppbyggnad</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Vi gör klart det sista.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-black/60 sm:text-lg">Vår webbplats och onlinebokning är tillfälligt stängda medan vi färdigställer klinikens system. Bokning öppnar när allt är kontrollerat och klart.</p>
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-black/10 bg-white p-5 text-left shadow-sm"><p className="text-sm font-semibold">Just nu</p><p className="mt-1 text-sm leading-6 text-black/55">Onlinebokning är avstängd. Personal kan fortfarande logga in och kontrollera hela administrationsdelen.</p></div>
          <p className="mt-8 text-xs text-black/40">Tack för ditt tålamod.</p>
        </div>
      </main>
    </div>
  );
}
