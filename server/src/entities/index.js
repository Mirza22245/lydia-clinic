import { makeStore } from './store.js';
import { getUserClinicId, getStaffRole, isPlatformAdmin } from './user-context.js';

// Service-role: bypass RLS + area-gating. Används ENBART av pålitlig server-
// side-kod (backend-funktioner, interna cron). Aldrig direkt från klienten.
export function serviceRole() {
  return { entities: entityProxy({ bypass: true }) };
}

// User-scoped: RLS + behörighetsområden från staffPermissions.
export function userClient(user) {
  const ctx = { user, bypass: isPlatformAdmin(user) };
  return {
    entities: entityProxy(ctx),
    auth: {
      me: async () => user,
    },
  };
}

function entityProxy(ctx) {
  return new Proxy({}, {
    get: (_, name) => {
      if (name === 'User') return userStore(ctx);
      return makeStore(String(name), ctx);
    },
  });
}

// User-entiteten: special-cased (egen users-tabell). Stöd filter/get/update/
// updateMany för syncStaffRole. Ingen create (använd invite).
function userStore(ctx) {
  return {
    filter: async (query = {}, opts = {}) => {
      if (!ctx.bypass) throw Object.assign(new Error('Forbidden'), { status: 403 });
      const { pool } = await import('../db/pool.js');
      const where = Object.entries(query).map(([k, v], i) => {
        if (k === 'email') return `lower(email) = lower($${i + 1})`;
        if (k === 'id') return `id = $${i + 1}`;
        return 'TRUE';
      }).join(' AND ') || 'TRUE';
      const vals = Object.values(query).map((v) => v);
      const res = await pool.query(`SELECT id, email, role, full_name, clinic_id, staff_role, created_date FROM users WHERE ${where} LIMIT ${Number(opts.limit) || 100}`, vals);
      return { items: res.rows.map(normalizeUser), has_more: false, next_cursor: null };
    },
    get: async (id) => {
      if (!ctx.bypass) throw Object.assign(new Error('Forbidden'), { status: 403 });
      const { pool } = await import('../db/pool.js');
      const res = await pool.query('SELECT id, email, role, full_name, clinic_id, staff_role, created_date FROM users WHERE id = $1', [id]);
      if (!res.rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
      return normalizeUser(res.rows[0]);
    },
    update: async (id, patch) => {
      if (!ctx.bypass) throw Object.assign(new Error('Forbidden'), { status: 403 });
      const allowed = {};
      if ('staff_role' in patch) allowed.staff_role = patch.staff_role || null;
      if ('clinic_id' in patch) allowed.clinic_id = patch.clinic_id || null;
      if ('full_name' in patch) allowed.full_name = patch.full_name;
      if (!Object.keys(allowed).length) throw Object.assign(new Error('Inga tillåtna fält'), { status: 400 });
      const { pool } = await import('../db/pool.js');
      const sets = Object.keys(allowed).map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = [...Object.values(allowed), id];
      const res = await pool.query(`UPDATE users SET ${sets} WHERE id = $${vals.length} RETURNING id, email, role, full_name, clinic_id, staff_role, created_date`, vals);
      return normalizeUser(res.rows[0]);
    },
    updateMany: async (query, op) => {
      if (!ctx.bypass) throw Object.assign(new Error('Forbidden'), { status: 403 });
      const { pool } = await import('../db/pool.js');
      if (op.$unset?.staff_role !== undefined) {
        const id = query.id;
        await pool.query('UPDATE users SET staff_role = NULL WHERE id = $1', [id]);
        return { has_more: false };
      }
      if (op.$set) {
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(op.$set)) { if (['staff_role', 'clinic_id', 'full_name'].includes(k)) { sets.push(`${k} = $${vals.length + 1}`); vals.push(v); } }
        if (!sets.length) return { has_more: false };
        vals.push(query.id);
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      }
      return { has_more: false };
    },
  };
}

function normalizeUser(u) {
  return {
    id: u.id, email: u.email, role: u.role, full_name: u.full_name,
    clinic_id: u.clinic_id || '', staff_role: u.staff_role || '',
    created_date: u.created_date,
    data: { clinic_id: u.clinic_id || '', staff_role: u.staff_role || '' },
  };
}