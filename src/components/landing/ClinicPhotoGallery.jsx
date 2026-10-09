import React from "react";

const fallbackPhotos = [
  { url: "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?auto=format&fit=crop&w=1000&q=85", alt: "Lugn och elegant behandlingsmiljö" },
  { url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=85", alt: "Hudvård och ansiktsbehandling" },
  { url: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=900&q=85", alt: "Professionella hudvårdsprodukter" },
  { url: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=85", alt: "Avkopplande skönhetsupplevelse" },
];

export default function ClinicPhotoGallery({ clinic, compact = false }) {
  const configured = clinic?.gallery_images || clinic?.photo_urls || clinic?.photos || [];
  const photos = Array.isArray(configured)
    ? configured.map((item) => typeof item === "string" ? { url: item, alt: clinic?.brand_name || clinic?.name || "Klinikbild" } : item).filter((item) => item?.url || item?.image_url).map((item) => ({ url: item.url || item.image_url, alt: item.alt || item.caption || "Bild från kliniken" }))
    : [];
  const items = photos.length ? photos : fallbackPhotos;
  return (
    <section aria-label="Bilder från kliniken" className={compact ? "mx-auto w-full max-w-5xl px-4 pb-5 sm:px-6" : "mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14"}>
      {!compact && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#65735d]">En titt in hos oss</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-[#171714] sm:text-3xl">Kliniken i bilder</h2>
          </div>
          <p className="max-w-sm text-sm leading-5 text-black/50">Upptäck miljön och känslan innan ditt besök.</p>
        </div>
      )}
      <div className={compact ? "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"}>
        {items.slice(0, compact ? 4 : 8).map((photo, index) => (
          <figure key={photo.url + index} className={`group relative overflow-hidden rounded-2xl bg-[#e7e2d8] ${compact ? "h-24 sm:h-32" : "h-36 sm:h-56"} `}>
            <img src={photo.url} alt={photo.alt} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
          </figure>
        ))}
      </div>
    </section>
  );
}
