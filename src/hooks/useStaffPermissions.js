import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getPermissions, ROLE_PERMISSIONS } from "@/lib/staffPermissions";

// Hämtar behörigheter för den inloggade användaren.
// Admin får administratörsbehörighet direkt via auth-rollen.
// Övrig personal måste ha en matchande Staff-post. Vanliga kunder får ingen personalbehörighet.
export function useStaffPermissions() {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.role === "admin") {
          if (active) setPermissions({ ...ROLE_PERMISSIONS.administratör });
          return;
        }

        const email = me?.email?.toLowerCase();
        if (!email) {
          if (active) setPermissions({});
          return;
        }

        const page = await base44.entities.Staff.filter({ email }, { limit: 10 });
        const staff = (page.items || []).find(
          (s) => (s.email || "").toLowerCase() === email && s.active !== false
        );

        if (active) {
          setPermissions(staff ? getPermissions(staff) : {});
        }
      } catch {
        if (active) setPermissions({});
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { permissions, loading };
}