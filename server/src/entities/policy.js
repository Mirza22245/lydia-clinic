// RLS-policyinterpreter. Kompilerar en entitets rls-regel för en operation
// till antingen DENY eller { filter } (en Mongo-style query som läggs på
// SQL-nivå). Strengare än Base44: en tom mall (t.ex. patient utan clinic_id)
// nekar istället för att matcha poster med tomt fält. Operationer utan regel
// nekas (fail-closed) — utom för platform-admin som alltid passerar.

import { getUserClinicId, getStaffRole, isPlatformAdmin } from './user-context.js';

export function resolveUserPath(user, path) {
  if (path === 'id' || path === 'email' || path === 'role' || path === 'full_name') return user ? user[path] : undefined;
  if (path.startsWith('data.')) {
    const key = path.slice(5);
    return user ? user[key] ?? user.data?.[key] : undefined;
  }
  return undefined;
}

function evalUserCond(cond, user) {
  for (const [k, v] of Object.entries(cond || {})) {
    const uv = resolveUserPath(user, k);
    if (Array.isArray(v)) { if (!v.includes(uv)) return false; }
    else if (uv !== v) return false;
  }
  return true;
}

function resolveTemplate(tpl, user) {
  if (typeof tpl !== 'string') return { value: tpl, ok: true };
  const m = tpl.match(/^\{\{user\.([a-zA-Z0-9_.]+)\}\}$/);
  if (!m) return { value: tpl, ok: true };
  const v = resolveUserPath(user, m[1]);
  if (v === undefined || v === null || v === '') return { value: null, ok: false };
  return { value: v, ok: true };
}

function isCond(node) {
  return node && typeof node === 'object' && !Object.keys(node).some((k) => k.startsWith('$')) && !Object.keys(node).every((k) => k.startsWith('{{') || k.includes('.'));
}

function compileNode(node, user) {
  if (node === true || (typeof node === 'object' && node !== null && Object.keys(node).length === 0)) return { allow: true, filter: {} };
  if (node === false) return { allow: false };
  if (!node || typeof node !== 'object') return { allow: false };
  if ('$or' in node) {
    for (const child of node.$or) {
      const r = compileNode(child, user);
      if (r.allow) return r;
    }
    return { allow: false };
  }
  if ('$and' in node) {
    let filter = {};
    for (const child of node.$and) {
      const r = compileNode(child, user);
      if (!r.allow) return { allow: false };
      if (r.filter) filter = { ...filter, ...r.filter };
    }
    return { allow: true, filter };
  }
  if ('user_condition' in node) {
    return evalUserCond(node.user_condition, user) ? { allow: true, filter: {} } : { allow: false };
  }
  // record condition
  const filter = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((x) => x.startsWith('$'))) {
      const sub = {};
      for (const [op, ov] of Object.entries(v)) {
        const r = resolveTemplate(ov, user);
        if (!r.ok) return { allow: false };
        sub[op] = r.value;
      }
      filter[k] = sub;
    } else {
      const r = resolveTemplate(v, user);
      if (!r.ok) return { allow: false };
      filter[k] = r.value;
    }
  }
  return { allow: true, filter };
}

// Kompilera regel för en operation. Returnerar DENY eller { filter }.
export function compileRule(rls, op, user) {
  if (isPlatformAdmin(user)) return { allow: true, filter: {} };
  const rule = rls?.[op];
  if (rule === undefined) return { allow: false }; // fail-closed
  return compileNode(rule, user);
}

// Utvärdera en record-condition mot ett dokument (för create-validering).
export function matchDoc(filter, doc) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [k, v] of Object.entries(filter)) {
    const field = k.startsWith('data.') ? k.slice(5) : k;
    const dv = doc[field];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [op, ov] of Object.entries(v)) {
        if (op === '$ne') { if (dv === ov) return false; }
        else if (op === '$in') { if (!Array.isArray(ov) || !ov.includes(dv)) return false; }
        else if (op === '$nin') { if (Array.isArray(ov) && ov.includes(dv)) return false; }
        else return false;
      }
    } else if (dv !== v) return false;
  }
  return true;
}