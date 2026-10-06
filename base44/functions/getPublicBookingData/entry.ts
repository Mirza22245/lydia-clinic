import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { parseAllowedTreatments } from '../../shared/staffCompetence.ts';
import { clinicDateOf } from '../../shared/availability.ts';

// Offentlig data för klinikens webbplats och onlinebokning: klinik, behandlingar,
// aktiv personal (inkl. vilka behandlingar de får utföra) och aktiva kampanjer.
// Ingen inloggning krävs — returnerar ENDAST publik information (inga patientuppgifter).
// Klinik väljs via clinic_id eller första tillgängliga.
function parseFaq(raw: any): { q: string; a: string }[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string' && x.q.trim() && x.a.trim())
      .map((x) => ({ q: x.q.trim(), a: x.a.trim() }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const entity = (name: string) => {
      const store = svc.entity?.(name) ?? svc.entities?.[name];
      if (!store || typeof store.filter !== 'function') {
        throw new Error(`Service entity unavailable: ${name}`);
      }
      return store;
    };
    const body = await req.json().catch(() => ({}));

    let clinic;
    if (body.clinic_id) {
      clinic = await entity('Clinic').get(body.clinic_id).catch(() => null);
    }
    if (!clinic) {
      const clinics: any = await entity('Clinic').filter({}, { limit: 1 });
      clinic = (Array.isArray(clinics) ? clinics : clinics?.items || [])[0];
    }
    if (!clinic) return Response.json({ error: 'Ingen klinik hittades' }, { status: 404 });

    const [treatments, staff, campaigns] = await Promise.all([
      entity('Treatment').filter({ clinic_id: clinic.id }, { sort: 'name', limit: 200 }),
      entity('Staff').filter({ clinic_id: clinic.id, active: true }, { sort: 'name', limit: 100 }),
      entity('Campaign').filter({ clinic_id: clinic.id, status: 'active' }, { sort: '-created_date', limit: 20 }),
    ]);

    const today = clinicDateOf(Date.now());
    const activeCampaigns = (campaigns.items || [])
      .filter((c) => (!c.valid_from || c.valid_from <= today) && (!c.valid_until || c.valid_until >= today))
      .map((c) => ({
        id: c.id, name: c.name, description: c.description || '', type: c.type,
        discount_type: c.discount_type, discount_value: c.discount_value, valid_until: c.valid_until || null,
      }));

    return Response.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        brand_name: clinic.brand_name || clinic.name,
        phone: clinic.phone, email: clinic.email, address: clinic.address,
        description: clinic.description || '',
        opening_hours: clinic.opening_hours || '',
        logo_url: clinic.logo_url || '',
        faq: parseFaq(clinic.faq),
      },
      treatments: (treatments.items || []).map((t) => ({
        id: t.id, name: t.name, duration: t.duration, price: t.price, category: t.category,
        description: t.description,
        requires_health_declaration: !!t.requires_health_declaration,
        requires_consent: t.requires_consent !== false,
        requires_treatment_info: !!t.requires_treatment_info,
        requires_aftercare: !!t.requires_aftercare,
        requires_payment: !!t.requires_payment,
        guest_booking_allowed: t.guest_booking_allowed !== false,
        min_age: t.treatment_type === 'injektion' ? Math.max(18, t.min_age || 0) : t.min_age || 0,
        waiting_period_days: t.waiting_period_days || 0,
        betanketid_hours: t.betanketid_hours || 0,
        cancellation_hours: t.cancellation_hours ?? 24,
        no_show_fee: t.no_show_fee || 0,
        required_form_ids: t.required_form_ids || '',
      })),
      staff: (staff.items || []).map((s) => ({
        id: s.id, name: s.name, title: s.title,
        allowed_treatment_ids: parseAllowedTreatments(s.allowed_treatment_ids),
      })),
      campaigns: activeCampaigns,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
