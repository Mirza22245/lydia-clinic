import React from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Hero({ clinic }) {
  const brand = clinic.brand_name || clinic.name;
  return (
    <section id="top" className="bg-background">
      <div className="mx-auto max-w-4xl px-5 py-20 text-center md:py-28">
        <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-6xl">{brand}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          {clinic.description || "Boka din behandling online – snabbt och enkelt."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild><Link to="/book">Boka tid</Link></Button>
          {clinic.phone && (
            <Button size="lg" variant="outline" asChild>
              <a href={`tel:${clinic.phone.replace(/\s/g, "")}`}><Phone className="mr-2 h-4 w-4" />{clinic.phone}</a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}