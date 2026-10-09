import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { getPublicBookingData } from "@/functions/getPublicBookingData";
import SiteHeader from "@/components/landing/SiteHeader";
import Hero from "@/components/landing/Hero";
import CampaignsSection from "@/components/landing/CampaignsSection";
import TreatmentsSection from "@/components/landing/TreatmentsSection";
import StaffSection from "@/components/landing/StaffSection";
import FaqSection from "@/components/landing/FaqSection";
import ContactSection from "@/components/landing/ContactSection";
import UnderConstruction from "@/components/UnderConstruction";

const BOOKING_URL = "/book";

export default function Landing() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPublicBookingData({})
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.error || e.message || "Kunde inte ladda sidan"));
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f8f6f1] p-6 text-center">
        <p className="font-heading text-2xl">Lydia Estetisk</p>
        <p className="max-w-md text-sm text-black/55">{error}</p>
        <ButtonLink href={BOOKING_URL}>Boka tid</ButtonLink>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f6f1]">
        <Loader2 className="h-6 w-6 animate-spin text-black/40" />
      </div>
    );
  }

  const { clinic, treatments, staff, campaigns } = data;

  if (!data.booking_open) return <UnderConstruction clinic={clinic} />;

  return (
    <div className="min-h-screen bg-[#f8f6f1] text-[#171714]">
      <SiteHeader clinic={clinic} hasTeam={staff.length > 0} hasFaq={clinic.faq.length > 0} />
      <main>
        <Hero clinic={clinic} />

        <section className="border-y border-black/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-px bg-black/10 md:grid-cols-3">
            <TrustItem icon={ShieldCheck} title="Tryggt från start" text="Tydlig information och personlig vägledning före din behandling." />
            <TrustItem icon={Stethoscope} title="Professionellt fokus" text="Behandlingar presenteras med fokus på kvalitet, säkerhet och resultat." />
            <TrustItem icon={Sparkles} title="Personligt resultat" text="Vi utgår från dina förutsättningar och den look du själv vill uppnå." />
          </div>
        </section>

        <CampaignsSection campaigns={campaigns} />
        <TreatmentsSection treatments={treatments} />

        <section className="bg-[#171714] text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between md:py-20">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Nästa steg</p>
              <h2 className="mt-3 font-heading text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">
                Redo att boka din tid?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
                Välj behandling, tid och fyll i dina uppgifter direkt online. Enklare för dig och smidigare för kliniken.
              </p>
            </div>
            <a
              href={BOOKING_URL}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[#171714] transition hover:bg-white/90"
            >
              Boka behandling
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>
        </section>

        <StaffSection staff={staff} />
        <FaqSection faq={clinic.faq} />
        <ContactSection clinic={clinic} />
      </main>

      <footer className="border-t border-black/10 bg-[#f8f6f1]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-black/50 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-heading text-xl font-semibold text-black/80">{clinic.brand_name || clinic.name}</p>
            <p className="mt-1 text-xs">Estetisk klinik · Stockholm</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#behandlingar" className="hover:text-black">Behandlingar</a>
            <a href="#kontakt" className="hover:text-black">Kontakt</a>
            <a href={BOOKING_URL} className="font-medium text-black/80 hover:text-black">Boka tid</a>
            <Link to="/login" className="hover:text-black">Personal</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TrustItem({ icon: Icon, title, text }) {
  return (
    <div className="bg-white px-6 py-7 sm:px-8">
      <Icon className="h-5 w-5 text-[#65735d]" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/55">{text}</p>
    </div>
  );
}

function ButtonLink({ href, children }) {
  return (
    <a href={href} className="inline-flex h-11 items-center justify-center rounded-full bg-[#171714] px-5 text-sm font-semibold text-white">
      {children}
    </a>
  );
}