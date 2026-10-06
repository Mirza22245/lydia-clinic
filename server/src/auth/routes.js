import { Router } from 'express';
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSession, setSessionCookie, clearSessionCookie, loadUser } from './session.js';
import { config } from '../config.js';
import { sendMail } from '../lib/email.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function genOtp() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}
function genToken() {
  return randomBytes32().toString('base64url');
}
function randomBytes32() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Buffer.from(b);
}

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Ogiltig e-post');
  if (password.length < 8) return fail(res, 400, 'Lösenordet måste vara minst 8 tecken');
  const existing = await pool.query('SELECT id, email_verified FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows[0]?.email_verified) {
    // Läcka-skydd: svara alltid ok.
    return res.json({ ok: true });
  }
  let userId = existing.rows[0]?.id;
  if (!userId) {
    const hash = await hashPassword(password);
    const ins = await pool.query('INSERT INTO users (email, password_hash, role, email_verified, token_version) VALUES ($1, $2, $3, false, 0) RETURNING id', [email, hash, 'user']);
    userId = ins.rows[0].id;
  } else {
    const hash = await hashPassword(password);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  }
  const code = genOtp();
  await pool.query('INSERT INTO auth_codes (user_id, code_hash, kind, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'15 minutes\')', [userId, hashShort(code + userId), 'verify']);
  try {
    await sendMail({ to: email, template_name: 'EmailVerification', variables: { first_name: '', app_name: 'Lydia', otp_code: code } });
  } catch (e) { console.error('verify mail:', e.message); }
  res.json({ ok: true });
});

authRouter.post('/verify-otp', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const otpCode = String(req.body?.otpCode || '').trim();
  const u = (await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
  if (!u) return fail(res, 400, 'Ogiltig kod');
  const code = (await pool.query('SELECT id, code_hash, attempts, expires_at FROM auth_codes WHERE user_id = $1 AND kind = $2 ORDER BY created_date DESC LIMIT 1', [u.id, 'verify'])).rows[0];
  if (!code) return fail(res, 400, 'Ogiltig kod');
  if (code.attempts >= 5) return fail(res, 429, 'För många försök');
  if (new Date(code.expires_at) < new Date()) return fail(res, 400, 'Koden har löpt ut');
  if (code.code_hash !== hashShort(otpCode + u.id)) {
    await pool.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [code.id]);
    return fail(res, 400, 'Ogiltig kod');
  }
  await pool.query('UPDATE users SET email_verified = true, failed_login = 0 WHERE id = $1', [u.id]);
  await pool.query('DELETE FROM auth_codes WHERE id = $1', [code.id]);
  const user = (await pool.query('SELECT id, email, role, full_name, clinic_id, staff_role, token_version FROM users WHERE id = $1', [u.id])).rows[0];
  const token = signSession(user, user.token_version);
  setSessionCookie(res, token);
  res.json({ access_token: token });
});

authRouter.post('/resend-otp', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const u = (await pool.query('SELECT id, email_verified FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
  if (!u?.email_verified) {
    const code = genOtp();
    await pool.query('INSERT INTO auth_codes (user_id, code_hash, kind, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'15 minutes\')', [u?.id, hashShort(code + u?.id), 'verify']);
    try { await sendMail({ to: email, template_name: 'EmailVerification', variables: { first_name: '', app_name: 'Lydia', otp_code: code } }); } catch {}
  }
  res.json({ ok: true });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const u = (await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
  if (!u) { await verifyPassword(password, 'lydia_scrypt$16384/8/1$AA==$AA=='); return fail(res, 401, 'Ogiltig e-post eller lösenord'); }
  if (u.lockout_until && new Date(u.lockout_until) > new Date()) return fail(res, 429, 'Kontot tillfälligt låst. Försök senare.');
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) {
    const failed = (u.failed_login || 0) + 1;
    const lock = failed >= 5 ? ', lockout_until = NOW() + INTERVAL \'15 minutes\'' : '';
    await pool.query(`UPDATE users SET failed_login = $1${lock} WHERE id = $2`, [failed, u.id]);
    return fail(res, 401, 'Ogiltig e-post eller lösenord');
  }
  if (!u.email_verified) return fail(res, 403, 'E-post inte verifierad. Kontrollera din inkorg.');
  await pool.query('UPDATE users SET failed_login = 0, lockout_until = NULL WHERE id = $1', [u.id]);
  const token = signSession(u, u.token_version);
  setSessionCookie(res, token);
  try { await audit({ event_type: 'login', entity_type: 'User', entity_id: u.id, description: 'Inloggning', clinic_id: u.clinic_id || '' }, u); } catch {}
  res.json({ access_token: token });
});

authRouter.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const u = (await pool.query('SELECT id, email_verified FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
  if (u?.email_verified) {
    const token = genToken();
    await pool.query('INSERT INTO auth_codes (user_id, code_hash, kind, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'1 hour\')', [u.id, hashShort(token), 'reset']);
    try { await sendMail({ to: email, template_name: 'PasswordReset', variables: { action_url: `${config.appBaseUrl}/reset-password?token=${token}` } }); } catch (e) { console.error('reset mail:', e.message); }
  }
  res.json({ ok: true });
});

authRouter.post('/reset-password', async (req, res) => {
  const resetToken = String(req.body?.resetToken || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 8) return fail(res, 400, 'Lösenordet måste vara minst 8 tecken');
  const c = (await pool.query('SELECT id, user_id, expires_at FROM auth_codes WHERE code_hash = $1 AND kind = $2 ORDER BY created_date DESC LIMIT 1', [hashShort(resetToken), 'reset'])).rows[0];
  if (!c || new Date(c.expires_at) < new Date()) return fail(res, 400, 'Ogiltig eller utgången länk');
  const hash = await hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = $1, token_version = token_version + 1, failed_login = 0, lockout_until = NULL WHERE id = $2', [hash, c.user_id]);
  await pool.query('DELETE FROM auth_codes WHERE id = $1', [c.id]);
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(user);
});

authRouter.patch('/me', async (req, res) => {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const allowed = {};
  if (typeof req.body?.full_name === 'string') allowed.full_name = req.body.full_name.slice(0, 100);
  if (!Object.keys(allowed).length) return fail(res, 400, 'Inga uppdateringsbara fält');
  await pool.query('UPDATE users SET full_name = $1 WHERE id = $2', [allowed.full_name, user.id]);
  res.json({ ...user, ...allowed });
});

function hashShort(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}
function randomBytes32() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Buffer.from(b);
}
function genOtp() { return String(Math.floor(Math.random() * 1000000)).padStart(6, '0'); }
function genToken() { return randomBytes32().toString('base64url'); }