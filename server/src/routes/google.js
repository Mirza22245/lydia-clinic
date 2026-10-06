import { Router } from 'express';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { safeRouter } from '../lib/safeRouter.js';
import { loadUser } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';

export const googleRouter = safeRouter(Router());

// OAuth-state signeras (HMAC) och går ut efter 10 min. Utan signatur kunde vem som helst skicka
// en callback med ett godtyckligt användar-id och koppla sitt Google-konto till en annan användare.
function signState(obj) {
  const p = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + 10 * 60000 })).toString('base64url');
  return `${p}.${createHmac('sha256', config.jwtSecret).update(p).digest('base64url')}`;
}
function readState(str) {
  try {
    const [p, s] = String(str).split('.');
    const expected = createHmac('sha256', config.jwtSecret).update(p).digest('base64url');
    if (!s || s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
    const o = JSON.parse(Buffer.from(p, 'base64url').toString());
    return o.exp > Date.now() ? o : null;
  } catch { return null; }
}
const safeReturn = (r) => (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/app/settings');

const ENC_KEY = () => createHash('sha256').update(config.encryptionKey).digest();

function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', ENC_KEY(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0, 12); const tag = buf.slice(12, 28); const enc = buf.slice(28);
  const d = createDecipheriv('aes-256-gcm', ENC_KEY(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export async function getGoogleToken(userId) {
  const res = await pool.query('SELECT access_token_enc, refresh_token_enc, expires_at FROM integration_tokens WHERE user_id = $1 AND provider = $2', [userId, 'google']);
  const r = res.rows[0];
  if (!r) return null;
  if (r.expires_at && new Date(r.expires_at) < new Date(Date.now() + 60000)) {
    return await refreshGoogle(userId, r);
  }
  return { access_token: decrypt(r.access_token_enc), refresh_token: decrypt(r.refresh_token_enc) };
}

async function refreshGoogle(userId, row) {
  const refresh_token = decrypt(row.refresh_token_enc);
  const body = new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, refresh_token, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tok = await r.json();
  if (!tok.access_token) throw new Error('Google refresh misslyckades');
  const exp = new Date(Date.now() + (tok.expires_in || 3600) * 1000);
  await pool.query('UPDATE integration_tokens SET access_token_enc = $1, expires_at = $2 WHERE user_id = $3 AND provider = $4', [encrypt(tok.access_token), exp, userId, 'google']);
  return { access_token: tok.access_token, refresh_token };
}

googleRouter.get('/connect', async (req, res) => {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.staff_role && user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  if (!config.google.clientId) return res.status(503).json({ error: 'Google Calendar inte konfigurerad' });
  const redirect = `${config.appBaseUrl}/api/google/callback`;
  const state = signState({ uid: user.id, ret: safeReturn(req.query.return) });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.google.clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state })}`;
  res.redirect(url);
});

googleRouter.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = readState(req.query.state) || {};
  if (!code || !state.uid) return res.status(400).send('Ogiltig callback');
  const body = new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, code, grant_type: 'authorization_code', redirect_uri: `${config.appBaseUrl}/api/google/callback` });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tok = await r.json();
  if (!tok.access_token) return res.status(400).send('Google token misslyckades');
  const exp = new Date(Date.now() + (tok.expires_in || 3600) * 1000);
  await pool.query(
    `INSERT INTO integration_tokens (user_id, provider, access_token_enc, refresh_token_enc, expires_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, provider) DO UPDATE SET access_token_enc = $3, refresh_token_enc = $4, expires_at = $5`,
    [state.uid, 'google', encrypt(tok.access_token), encrypt(tok.refresh_token || ''), exp]
  );
  try { await audit({ event_type: 'google_calendar_connect', entity_type: 'User', entity_id: state.uid, description: 'Google Calendar ansluten' }, { id: state.uid }); } catch {}
  res.redirect(state.ret || '/app/settings');
});

googleRouter.get('/status', async (req, res) => {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.staff_role && user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const r = await pool.query('SELECT expires_at FROM integration_tokens WHERE user_id = $1 AND provider = $2', [user.id, 'google']);
  res.json({ connected: !!r.rows[0], expires_at: r.rows[0]?.expires_at || null });
});