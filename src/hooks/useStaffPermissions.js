import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getPermissions, ROLE_PERMISSIONS } from "@/lib/staffPermissions";

// Hämtar behörigheter för den inloggade användaren baserat på matchande Staff-post (via e-post).
// Om ingen personalpost hittas antas full åtkomst (ägare/admin) så ingen låses ut.
export function useStaffPermissions() {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const email = me?.email?.toLowerCase();
        if (!email) {
          setPermissions({ ...ROLE_PERMISSIONS.administratör });
          return;
        }
        const page = await base44.entities.Staff.filter({}, { limit: 200 });
        const staff = (page.items || []).find((s) => (s.email || "").toLowerCase() === email);
        setPermissions(staff ? getPermissions(staff) : { ...ROLE_PERMISSIONS.administratör });
      } catch {
        setPermissions({ ...ROLE_PERMISSIONS.administratör });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { permissions, loading };
}