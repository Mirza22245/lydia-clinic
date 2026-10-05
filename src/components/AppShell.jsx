import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Users, Sparkles, FileText, ClipboardList, HeartPulse, UserCog, Receipt, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, perm: "dashboard" },
  { to: "/app/bookings", label: "Bokningar", icon: CalendarDays, perm: "bookings" },
  { to: "/app/customers", label: "Kunder", icon: Users, perm: "customers" },
  { to: "/app/treatments", label: "Behandlingar", icon: Sparkles, perm: "treatments" },
  { to: "/app/journal", label: "Journal", icon: FileText, perm: "journal" },
  { to: "/app/forms", label: "Formulär", icon: ClipboardList, perm: "forms" },
  { to: "/app/health", label: "Hälsodeklarationer", icon: HeartPulse, perm: "health" },
  { to: "/app/pos", label: "Kassa", icon: Receipt, perm: "payments" },
  { to: "/app/staff", label: "Personal", icon: UserCog, perm: "staff" },
];

export default function AppShell() {
  const location = useLocation();
  const { permissions } = useStaffPermissions();

  const handleLogout = async () => {
    await base44.auth.logout("/");
  };

  const visibleNav = permissions ? nav.filter((item) => permissions[item.perm] !== false) : nav;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">L</div>
          <span className="font-semibold tracking-tight font-heading">Lydia</span>
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
        <div className="border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start">
            <LogOut className="w-4 h-4 mr-2" /> Logga ut
          </Button>
        </div>
      </aside>

      <div className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">L</div>
        <span className="font-semibold font-heading">Lydia</span>
        <div className="ml-auto flex gap-1">
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