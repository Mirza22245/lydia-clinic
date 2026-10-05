import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CalendarDays, Users, FileText, ShieldCheck, CreditCard,
  Boxes, BarChart3, MessageSquare, Sparkles, Check,
} from "lucide-react";

const features = [
  { icon: CalendarDays, title: "Onlinebokning", desc: "Kunden bokar själv – direkt i kalendern." },
  { icon: FileText, title: "Journal", desc: "Säker journal med signering och versionering." },
  { icon: Users, title: "Kundregister", desc: "Allt om kunden på ett ställe – Customer 360." },
  { icon: ShieldCheck, title: "Samtycken", desc: "Digitala samtycken och e-signering." },
  { icon: CreditCard, title: "Kassa & betalning", desc: "POS, Swish och kort i ett flöde." },
  { icon: Boxes, title: "Lager", desc: "Produkter, lager och inventering." },
  { icon: BarChart3, title: "Rapporter", desc: "Intäkter, beläggning och KPI:er." },
  { icon: MessageSquare, title: "Kommunikation", desc: "Bekräftelser och påminnelser." },
];

const plans = [
  {
    name: "Starter", price: "Från 0 kr", desc: "För små kliniker som kommer igång.",
    features: ["Onlinebokning", "Kundregister", "Kalender", "1 användare"], cta: "Starta gratis",
  },
  {
    name: "Clinic", price: "Från 895 kr", desc: "För kliniker som vill växa.", popular: true,
    features: ["Allt i Starter", "Journal & samtycken", "POS & betalning", "Lager", "Rapporter", "5 användare"],
    cta: "Välj Clinic",
  },
  {
    name: "Pro", price: "Kontakta oss", desc: "För flerklinik och team.",
    features: ["Allt i Clinic", "Flera locations", "Avancerade rapporter", "API & integrationer", "Obegränsat användare"],
    cta: "Boka demo",
  },
];

const faqs = [
  { q: "Är mina data säkra?", a: "All data krypteras och varje klinik är isolerad – ingen klinik ser en annans data." },
  { q: "Fungerar Lydia för flera kliniker?", a: "Ja, hantera flera locations och kliniker från ett konto med separata rapporter." },
  { q: "Kan jag importera från annat system?", a: "Ja, import av kunder, behandlingar och produkter via CSV, samt migreringshjälp." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-heading text-lg">L</div>
            <span className="font-semibold tracking-tight font-heading text-lg">Lydia <span className="text-muted-foreground font-body text-sm">Estetisk Klinik</span></span>
          </div>
          <nav className="ml-10 hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#funktioner" className="hover:text-foreground">Funktioner</a>
            <a href="#priser" className="hover:text-foreground">Priser</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/book">Boka tid</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/login">Logga in</Link></Button>
            <Button size="sm" asChild><Link to="/register">Starta gratis</Link></Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Kliniksystem för moderna kliniker
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight font-heading md:text-6xl">
            Allt din klinik behöver.<br /><span className="text-muted-foreground">På ett ställe.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Bokning, journal, kundkort, kassa, betalning, lager och rapporter – byggt för estetiska och hudkliniker.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild><Link to="/book">Boka tid nu</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/register">Starta gratis</Link></Button>
          </div>
        </div>
      </section>

      <section id="funktioner" className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center text-2xl font-semibold font-heading md:text-3xl">En plattform. Hela kliniken.</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="mt-4 font-medium">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="priser" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-center text-2xl font-semibold font-heading md:text-3xl">Enkelt prissatt</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <div key={p.name} className={cn("relative rounded-2xl border bg-card p-6", p.popular ? "border-primary shadow-sm" : "border-border")}>
                {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Populärast</span>}
                <h3 className="font-semibold font-heading">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <p className="mt-4 text-2xl font-semibold">{p.price}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" /> {feat}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" variant={p.popular ? "default" : "outline"} asChild><Link to="/register">{p.cta}</Link></Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-border bg-card">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="text-center text-2xl font-semibold font-heading md:text-3xl">Vanliga frågor</h2>
          <div className="mt-10 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-border bg-background p-5">
                <h3 className="font-medium">{f.q}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-heading">L</div>
            <span className="font-medium text-foreground">Lydia Estetisk Klinik</span>
          </div>
          <p>© 2026 Lydia Estetisk Klinik · Göteborg</p>
        </div>
      </footer>
    </div>
  );
}