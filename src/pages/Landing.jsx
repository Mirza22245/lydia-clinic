import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getPublicBookingData } from "@/functions/getPublicBookingData";
import SiteHeader from "@/components/landing/SiteHeader";
import Hero from "@/components/landing/Hero";
import CampaignsSection from "@/components/landing/CampaignsSection";
import TreatmentsSection from "@/components/landing/TreatmentsSection";
import StaffSection from "@/components/landing/StaffSection";
import FaqSection from "@/components/landing/FaqSection";
import ContactSection from "@/components/landing/ContactSection";

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link to="/login" className="text-sm underline">Logga in</Link>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const { clinic, treatments, staff, campaigns } = data;
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader clinic={clinic} hasTeam={staff.length > 0} hasFaq={clinic.faq.length > 0} />
      <Hero clinic={clinic} />
      <CampaignsSection campaigns={campaigns} />
      <TreatmentsSection treatments={treatments} />
      <StaffSection staff={staff} />
      <FaqSection faq={clinic.faq} />
      <ContactSection clinic={clinic} />
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-8 text-sm text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} {clinic.brand_name || clinic.name}</span>
          <Link to="/login" className="hover:text-foreground">Logga in</Link>
        </div>
      </footer>
    </div>
  );
}