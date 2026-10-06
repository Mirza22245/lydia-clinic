import { withTx } from '../db/pool.js';
import { getEntity, QueryError } from './registry.js';
import { compileRule, matchDoc } from './policy.js';
import { buildWhere, buildOrderBy, flatten, QErr } from './query.js';
import { readArea, writeArea, isSensitiveRead } from './areas.js';
import { getUserClinicId, getStaffRole, isPlatformAdmin } from './user-context.js';
import { ROLE_PERMISSIONS } from '../../../src/lib/staffPermissions.js';

const IMMUTABLE = new Set(['id', 'created_date', 'updated_date', 'created_by_id']);
const PROTECTED_FIELDS = {
  JournalEntry: new Set(['is_signed', 'signed_at', 'signed_by', 'signature_hash', 'version']),
  ClinicalTreatmentRecord: new Set(['is_signed', 'signed_at', 'signed_by', 'signature_hash']),
  Consent: new Set(['granted', 'granted_at', 'granted_by', 'signed_text', 'document_version', 'ip_address', 'device_info', 'signature_hash', 'revoked_at']),
  Payment: new Set(['status', 'paid_at', 'receipt_number', 'stripe_payment_intent_id']),
  // Bokningens tid, behandlare, behandling och status ändras ENDAST via validerade funktioner
  // (saveStaffBooking, rescheduleBooking, updateBookingStatus) som tillämpar kravkontroll,
  // dubbelbokningsskydd och behandlarens behörighet. Direkta entity-anrop kan inte kringgå dem.
  Booking: new Set(['status', 'staff_name', 'start_time', 'end_time', 'treatment_id', 'room_id', 'resource_ids', 'pay_token_hash']),
  AuditLog: new Set(['event_type', 'entity_type', 'entity_id', 'description', 'user_id', 'user_name', 'metadata', 'clinic_id']),
};
// Vid SKAPANDE gäller en snävare lista för Payment: personal registrerar kassabetalningar (status,
// kvittonummer) direkt, men stripe_payment_intent_id sätts endast av Stripe-webhooken.
const PROTECTED_ON_CREATE = {
  Payment: new Set(['stripe_payment_intent_id']),
};

function ctxFor(user, { bypass } = {}) {
  return { user, bypass: bypass || isPlatformAdmin(user), clinicId: getUserClinicId(user) };
}

function checkArea(entityName, user, op) {
  if (isPlatformAdmin(user)) return;
  const role = getStaffRole(user);
  if (!role) throw new QueryError('Forbidden', 403);
  const area = op === 'read' ? readArea(entityName) : writeArea(entityName);
  if (!area) throw new QueryError('Forbidden', 403);
  // För känsliga läs-entiteter krävs att rollen har området (reception saknar journal/health/payments).
  if (op === 'read' && isSensitiveRead(entityName)) {
    const perms = ROLE_PERMISSIONS[role] || {};
    if (!perms[area]) throw new QueryError('Forbidden', 403);
  } else {
    const perms = ROLE_PERMISSIONS[role] || {};
    if (!perms[area]) throw new QueryError('Forbidden', 403);
  }
}

function stripImmutable(entity, doc, { protect, creating }) {
  const prot = (creating && PROTECTED_ON_CREATE[entity.name]) || PROTECTED_FIELDS[entity.name];
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (IMMUTABLE.has(k)) continue;
    if (protect && prot?.has(k)) continue;
    // En post får aldrig flyttas till en annan klinik via vanliga uppdateringar.
    if (protect && !creating && k === 'clinic_id') continue;
    out[k] = v;
  }
  return out;
}

export function makeStore(entityName, userCtx) {
  const entity = getEntity(entityName);
  const bypass = userCtx?.bypass;
  const user = userCtx?.user;

  // Alla frågor körs med RLS-kontext (klinik eller service-role bypass) så att
  // PostgreSQL FORCE RLS är det yttersta skyddet, utöver applikationslagrets regler.
  const pool = {
    query: (sql, params) => withTx(
      (client) => client.query(sql, params),
      bypass ? { bypassRls: true } : { clinicId: getUserClinicId(user) }
    ),
  };

  function requireAuth() {
    if (bypass) return;
    if (!user) throw new QueryError('Unauthorized', 401);
  }

  async function filter(query = {}, opts = {}) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'read'); }
    const params = [];
    let where = '';
    if (!bypass) {
      const r = compileRule(entity.rls, 'read', user);
      if (!r.allow) return { items: [], has_more: false, next_cursor: null };
      const rlsWhere = buildWhere(entity, r.filter, params);
      where = rlsWhere;
    }
    const qWhere = buildWhere(entity, query, params);
    where = where ? (qWhere ? `${where} AND (${qWhere})` : where) : qWhere;
    const sql = `SELECT * FROM ${entity.table} ${where ? 'WHERE ' + where : ''}`;
    const limit = Math.min(Math.max(Math.floor(Number(opts.limit)) || 0, 0), 5000);
    const offset = Math.max(Math.floor(Number(opts.cursor)) || 0, 0);
    const limitClause = limit > 0 ? ` LIMIT ${limit + 1} OFFSET ${offset}` : '';
    const order = buildOrderBy(entity, opts.sort);
    const res = await pool.query(`${sql} ORDER BY ${order}${limitClause}`, params);
    let items = res.rows.map(flatten);
    let hasMore = false;
    if (limit > 0 && items.length > limit) { items = items.slice(0, limit); hasMore = true; }
    return { items, has_more: hasMore, next_cursor: hasMore ? String(offset + limit) : null };
  }

  async function get(id) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'read'); }
    const res = await pool.query(`SELECT * FROM ${entity.table} WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new QueryError('Not found', 404);
    if (!bypass) {
      const r = compileRule(entity.rls, 'read', user);
      if (!r.allow || !matchDoc(r.filter, flatten(row))) throw new QueryError('Not found', 404);
    }
    return flatten(row);
  }

  async function create(doc) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'write'); }
    const data = stripImmutable(entity, doc || {}, { protect: !bypass, creating: true });
    // Auto-stampa clinic_id för klinikentiteter (alla utom Clinic).
    if (entityName !== 'Clinic') {
      if (bypass) {
        // service-role: behåll det som skickas (eller tomt)
        if (data.clinic_id === undefined) data.clinic_id = '';
      } else {
        data.clinic_id = getUserClinicId(user) || '';
      }
    }
    if (!bypass) {
      const r = compileRule(entity.rls, 'create', user);
      if (!r.allow || !matchDoc(r.filter, data)) throw new QueryError('Forbidden', 403);
    }
    const res = await pool.query(
      `INSERT INTO ${entity.table} (data, clinic_id, created_by_id) VALUES ($1::jsonb, $2, $3) RETURNING *`,
      [JSON.stringify(data), data.clinic_id || null, user?.id || null]
    );
    return flatten(res.rows[0]);
  }

  async function update(id, patch) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'write'); }
    const data = stripImmutable(entity, patch || {}, { protect: !bypass });
    const res = await withTx(async (client) => {
      const cur = await client.query(`SELECT * FROM ${entity.table} WHERE id = $1 FOR UPDATE`, [id]);
      const row = cur.rows[0];
      if (!row) return null;
      if (!bypass) {
        const r = compileRule(entity.rls, 'update', user);
        if (!r.allow || !matchDoc(r.filter, flatten(row))) return null;
      }
      const merged = { ...(row.data || {}), ...data };
      const upd = await client.query(`UPDATE ${entity.table} SET data = $1::jsonb, updated_date = NOW() WHERE id = $2 RETURNING *`, [JSON.stringify(merged), id]);
      return upd.rows[0];
    }, { bypassRls: !!bypass, clinicId: bypass ? undefined : getUserClinicId(user) });
    if (!res) throw new QueryError('Not found', 404);
    return flatten(res);
  }

  async function deleteFn(id) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'write'); }
    const res = await withTx(async (client) => {
      const cur = await client.query(`SELECT * FROM ${entity.table} WHERE id = $1 FOR UPDATE`, [id]);
      const row = cur.rows[0];
      if (!row) return null;
      if (!bypass) {
        const r = compileRule(entity.rls, 'delete', user);
        if (!r.allow || !matchDoc(r.filter, flatten(row))) return null;
      }
      await client.query(`DELETE FROM ${entity.table} WHERE id = $1`, [id]);
      return row;
    }, { bypassRls: !!bypass, clinicId: bypass ? undefined : getUserClinicId(user) });
    if (!res) throw new QueryError('Not found', 404);
    return { id };
  }

  async function count(query = {}) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'read'); }
    const params = [];
    let where = '';
    if (!bypass) {
      const r = compileRule(entity.rls, 'read', user);
      if (!r.allow) return 0;
      where = buildWhere(entity, r.filter, params);
    }
    const qWhere = buildWhere(entity, query, params);
    where = where ? (qWhere ? `${where} AND (${qWhere})` : where) : qWhere;
    const res = await pool.query(`SELECT COUNT(*)::int AS c FROM ${entity.table} ${where ? 'WHERE ' + where : ''}`, params);
    return res.rows[0].c;
  }

  async function aggregate(opts = {}) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'read'); }
    const params = [];
    let where = '';
    if (!bypass) {
      const r = compileRule(entity.rls, 'read', user);
      if (!r.allow) return { rows: [], truncated: false };
      where = buildWhere(entity, r.filter, params);
    }
    if (opts.query) {
      const qWhere = buildWhere(entity, opts.query, params);
      where = where ? (qWhere ? `${where} AND (${qWhere})` : where) : qWhere;
    }
    const groupBy = opts.groupBy ? (Array.isArray(opts.groupBy) ? opts.groupBy : [opts.groupBy]) : [];
    const sums = opts.sum ? (Array.isArray(opts.sum) ? opts.sum : [opts.sum]) : [];
    const avgs = opts.avg ? (Array.isArray(opts.avg) ? opts.avg : [opts.avg]) : [];
    const mins = opts.min ? (Array.isArray(opts.min) ? opts.min : [opts.min]) : [];
    const maxs = opts.max ? (Array.isArray(opts.max) ? opts.max : [opts.max]) : [];
    const select = [];
    const groupCols = groupBy.map((g) => {
      if (['id', 'created_date', 'clinic_id'].includes(g)) return `${g}::text`;
      return `(${buildJsonPath(g)})`;
    });
    groupBy.forEach((g, i) => { select.push(`${groupCols[i]} AS ${g}`); });
    select.push('COUNT(*)::int AS count');
    const numExpr = (f) => `COALESCE(NULLIF(${buildJsonPath(f)}, '')::numeric, 0)`;
    sums.forEach((f) => select.push(`SUM(${numExpr(f)})::float8 AS sum_${f}`));
    avgs.forEach((f) => select.push(`AVG(${numExpr(f)})::float8 AS avg_${f}`));
    mins.forEach((f) => select.push(`MIN(${numExpr(f)})::float8 AS min_${f}`));
    maxs.forEach((f) => select.push(`MAX(${numExpr(f)})::float8 AS max_${f}`));
    const sql = `SELECT ${select.join(', ')} FROM ${entity.table} ${where ? 'WHERE ' + where : ''} ${groupBy.length ? 'GROUP BY ' + groupCols.join(', ') : ''}`;
    const res = await pool.query(sql, params);
    return { rows: res.rows, truncated: false };
  }

  function buildJsonPath(f) {
    if (!/^[a-z0-9_]+$/i.test(f) || !entity.fields.includes(f)) throw new QErr(`Okänt fält: ${f}`);
    return `data->>'${f}'`;
  }

  // updateMany: stöder $set (används av stripeWebhook). Varje rad går via update()
  // så att skrivregler och skyddade fält gäller. Max 500 rader per anrop.
  async function updateMany(query = {}, op = {}) {
    if (!bypass) { requireAuth(); checkArea(entityName, user, 'write'); }
    const page = await filter(query, { limit: 500 });
    let updated = 0;
    for (const row of page.items) {
      await update(row.id, op.$set || {});
      updated++;
    }
    return { updated, has_more: page.has_more };
  }

  // Base44-compatible alias used by migrated functions.\n  async function list(opts = {}) { return filter({}, opts); }\n\n  return { filter, list, get, create, update, delete: deleteFn, count, aggregate, updateMany };
}