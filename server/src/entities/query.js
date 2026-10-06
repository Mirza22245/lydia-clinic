// Mongo-style query -> SQL WHERE (JSONB doc-store). Säker parametriserad
// översättning med fältnamns-validering och typ-medvetna cast för numeriska/
// datumjämförelser. Stöder $eq, $ne, $gt/$gte/$lt/$lte, $in/$nin, $exists, $regex,
// $and/$or. Kräver att fältnamn matchar entitetens schema (data-fält) eller
// är kända kolumner (id/created_date/updated_date/created_by_id/clinic_id).

const COLS = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'clinic_id']);
const FIELD_RE = /^[a-z0-9_]+$/i;

function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isBool(v) { return typeof v === 'boolean'; }

class QErr extends Error {
  constructor(m) { super(m); this.status = 400; }
}

function colExpr(entity, field) {
  if (COLS.has(field)) return field;
  if (!entity.fields.includes(field)) throw new QErr(`Okänt fält: ${field}`);
  return `data->>${JSON.stringify(field)}`;
}

function jsonbPath(field) { return `data->${JSON.stringify(field)}`; }

function cmpExpr(entity, field, op, val, params) {
  if (COLS.has(field)) {
    params.push(val);
    return `${field} ${op} $${params.length}`;
  }
  if (!entity.fields.includes(field)) throw new QErr(`Okänt fält: ${field}`);
  // data-fält: casta efter typ
  if (isNumber(val)) { params.push(val); return `(${jsonbPath(field)})::numeric ${op} $${params.length}`; }
  if (typeof val === 'string' && /^\d{4}-\d\d-\d\d/.test(val) && (field.endsWith('_date') || field.endsWith('_at') || field === 'entry_date')) {
    params.push(val); return `(${jsonbPath(field)})::timestamptz ${op} $${params.length}`;
  }
  params.push(String(val));
  return `(${jsonbPath(field)})::text ${op} $${params.length} COLLATE "C"`;
}

export function buildWhere(entity, query, params) {
  if (!query || typeof query !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(query)) {
    if (k === '$or') {
      const subs = v.map((sub) => buildWhere(entity, sub, params)).filter(Boolean);
      if (subs.length) parts.push(`(${subs.join(' OR ')})`);
    } else if (k === '$and') {
      const subs = v.map((sub) => buildWhere(entity, sub, params)).filter(Boolean);
      if (subs.length) parts.push(`(${subs.join(' AND ')})`);
    } else if (k.startsWith('$')) {
      throw new QErr(`Top-level operator ${k} stöds ej`);
    } else {
      parts.push(buildCond(entity, k, v, params));
    }
  }
  return parts.length ? parts.join(' AND ') : '';
}

function buildCond(entity, field, v, params) {
  if (!FIELD_RE.test(field)) throw new QErr(`Ogiltigt fältnamn: ${field}`);
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const ops = [];
    for (const [op, ov] of Object.entries(v)) {
      if (op === '$options') continue;
      ops.push(buildOp(entity, field, op, ov, params));
    }
    return ops.length ? `(${ops.join(' AND ')})` : 'TRUE';
  }
  // equality
  if (COLS.has(field)) {
    if (v === null) return `${field} IS NULL`;
    params.push(v); return `${field} = $${params.length}`;
  }
  if (!entity.fields.includes(field)) throw new QErr(`Okänt fält: ${field}`);
  if (v === null) return `(data->>${JSON.stringify(field)} IS NULL)`;
  if (isNumber(v)) { params.push(v); return `(${jsonbPath(field)})::numeric = $${params.length}`; }
  if (isBool(v)) { params.push(v); return `(${jsonbPath(field)})::boolean = $${params.length}`; }
  params.push(String(v));
  return `(${jsonbPath(field)})::text = $${params.length} COLLATE "C"`;
}

function buildOp(entity, field, op, ov, params) {
  const isCol = COLS.has(field);
  switch (op) {
    case '$ne': {
      if (isCol) { params.push(ov); return `${field} IS DISTINCT FROM $${params.length}`; }
      if (ov === null) return `(data->>${JSON.stringify(field)} IS NOT NULL)`;
      if (isNumber(ov)) { params.push(ov); return `COALESCE((${jsonbPath(field)})::numeric,0) IS DISTINCT FROM $${params.length}`; }
      params.push(String(ov)); return `COALESCE((${jsonbPath(field)})::text,'') IS DISTINCT FROM $${params.length} COLLATE "C"`;
    }
    case '$in': {
      if (!Array.isArray(ov)) throw new QErr('$in kräver array');
      if (!ov.length) return 'FALSE';
      const phs = ov.map((x) => { params.push(x); return `$${params.length}`; }).join(',');
      return isCol ? `${field} IN (${phs})` : `(${jsonbPath(field)})::text IN (${phs}) COLLATE "C"`;
    }
    case '$nin': {
      if (!Array.isArray(ov)) throw new QErr('$nin kräver array');
      if (!ov.length) return 'TRUE';
      const phs = ov.map((x) => { params.push(x); return `$${params.length}`; }).join(',');
      return isCol ? `(${field} IS NULL OR ${field} NOT IN (${phs}))` : `((${jsonbPath(field)})::text IS NULL OR (${jsonbPath(field)})::text NOT IN (${phs}) COLLATE "C")`;
    }
    case '$gt': return cmpExpr(entity, field, '>', ov, params);
    case '$gte': return cmpExpr(entity, field, '>=', ov, params);
    case '$lt': return cmpExpr(entity, field, '<', ov, params);
    case '$lte': return cmpExpr(entity, field, '<=', ov, params);
    case '$exists': {
      if (isCol) return ov ? `${field} IS NOT NULL` : `${field} IS NULL`;
      return ov ? `jsonb_exists(data, ${JSON.stringify(field)})` : `(NOT jsonb_exists(data, ${JSON.stringify(field)}))`;
    }
    case '$regex': {
      if (typeof ov !== 'string' || ov.length > 500) throw new QErr('Ogiltigt regex');
      params.push(ov);
      return isCol ? `${field} ~* $${params.length}` : `(${jsonbPath(field)})::text ~* $${params.length}`;
    }
    case '$options': return 'TRUE';
    default: throw new QErr(`Operator ${op} stöds ej`);
  }
}

export function buildOrderBy(entity, sort) {
  if (!sort) return 'created_date DESC, id DESC';
  const dir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const field = sort.replace(/^-/, '');
  if (!FIELD_RE.test(field)) throw new QErr('Ogiltig sortering');
  if (COLS.has(field)) return `${field} ${dir}, id ${dir}`;
  if (entity.fields.includes(field)) return `(${jsonbPath(field)})::text ${dir} COLLATE "C", id ${dir}`;
  throw new QErr(`Okänd sortering: ${field}`);
}

export function buildSelectFields(entity, fields) {
  // Vi hämtar alltid hela raden; fields-filtrering sker i appen (låg kostnad).
  return '*';
}

export function flatten(row) {
  if (!row) return null;
  const d = row.data || {};
  return { ...d, id: row.id, created_date: row.created_date, updated_date: row.updated_date, created_by_id: row.created_by_id, clinic_id: row.clinic_id ?? d.clinic_id ?? '' };
}

export { QErr };