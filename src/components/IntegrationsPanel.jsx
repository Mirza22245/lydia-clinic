import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Shield, MessageSquare, Calendar, CreditCard, Mail, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

// Visar status för alla integrationer. Read-only — konfiguration sker via
// feature flags (FeatureFlagsPanel) och secrets (Settings → Secrets i dashboard).
// Syfte: ge admin en överblick över vad som är aktivt, test eller avstängt.
export default function IntegrationsPanel() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.FeatureFlag.filter({}, { limit: 100 });
        setFlags(page.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getFlag = (key) => flags.find((f) => f.key === key);
  const statusLabel = (s) => ({ disabled: "Avstängd", test: "Testläge", enabled: "Aktiv" }[s] || "Avstängd");
  const statusColor = (s) => ({
    disabled: "bg-muted text-muted-foreground",
    test: "bg-amber-100 text-amber-700",
    enabled: "bg-emerald-100 text-emerald-700",
  }[s] || "bg-muted text-muted-foreground");

  const integrations = [
    {
      key: "bankid",
      icon: Shield,
      label: "BankID",
      desc: "Identitetsverifiering för patienter och personal",
      secrets: ["BANKID_MODE", "BANKID_API_URL", "BANKID_CLIENT_SECRET"],
      activate: "Sätt BANKID_MODE=test eller production i Secrets, aktivera feature flag",
    },
    {
      key: "sms",
      icon: MessageSquare,
      label: "SMS",
      desc: "Bekräftelser, påminnelser och avbokningar via SMS",
      secrets: ["SMS_PROVIDER", "SMS_API_KEY", "SMS_API_SECRET", "SMS_SENDER"],
      activate: "Välj provider (Twilio/46elks), sätt secrets, aktivera feature flag",
    },
    {
      key: "google_calendar",
      icon: Calendar,
      label: "Google Calendar",
      desc: "Synka bokningar till personalens Google-kalendrar",
      secrets: ["OAuth-connector"],
      activate: "Anslut Google Calendar via Integrations → Connectors, aktivera feature flag",
    },
    {
      key: "stripe",
      icon: CreditCard,
      label: "Stripe-betalning",
      desc: "Kortbetalning, Klarna, deposition och refunds",
      secrets: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"],
      activate: "Sätt Stripe-nycklar i Secrets, konfigurera webhook",
    },
    {
      key: "email",
      icon: Mail,
      label: "E-post",
      desc: "Bekräftelser, kvitton, påminnelser och uppföljning",
      secrets: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
      activate: "Aktiv som standard. Använd feature flags för specifika mallar",
    },
  ];

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
        <Plug className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-medium">Integrationer</h2>
      </div>
      <div className="space-y-3">
        {integrations.map((int) => {
          const flag = getFlag(int.key);
          const status = flag?.status || "disabled";
          const Icon = int.icon;
          return (
            <div key={int.key} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{int.label}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor(status))}>
                    {statusLabel(status)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{int.desc}</p>
                {status === "disabled" && (
                  <p className="mt-1.5 text-xs text-muted-foreground/70">
                    <strong>Aktivera:</strong> {int.activate}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}