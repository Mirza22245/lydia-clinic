// Behörighetsmatris för personalroller.
// Används för att visa/hämta behörigheter och kan användas för att gate-a UI och operationer.

export const PERMISSION_AREAS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "customers", label: "Kunder" },
  { key: "bookings", label: "Bokningar" },
  { key: "treatments", label: "Behandlingar" },
  { key: "journal", label: "Journal" },
  { key: "forms", label: "Formulär" },
  { key: "health", label: "Hälsodeklarationer" },
  { key: "staff", label: "Personal" },
  { key: "schedule", label: "Schema & Resurser" },
  { key: "payments", label: "Kassa" },
  { key: "reports", label: "Rapporter" },
  { key: "management", label: "Ledningssystem" },
  { key: "audit", label: "Audit-logg" },
  { key: "settings", label: "Inställningar" },
];

// Standardbehörigheter per roll.
export const ROLE_PERMISSIONS = {
  administratör: {
    dashboard: true,
    customers: true,
    bookings: true,
    treatments: true,
    journal: true,
    forms: true,
    health: true,
    staff: true,
    schedule: true,
    payments: true,
    reports: true,
    management: true,
    audit: true,
    settings: true,
  },
  behandlare: {
    dashboard: true,
    customers: true,
    bookings: true,
    treatments: false,
    journal: true,
    forms: true,
    health: true,
    staff: false,
    schedule: false,
    payments: false,
    reports: false,
    management: false,
    audit: false,
    settings: false,
  },
  reception: {
    dashboard: true,
    customers: true,
    bookings: true,
    treatments: true,
    forms: true,
    journal: false,
    health: false,
    staff: false,
    schedule: false,
    payments: false,
    reports: false,
    management: false,
    audit: false,
    settings: false,
  },
};

export const ROLE_LABELS = {
  administratör: "Administratör",
  behandlare: "Behandlare",
  reception: "Reception",
};

export const ROLE_DESCRIPTIONS = {
  administratör: "Full åtkomst till hela systemet inklusive personal, kassa och inställningar.",
  behandlare: "Hanterar kunder, bokningar, journal och formulär. Ingen åtkomst till personal, kassa eller inställningar.",
  reception: "Hanterar bokningar, kunder och intake-formulär. Ingen åtkomst till journal, hälsodata, kassa eller inställningar.",
};

// Returnera behörigheter för en personalpost: explicita om sparade, annars rollens standard.
export function getPermissions(staff) {
  if (staff?.permissions) {
    try {
      const parsed = JSON.parse(staff.permissions);
      if (parsed && typeof parsed === "object") return { ...ROLE_PERMISSIONS[staff.role] || {}, ...parsed };
    } catch {
      // fall through to role default
    }
  }
  return { ...(ROLE_PERMISSIONS[staff?.role] || ROLE_PERMISSIONS.behandlare) };
}

export function hasPermission(staff, area) {
  return getPermissions(staff)[area] === true;
}