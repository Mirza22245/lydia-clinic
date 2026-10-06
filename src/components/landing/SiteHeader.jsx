import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function SiteHeader({ clinic, hasTeam, hasFaq }) {
  const brand = clinic.brand_name || clinic.name;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
        <a href="#top" className="flex items-center gap-2">
          {clinic.logo_url && <img src={clinic.logo_url} alt={brand} className="h-8 w-auto" />}
          <span className="font-heading text-lg font-semibold tracking-tight">{brand}</span>
        </a>
        <nav className="ml-10 hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#behandlingar" className="hover:text-foreground">Behandlingar</a>
          {hasTeam && <a href="#team" className="hover:text-foreground">Team</a>}
          {hasFaq && <a href="#faq" className="hover:text-foreground">Vanliga frågor</a>}
          <a href="#kontakt" className="hover:text-foreground">Kontakt</a>
        </nav>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/login">Logga in</Link></Button>
          <Button size="sm" asChild><Link to="/book">Boka tid</Link></Button>
        </div>
      </div>
    </header>
  );
}