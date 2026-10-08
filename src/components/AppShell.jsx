import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Users, Sparkles, FileText, ShieldCheck, ClipboardList, HeartPulse, UserCog, Receipt, Settings, LogOut, Calculator, BarChart3, CalendarClock, ClipboardCheck, Package, Gift, Megaphone, Star, MessageSquare, SlidersHorizontal, ExternalLink } from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, perm: "dashboard" },
  { to: "/app/bookings", label: "Bokningar", icon: CalendarDays, perm: "bookings" },
  { to: "/app/customers", label: "Kunder", icon: Users, perm: "customers" },
  { to: "/app/treatments", label: "Behandlingar", icon: Sparkles, perm: "treatments" },
  { to: "/app/journal", label: "Journal", icon: FileText, perm: "journal" },
  { to: "/app/forms", label: "Formulär", icon: ClipboardList, perm: "forms" },
  { to: "/app/health", label: "Hälsodeklarationer", icon: HeartPulse, perm: "health" },
  { to: "/app/pos", label: "Kassa", icon: Receipt, perm: "payments" },
  { to: "/app/z-report", label: "Z-rapport", icon: Calculator, perm: "payments" },
  { to: "/app/reports", label: "Rapporter", icon: BarChart3, perm: "reports" },
  { to: "/app/staff", label: "Personal", icon: UserCog, perm: "staff" },
  { to: "/app/schedule", label: "Schema & Resurser", icon: CalendarClock, perm: "schedule" },
  { to: "/app/management", label: "Ledningssystem", icon: ClipboardCheck, perm: "management" },
  { to: "/app/products", label: "Produkter & Lager", icon: Package, perm: "products", feature: "inventory" },
  { to: "/app/gift-cards", label: "Presentkort", icon: Gift, perm: "gift_cards", feature: "gift_cards" },
  { to: "/app/marketing", label: "Marknadsföring", icon: Megaphone, perm: "marketing", feature: "marketing" },
  { to: "/app/reviews", label: "Recensioner", icon: Star, perm: "reviews", feature: "reviews" },
  { to: "/app/messages", label: "Meddelanden", icon: MessageSquare, perm: "messages", feature: "messages" },
  { to: "/app/audit", label: "Audit-logg", icon: ShieldCheck, perm: "audit" },
  { to: "/app/compliance", label: "Säkerhet & Compliance", icon: ShieldCheck, perm: "compliance" },
  { to: "/app/operations", label: "Driftregler 1–12", icon: SlidersHorizontal, perm: "operations", feature: "clinic_operations" },
  { to: "/app/settings", label: "Inställningar", icon: Settings, perm: "settings" },
];

export default function AppShell() {
  const location = useLocation();
  const { permissions } = useStaffPermissions();
  const { isDisabled: isFlagDisabled } = useFeatureFlags();

  const handleLogout = async () => {
    await base44.auth.logout("/");
  };

  const visibleNav = nav.filter((item) => {
    if (permissions && permissions[item.perm] === false) return false;
    if (item.feature && isFlagDisabled(item.feature)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">L</div>
          <span className="font-semibold tracking-tight font-heading">Lydia</span>
          <LanguageSwitcher compact />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 space-y-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <a href="https://lydiaestetisk.se/" target="_self">
              <ExternalLink className="w-4 h-4 mr-2" /> Webbplatsen
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start">
            <LogOut className="w-4 h-4 mr-2" /> Logga ut
          </Button>
        </div>
      </aside>

      <div className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">L</div>
        <span className="font-semibold font-heading">Lydia</span>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher compact />
          <a href="https://lydiaestetisk.se/" aria-label="Webbplatsen" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
            <ExternalLink className="w-4 h-4" />
          </a>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Icon className="w-4 h-4" />
              </Link>
            );
          })}
        </div>
      </div>

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}