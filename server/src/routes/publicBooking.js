import { Router } from 'express';
import { makeStore } from '../entities/store.js';

function parseAllowedTreatments(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

function clinicDateOf(ms) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

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

async function readStore(store, query = {}, opts = {}) {
  if (typeof store?.filter === 'function') return store.filter(query, opts);
  if (typeof store?.list === 'function') {
    const result = await store.list({ ...opts, limit: Math.max(Number(opts.limit) || 1000, 1000) });
    const items = Array.isArray(result) ? result : (result?.items || []);
    const matches = items.filter((row) => Object.entries(query).every(([key, value]) => row?.[key] === value));
    if (opts.sort) {
      const descending = String(opts.sort).startsWith('-');
      const key = descending ? String(opts.sort).slice(1) : String(opts.sort);
      matches.sort((a, b) => String(a?.[key] ?? '').localeCompare(String(b?.[key] ?? ''), 'sv'));
      if (descending) matches.reverse();
    }
    return { items: matches.slice(0, Number(opts.limit) || 1000), has_more: false, next_cursor: null };
  }
  throw new Error('Entity store saknar filter/list');
}

export async function getPublicBookingData(body = {}) {
  const clinicStore = makeStore('Clinic', { bypass: true });
  const treatmentStore = makeStore('Treatment', { bypass: true });
  const staffStore = makeStore('Staff', { bypass: true });
  const campaignStore = makeStore('Campaign', { bypass: true });

  let clinic = body.clinic_id ? await clinicStore.get(body.clinic_id).catch(() => null) : null;
  if (!clinic) {
    const clinics = await readStore(clinicStore, {}, { limit: 1 });
    clinic = (Array.isArray(clinics) ? clinics : clinics?.items || [])[0];
  }
  if (!clinic) {
    const error = new Error('Ingen klinik hittades');
    error.status = 404;
    throw error;
  }

  const [treatments, staff, campaigns] = await Promise.all([
    readStore(treatmentStore, { clinic_id: clinic.id }, { sort: 'name', limit: 200 }),
    staffStore.filter({ clinic_id: clinic.id }, { sort: 'name', limit: 100 }),
    readStore(campaignStore, { clinic_id: clinic.id, status: 'active' }, { sort: '-created_date', limit: 20 }),
  ]);

  const today = clinicDateOf(Date.now());
  const activeCampaigns = (campaigns.items || [])
    .filter((c) => (!c.valid_from || c.valid_from <= today) && (!c.valid_until || c.valid_until >= today))
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      type: c.type,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      valid_until: c.valid_until || null,
    }));

  return {
    clinic: {
      id: clinic.id,
      name: clinic.name,
      brand_name: clinic.brand_name || clinic.name,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
      description: clinic.description || '',
      opening_hours: clinic.opening_hours || '',
      logo_url: clinic.logo_url || '',
      faq: parseFaq(clinic.faq),
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
      min_age: t.treatment_type === 'injektion' ? Math.max(18, t.min_age || 0) : t.min_age || 0,
      waiting_period_days: t.waiting_period_days || 0,
      betanketid_hours: t.betanketid_hours || 0,
      cancellation_hours: t.cancellation_hours ?? 24,
      no_show_fee: t.no_show_fee || 0,
      required_form_ids: t.required_form_ids || '',
    })),
    staff: (staff.items || []).map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      allowed_treatment_ids: parseAllowedTreatments(s.allowed_treatment_ids),
    })),
    campaigns: activeCampaigns,
  };
}

export const publicBookingRouter = Router();

publicBookingRouter.all('/', async (req, res) => {
  try {
    res.json(await getPublicBookingData(req.body || {}));
  } catch (e) {
    console.error('[public-booking-data]', e);
    res.status(e?.status || 500).json({ error: e?.message || 'Serverfel' });
  }
});
