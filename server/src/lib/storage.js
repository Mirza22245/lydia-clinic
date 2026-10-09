import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { config } from '../config.js';

export const LYDA_SCHEME = 'lydia://';

const MIME = [
  { sig: [0xff, 0xd8, 0xff], mime: 'image/jpeg', ext: 'jpg' },
  { sig: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png', ext: 'png' },
  { sig: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', ext: 'pdf' },
  { sig: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp', ext: 'webp' },
];
const ALLOWED = new Set(['image/jpeg', 'image/png', 'application/pdf', 'image/webp']);

export function sniffMime(buf) {
  for (const m of MIME) {
    if (m.sig.every((b, i) => buf[i] === b)) return m;
  }
  return null;
}

export function validateMime(buf) {
  const m = sniffMime(buf);
  if (!m || !ALLOWED.has(m.mime)) {
    const err = new Error('Ogiltig filtyp. Tillåtet: jpg, png, pdf, webp.'); err.status = 400; throw err;
  }
  return m;
}

export function saveFile({ buffer, clinicId, ext }) {
  const dir = join(config.storage.dir, clinicId || '_global');
  mkdirSync(dir, { recursive: true });
  const id = randomBytes(16).toString('hex');
  const filename = `${id}.${ext}`;
  const full = join(dir, filename);
  writeFileSync(full, buffer);
  return `${LYDA_SCHEME}${clinicId || '_global'}/${filename}`;
}

export function resolvePath(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(LYDA_SCHEME)) return null;
  const rel = uri.slice(LYDA_SCHEME.length);
  // Only accept server-generated opaque file names under a single clinic folder.
  // This blocks traversal, encoded separators, absolute paths and arbitrary filenames.
  if (!/^[A-Za-z0-9_-]+\/[a-f0-9]{32}\.(?:jpg|png|pdf|webp)$/.test(rel)) return null;
  const root = resolve(config.storage.dir);
  const full = resolve(root, rel);
  const fromRoot = relative(root, full);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || resolve(root, fromRoot) !== full) return null;
  return full;
}

export function signFileUri(uri, opts = {}) {
  const exp = Math.floor((Date.now() + (opts.expiresIn || 300) * 1000) / 1000);
  const sig = createHmac('sha256', config.fileSigningSecret).update(`${uri}|${exp}`).digest('hex');
  const token = Buffer.from(JSON.stringify({ uri, exp, sig })).toString('base64url');
  return `/api/files/get?token=${token}`;
}

export function verifyFileToken(token) {
  try {
    const { uri, exp, sig } = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (exp < Math.floor(Date.now() / 1000)) return null;
    const expected = createHmac('sha256', config.fileSigningSecret).update(`${uri}|${exp}`).digest('hex');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return uri;
  } catch { return null; }
}