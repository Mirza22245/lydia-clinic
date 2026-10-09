import React from "react";
import { ArrowRight, CheckCircle2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const BOOKING_URL = "/book";

export default function Hero({ clinic }) {
  const brand = clinic.brand_name || clinic.name || "Lydia Estetisk";

  return (
    <section id="top" className="relative overflow-hidden bg-[#f8f6f1]">
      <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-[#d9e1d5]/70 blur-3xl" />
      <div className="absolute -bottom-48 -left-40 h-[440px] w-[440px] rounded-full bg-[#eadfd3]/70 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-black/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#65735d]" />
            Estetik med omtanke
          </div>

          <h1 className="max-w-3xl font-heading text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-[#171714] sm:text-6xl lg:text-7xl">
            Naturliga resultat.
            <span className="block text-black/55">Trygg behandling.</span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-7 text-black/60 sm:text-lg">
            {clinic.description || "Personliga estetiska behandlingar med fokus på kvalitet, trygghet och resultat som känns som du."}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full bg-[#171714] px-6 text-white hover:bg-[#292925]">
              <a href={BOOKING_URL}>
                Boka behandling
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-black/15 bg-white/40 px-6">
              <a href="#behandlingar">Se behandlingar</a>
            </Button>
          </div>

          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-black/55">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#65735d]" /> Personlig konsultation</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#65735d]" /> Onlinebokning</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#65735d]" /> Diskret & tryggt</span>
          </div>
        </div>

        <div className="relative">
          <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-black/10 bg-[#e7e2d8] p-5 shadow-[0_30px_80px_rgba(35,30,20,0.10)] sm:min-h-[500px]">
            <img src={clinic.hero_image_url || "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=1200&q=85"} alt="Lugn behandlingsmiljö hos Lydia Estetisk" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#171714]/65 via-[#171714]/5 to-white/10" />
            <div className="absolute inset-5 rounded-[1.5rem] border border-white/35" />
            <div className="absolute inset-x-10 bottom-10 rounded-2xl border border-white/60 bg-white/75 p-5 backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">Lydia Estetisk</p>
              <p className="mt-2 font-heading text-2xl leading-tight text-[#171714]">Skönhet som känns personlig.</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-black/55">
                {clinic.address && <><MapPin className="h-3.5 w-3.5" />{String(clinic.address).replace(/^Adress:\s*/i, "").split("\n")[0]}</>}
              </div>
            </div>
            <div className="absolute right-10 top-10 rounded-full border border-white/60 bg-white/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">Lydia Estetisk</div>
          </div>

          {clinic.phone && (
            <a
              href={`tel:${clinic.phone.replace(/\s/g, "")}`}
              className="absolute -bottom-4 left-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-medium shadow-lg sm:left-auto sm:right-8"
            >
              <Phone className="h-3.5 w-3.5" />
              {clinic.phone}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}