import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

// Enkel HMAC-SHA256 JWT (inget jose-beroende). Payload: { sub, tv, iat, exp }.
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

export function signSession(user, tokenVersion = 0) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: user.id, tv: tokenVersion, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 12 * 3600,
  }));
  const signing = `${header}.${payload}`;
  const sig = createHmac('sha256', config.jwtSecret).update(signing).digest();
  return `${signing}.${b64url(sig)}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = b64url(createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest());
  const a = Buffer.from(sig); const b = b64urlDecode(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(b64urlDecode(payload).toString());
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

export async function loadUser(req) {
  if (req._lydiaUser !== undefined) return req._lydiaUser;
  const token = readCookie(req, 'lydia_session');
  const payload = verifySession(token);
  if (!payload) { req._lydiaUser = null; return null; }
  const res = await pool.query('SELECT id, email, role, full_name, clinic_id, staff_role, token_version, email_verified FROM users WHERE id = $1', [payload.sub]);
  const u = res.rows[0];
  if (!u || u.token_version !== payload.tv) { req._lydiaUser = null; return null; }
  req._lydiaUser = {
    id: u.id, email: u.email, role: u.role, full_name: u.full_name,
    clinic_id: u.clinic_id || '', staff_role: u.staff_role || '',
    email_verified: u.email_verified,
    data: { clinic_id: u.clinic_id || '', staff_role: u.staff_role || '' },
  };
  req._lydiaUserIp = req.ip;
  return req._lydiaUser;
}

export function setSessionCookie(res, token) {
  const opts = {
    httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/',
    maxAge: 12 * 3600 * 1000,
  };
  if (config.cookieDomain) opts.domain = config.cookieDomain;
  res.cookie('lydia_session', token, opts);
}
export function clearSessionCookie(res) {
  const opts = { httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/' };
  if (config.cookieDomain) opts.domain = config.cookieDomain;
  res.clearCookie('lydia_session', opts);
}

export function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}