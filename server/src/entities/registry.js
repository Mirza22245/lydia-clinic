import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = path.resolve(__dirname, '../../../base44/entities');

// Enkel JSONC-stripper: tar bort // och /* */ kommentarer samt trailing kommatecken.
function stripJsonC(text) {
  let out = '';
  let i = 0;
  let inStr = false;
  let strCh = '';
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += next || ''; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function loadEntity(fileName) {
  const raw = fs.readFileSync(path.join(ENTITIES_DIR, fileName), 'utf8');
  const def = JSON.parse(stripJsonC(raw));
  return def;
}

const files = fs.existsSync(ENTITIES_DIR)
  ? fs.readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc'))
  : [];

// User hanteras separat av users-tabellen — inte en generisk entitet.
const defs = files
  .map((f) => loadEntity(f))
  .filter((d) => d.name && d.name !== 'User');

// camelCase -> snake_case
function toSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
}

export const entities = new Map();
for (const d of defs) {
  const table = `e_${toSnake(d.name)}`;
  const props = d.properties || {};
  const fields = Object.keys(props);
  entities.set(d.name, { name: d.name, table, fields, properties: props, rls: d.rls || {} });
}

export function getEntity(name) {
  const e = entities.get(name);
  if (!e) throw new QueryError(`Okänd entitet: ${name}`, 400);
  return e;
}

export function entityNames() {
  return [...entities.keys()];
}

export class QueryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}