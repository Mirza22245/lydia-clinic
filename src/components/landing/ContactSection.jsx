import React from "react";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

const cleanAddress = (a) => (a || "").replace(/^Adress:\s*/i, "").replace(/\s*\n\s*/g, ", ").trim();

export default function ContactSection({ clinic }) {
  const address = cleanAddress(clinic.address);
  const hours = (clinic.opening_hours || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <section id="kontakt" className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
        <div>
          <h2 className="font-heading text-2xl font-semibold md:text-3xl">Kontakt</h2>
          <ul className="mt-6 space-y-4 text-sm">
            {address && <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{address}</li>}
            {clinic.phone && <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0" /><a href={`tel:${clinic.phone.replace(/\s/g, "")}`}>{clinic.phone}</a></li>}
            {clinic.email && <li className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0" /><a href={`mailto:${clinic.email}`}>{clinic.email}</a></li>}
            {hours.length > 0 && (
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{hours.map((h) => <p key={h}>{h}</p>)}</div>
              </li>
            )}
          </ul>
        </div>
        {address && (
          <iframe
            title="Karta"
            className="h-72 w-full rounded-xl border border-border"
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
          />
        )}
      </div>
    </section>
  );
}