import { Router } from 'express';
import { withTx } from '../db/pool.js';
import { publicLimiter } from '../lib/rateLimit.js';

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

async function readRows(table, { clinicId = null, where = [], orderBy = null, limit = 100 } = {}) {
  const params = [];
  const conditions = [];
  if (clinicId) {
    params.push(clinicId);
    conditions.push(`clinic_id = $${params.length}`);
  }
  for (const condition of where) {
    conditions.push(condition.sql.replace(/\$(\d+)/g, (_, n) => {
      const idx = params.length + Number(n);
      return '$' + idx;
    }));
    if (condition.values) params.push(...condition.values);
  }
  const order = orderBy || 'created_date DESC';
  const sql = `SELECT id, data, created_date, updated_date, created_by_id, clinic_id
    FROM ${table}
    ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
    ORDER BY ${order}
    LIMIT ${Math.min(Math.max(Number(limit) || 100, 1), 5000)}`;
  const result = await withTx((client) => client.query(sql, params), { bypassRls: true });
  return result.rows.map((row) => ({
    ...(row.data || {}),
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by_id: row.created_by_id,
    clinic_id: row.clinic_id ?? row.data?.clinic_id ?? '',
  }));
}

export async function getPublicBookingData(body = {}) {
  let clinic = null;
  if (body.clinic_id) {
    const rows = await readRows('e_clinic', { where: [{ sql: 'id = $1', values: [String(body.clinic_id)] }], limit: 1 });
    clinic = rows[0] || null;
  }
  if (!clinic) {
    const clinics = await readRows('e_clinic', { orderBy: 'created_date ASC', limit: 1 });
    clinic = clinics[0] || null;
  }
  if (!clinic) {
    const error = new Error('Ingen klinik hittades');
    error.status = 404;
    throw error;
  }

  const [treatments, staff, campaigns] = await Promise.all([
    readRows('e_treatment', { clinicId: clinic.id, orderBy: "(data->>'name') ASC", limit: 200 }),
    readRows('e_staff', { clinicId: clinic.id, where: [{ sql: "(data->>'active')::boolean = $1", values: [true] }], orderBy: "(data->>'name') ASC", limit: 100 }),
    readRows('e_campaign', { clinicId: clinic.id, where: [{ sql: "data->>'status' = $1", values: ['active'] }], orderBy: 'created_date DESC', limit: 20 }),
  ]);

  const today = clinicDateOf(Date.now());
  const activeCampaigns = (campaigns || [])
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
    treatments: (treatments || []).filter((t) => t.active !== false).map((t) => ({
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
      min_age: ['injektion', 'filler', 'botox'].includes(String(t.treatment_type || '').toLowerCase()) ? Math.max(18, t.min_age || 0) : t.min_age || 0,
      waiting_period_days: t.waiting_period_days || 0,
      betanketid_hours: t.betanketid_hours || 0,
      cancellation_hours: t.cancellation_hours ?? 24,
      no_show_fee: t.no_show_fee || 0,
      required_form_ids: t.required_form_ids || '',
    })),
    staff: (staff || []).map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      allowed_treatment_ids: parseAllowedTreatments(s.allowed_treatment_ids),
    })),
    campaigns: activeCampaigns,
  };
}

export const publicBookingRouter = Router();

publicBookingRouter.all('/', publicLimiter, async (req, res) => {
  try {
    res.json(await getPublicBookingData(req.body || {}));
  } catch (e) {
    console.error('[public-booking-data]', e);
    res.status(e?.status || 500).json({ error: e?.message || 'Serverfel' });
  }
});
