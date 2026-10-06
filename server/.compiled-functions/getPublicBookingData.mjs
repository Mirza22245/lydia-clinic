globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/getPublicBookingData/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/staffCompetence.ts
function parseAllowedTreatments(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

// ../base44/shared/availability.ts
var CLINIC_TZ = "Europe/Stockholm";
function clinicDateOf(ms) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

// ../base44/functions/getPublicBookingData/entry.ts
function parseFaq(raw) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x.q === "string" && typeof x.a === "string" && x.q.trim() && x.a.trim()).map((x) => ({ q: x.q.trim(), a: x.a.trim() })).slice(0, 50);
  } catch {
    return [];
  }
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    let clinic;
    if (body.clinic_id) {
      clinic = await svc.entities.Clinic.get(body.clinic_id).catch(() => null);
    }
    if (!clinic) {
      const clinics = await svc.entities.Clinic.filter({}, { limit: 1 });
      clinic = (Array.isArray(clinics) ? clinics : clinics?.items || [])[0];
    }
    if (!clinic) return Response.json({ error: "Ingen klinik hittades" }, { status: 404 });
    const [treatments, staff, campaigns] = await Promise.all([
      svc.entities.Treatment.filter({ clinic_id: clinic.id }, { sort: "name", limit: 200 }),
      svc.entities.Staff.filter({ clinic_id: clinic.id, active: true }, { sort: "name", limit: 100 }),
      svc.entities.Campaign.filter({ clinic_id: clinic.id, status: "active" }, { sort: "-created_date", limit: 20 })
    ]);
    const today = clinicDateOf(Date.now());
    const activeCampaigns = (campaigns.items || []).filter((c) => (!c.valid_from || c.valid_from <= today) && (!c.valid_until || c.valid_until >= today)).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || "",
      type: c.type,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      valid_until: c.valid_until || null
    }));
    return Response.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        brand_name: clinic.brand_name || clinic.name,
        phone: clinic.phone,
        email: clinic.email,
        address: clinic.address,
        description: clinic.description || "",
        opening_hours: clinic.opening_hours || "",
        logo_url: clinic.logo_url || "",
        faq: parseFaq(clinic.faq)
      },
      treatments: (treatments.items || []).map((t) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        price: t.price,
        category: t.category,
        description: t.description,
        requires_health_declaration: !!t.requires_health_declaration,
        requires_consent: t.requires_consent !== false,
        requires_treatment_info: !!t.requires_treatment_info,
        requires_aftercare: !!t.requires_aftercare,
        requires_payment: !!t.requires_payment,
        guest_booking_allowed: t.guest_booking_allowed !== false,
        // Injektioner har alltid lägst 18 år (IVO), oavsett inställt min_age — styr även födelsedatumsfältet i bokningen.
        min_age: t.treatment_type === "injektion" ? Math.max(18, t.min_age || 0) : t.min_age || 0,
        waiting_period_days: t.waiting_period_days || 0,
        betanketid_hours: t.betanketid_hours || 0,
        cancellation_hours: t.cancellation_hours ?? 24,
        no_show_fee: t.no_show_fee || 0,
        required_form_ids: t.required_form_ids || ""
      })),
      // allowed_treatment_ids: null = får utföra alla, annars lista med Treatment-ID.
      staff: (staff.items || []).map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        allowed_treatment_ids: parseAllowedTreatments(s.allowed_treatment_ids)
      })),
      campaigns: activeCampaigns
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
