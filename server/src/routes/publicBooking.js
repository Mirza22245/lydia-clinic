import { Router } from 'express';
import { makeStore } from '../entities/store.js';
import { parseAllowedTreatments } from '../../../base44/shared/staffCompetence.ts';
import { clinicDateOf } from '../../../base44/shared/availability.ts';

export const publicBookingRouter = Router();

function parseFaq(raw) {
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

publicBookingRouter.all('/', async (req, res) => {
  try {
    const body = req.body || {};
    const clinicStore = makeStore('Clinic', { bypass: true });
    const treatmentStore = makeStore('Treatment', { bypass: true });
    const staffStore = makeStore('Staff', { bypass: true });
    const campaignStore = makeStore('Campaign', { bypass: true });

    let clinic = body.clinic_id ? await clinicStore.get(body.clinic_id).catch(() => null) : null;
    if (!clinic) {
      const clinics = await clinicStore.filter({}, { limit: 1 });
      clinic = (Array.isArray(clinics) ? clinics : clinics?.items || [])[0];
    }
    if (!clinic) return res.status(404).json({ error: 'Ingen klinik hittades' });

    const [treatments, staff, campaigns] = await Promise.all([
      treatmentStore.filter({ clinic_id: clinic.id }, { sort: 'name', limit: 200 }),
      staffStore.filter({ clinic_id: clinic.id, active: true }, { sort: 'name', limit: 100 }),
      campaignStore.filter({ clinic_id: clinic.id, status: 'active' }, { sort: '-created_date', limit: 20 }),
    ]);

    const today = clinicDateOf(Date.now());
    const activeCampaigns = (campaigns.items || [])
      .filter((c) => (!c.valid_from || c.valid_from <= today) && (!c.valid_until || c.valid_until >= today))
      .map((c) => ({
        id: c.id, name: c.name, description: c.description || '', type: c.type,
        discount_type: c.discount_type, discount_value: c.discount_value, valid_until: c.valid_until || null,
      }));

    res.json({
      clinic: {
        id: clinic.id, name: clinic.name, brand_name: clinic.brand_name || clinic.name,
        phone: clinic.phone, email: clinic.email, address: clinic.address,
        description: clinic.description || '', opening_hours: clinic.opening_hours || '',
        logo_url: clinic.logo_url || '', faq: parseFaq(clinic.faq),
      },
      treatments: (treatments.items || []).map((t) => ({
        id: t.id, name: t.name, duration: t.duration, price: t.price, category: t.category,
        description: t.description, requires_health_declaration: !!t.requires_health_declaration,
        requires_consent: t.requires_consent !== false, requires_treatment_info: !!t.requires_treatment_info,
        requires_aftercare: !!t.requires_aftercare, requires_payment: !!t.requires_payment,
        guest_booking_allowed: t.guest_booking_allowed !== false,
        min_age: t.treatment_type === 'injektion' ? Math.max(18, t.min_age || 0) : t.min_age || 0,
        waiting_period_days: t.waiting_period_days || 0, betanketid_hours: t.betanketid_hours || 0,
        cancellation_hours: t.cancellation_hours ?? 24, no_show_fee: t.no_show_fee || 0,
        required_form_ids: t.required_form_ids || '',
      })),
      staff: (staff.items || []).map((s) => ({
        id: s.id, name: s.name, title: s.title,
        allowed_treatment_ids: parseAllowedTreatments(s.allowed_treatment_ids),
      })),
      campaigns: activeCampaigns,
    });
  } catch (e) {
    console.error('[public-booking-data]', e);
    res.status(500).json({ error: e.message || 'Serverfel' });
  }
});
