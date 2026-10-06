// Mongo-style query -> SQL WHERE (JSONB doc-store). Parametriserad översättning med
// fältnamnsvalidering. Datafält läses som text med ->> (aldrig ->, som ger JSON-citerad text) och
// castas efter schemats typ (number/boolean/date/date-time). Stöder $eq, $ne, $gt/$gte/$lt/$lte,
// $in/$nin, $exists, $regex, $and/$or. Fältnamn måste finnas i entitetens schema eller vara kända
// kolumner (id/created_date/updated_date/created_by_id/clinic_id). Prefixet "data." (från RLS-regler)
// motsvarar samma fält.

const COLS = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'clinic_id']);
const FIELD_RE = /^[a-z0-9_]+$/i;

class QErr extends Error {
  constructor(m) { super(m); this.status = 400; }
}

function normField(field) {
  const f = field.startsWith('data.') ? field.slice(5) : field;
  if (!FIELD_RE.test(f)) throw new QErr(`Ogiltigt fältnamn: ${field}`);
  return f;
}

// Fältnamnet är validerat mot FIELD_RE och entitetens schema, så det kan inlinas som SQL-literal.
function txt(field) { return `(data->>'${field}')`; }

function schemaType(entity, field) {
  const p = entity.properties?.[field] || {};
  if (p.format === 'date-time') return 'timestamptz';
  if (p.format === 'date') return 'date';
  if (p.type === 'number' || p.type === 'integer') return 'numeric';
  if (p.type === 'boolean') return 'boolean';
  return 'text';
}

// SQL-uttryck för ett fält: kolumn, eller datafält castat efter schematyp.
function expr(entity, field) {
  if (COLS.has(field)) return field;
  if (!entity.fields.includes(field)) throw new QErr(`Okänt fält: ${field}`);
  const t = schemaType(entity, field);
  return t === 'text' ? txt(field) : `(NULLIF(${txt(field)}, '')::${t})`;
}

function asText(entity, field) {
  if (COLS.has(field)) return `${field}::text`;
  if (!entity.fields.includes(field)) throw new QErr(`Okänt fält: ${field}`);
  return txt(field);
}

function isTextual(entity, field) {
  return !COLS.has(field) && schemaType(entity, field) === 'text';
}

function bind(entity, field, v, params) {
  params.push(isTextual(entity, field) || COLS.has(field) ? (v === null ? null : String(v)) : v);
  return `$${params.length}`;
}

export function buildWhere(entity, query, params) {
  if (!query || typeof query !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or' || k === '$and') {
      if (!Array.isArray(v)) throw new QErr(`${k} kräver array`);
      const subs = v.map((sub) => buildWhere(entity, sub, params)).filter(Boolean);
      if (subs.length) parts.push(`(${subs.join(k === '$or' ? ' OR ' : ' AND ')})`);
    } else if (k.startsWith('$')) {
      throw new QErr(`Top-level operator ${k} stöds ej`);
    } else {
      parts.push(buildCond(entity, k, v, params));
    }
  }
  return parts.length ? parts.join(' AND ') : '';
}

function buildCond(entity, rawField, v, params) {
  const field = normField(rawField);
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const ops = [];
    for (const [op, ov] of Object.entries(v)) {
      if (op === '$options') continue;
      ops.push(buildOp(entity, field, op, ov, params));
    }
    return ops.length ? `(${ops.join(' AND ')})` : 'TRUE';
  }
  const e = expr(entity, field);
  if (v === null) return `(${e} IS NULL)`;
  return `${e} = ${bind(entity, field, v, params)}`;
}

function buildOp(entity, field, op, ov, params) {
  const e = expr(entity, field);
  switch (op) {
    case '$ne':
      if (ov === null) return `(${e} IS NOT NULL)`;
      return `${e} IS DISTINCT FROM ${bind(entity, field, ov, params)}`;
    case '$in':
    case '$nin': {
      if (!Array.isArray(ov)) throw new QErr(`${op} kräver array`);
      if (!ov.length) return op === '$in' ? 'FALSE' : 'TRUE';
      const phs = ov.map((x) => bind(entity, field, x, params)).join(',');
      return op === '$in' ? `${e} IN (${phs})` : `(${e} IS NULL OR ${e} NOT IN (${phs}))`;
    }
    case '$gt': return `${e} > ${bind(entity, field, ov, params)}`;
    case '$gte': return `${e} >= ${bind(entity, field, ov, params)}`;
    case '$lt': return `${e} < ${bind(entity, field, ov, params)}`;
    case '$lte': return `${e} <= ${bind(entity, field, ov, params)}`;
    case '$exists':
      if (COLS.has(field)) return ov ? `${field} IS NOT NULL` : `${field} IS NULL`;
      return ov ? `jsonb_exists(data, '${field}')` : `(NOT jsonb_exists(data, '${field}'))`;
    case '$regex': {
      if (typeof ov !== 'string' || ov.length > 500) throw new QErr('Ogiltigt regex');
      params.push(ov);
      return `${asText(entity, field)} ~* $${params.length}`;
    }
    default: throw new QErr(`Operator ${op} stöds ej`);
  }
}

export function buildOrderBy(entity, sort) {
  if (!sort || typeof sort !== 'string') return 'created_date DESC, id DESC';
  const dir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const field = normField(sort.replace(/^-/, ''));
  return `${expr(entity, field)} ${dir}, id ${dir}`;
}

export function buildSelectFields() {
  // Vi hämtar alltid hela raden; fields-filtrering sker i appen (låg kostnad).
  return '*';
}

export function flatten(row) {
  if (!row) return null;
  const d = row.data || {};
  return { ...d, id: row.id, created_date: row.created_date, updated_date: row.updated_date, created_by_id: row.created_by_id, clinic_id: row.clinic_id ?? d.clinic_id ?? '' };
}

export { QErr };