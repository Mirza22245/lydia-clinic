import React from "react";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

const cleanAddress = (a) => (a || "").replace(/^Adress:\s*/i, "").replace(/\s*\n\s*/g, ", ").trim();

export default function ContactSection({ clinic }) {
  const address = cleanAddress(clinic.address) || "Södra Allégatan 1B, 413 01 Göteborg";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  const hours = (clinic.opening_hours || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <section id="kontakt" className="border-t border-black/10 bg-[#f8f6f1]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#65735d]">Swing förbi</p>
            <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-[#171714] sm:text-4xl">Kontakt</h2>
            <ul className="mt-8 space-y-5">
              {address && (
                <li className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white"><MapPin className="h-4 w-4 text-[#65735d]" /></span>
                  <span className="pt-2 text-sm leading-6 text-black/65">{address}</span>
                </li>
              )}
              {clinic.phone && (
                <li className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white"><Phone className="h-4 w-4 text-[#65735d]" /></span>
                  <a href={`tel:${clinic.phone.replace(/\s/g, "")}`} className="pt-2 text-sm leading-6 text-black/65 hover:text-[#171714]">{clinic.phone}</a>
                </li>
              )}
              {clinic.email && (
                <li className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white"><Mail className="h-4 w-4 text-[#65735d]" /></span>
                  <a href={`mailto:${clinic.email}`} className="pt-2 text-sm leading-6 text-black/65 hover:text-[#171714]">{clinic.email}</a>
                </li>
              )}
              {hours.length > 0 && (
                <li className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white"><Clock className="h-4 w-4 text-[#65735d]" /></span>
                  <div className="pt-2 text-sm leading-6 text-black/65">{hours.map((h) => <p key={h}>{h}</p>)}</div>
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
              <iframe
                title={`Google Maps – ${address}`}
                className="h-[320px] w-full sm:h-[380px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                src={mapsEmbedUrl}
              />
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#171714] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#292925]"
            >
              <MapPin className="h-4 w-4" />
              Hitta hit med Google Maps
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}