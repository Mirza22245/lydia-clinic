import React from "react";
import { ArrowUpRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const BOOKING_URL = "https://app.lydiaestetisk.se";

export default function SiteHeader({ clinic, hasTeam, hasFaq }) {
  const brand = clinic.brand_name || clinic.name || "Lydia Estetisk";

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f8f6f1]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label={brand}>
          {clinic.logo_url ? (
            <img src={clinic.logo_url} alt={brand} className="h-10 w-auto object-contain" />
          ) : (
            <span className="font-heading text-2xl font-semibold tracking-[-0.03em]">Lydia</span>
          )}
          <span className="hidden h-5 w-px bg-black/15 sm:block" />
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.24em] text-black/55 sm:block">
            Estetisk klinik
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-black/65 lg:flex">
          <a href="#behandlingar" className="transition hover:text-black">Behandlingar</a>
          {hasTeam && <a href="#team" className="transition hover:text-black">Team</a>}
          {hasFaq && <a href="#faq" className="transition hover:text-black">Vanliga frågor</a>}
          <a href="#kontakt" className="transition hover:text-black">Kontakt</a>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={BOOKING_URL}
            className="hidden text-sm font-medium text-black/65 transition hover:text-black sm:inline-flex"
          >
            Boka online
          </a>
          <Button
            asChild
            className="rounded-full bg-[#171714] px-5 text-sm font-medium text-white shadow-sm hover:bg-[#292925]"
          >
            <a href={BOOKING_URL}>
              Boka behandling
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
          <a href="https://lydiaestetisk.se/" className="hidden text-sm font-medium text-black/55 transition hover:text-black lg:inline-flex">Klinikens webbplats</a>
          <a href="#behandlingar" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 lg:hidden" aria-label="Se behandlingar">
            <Menu className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}