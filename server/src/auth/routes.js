import { Router } from 'express';
import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { safeRouter } from '../lib/safeRouter.js';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSession, setSessionCookie, clearSessionCookie, loadUser } from './session.js';
import { config } from '../config.js';
import { sendMail } from '../lib/email.js';
import { audit } from '../lib/audit.js';

export const authRouter = safeRouter(Router());

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function genOtp() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

// Skapar och mejlar en ny verifieringskod. Högst en kod per minut och konto: begränsar både
// mejlspam och gissning (varje ny kod nollställer försöksräknaren).
async function issueVerifyCode(userId, email) {
  const recent = await pool.query("SELECT 1 FROM auth_codes WHERE user_id = $1 AND kind = 'verify' AND created_date > NOW() - INTERVAL '60 seconds' LIMIT 1", [userId]);
  if (recent.rows.length) return;
  const code = genOtp();
  const inserted = await pool.query('INSERT INTO auth_codes (user_id, code_hash, kind, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'15 minutes\') RETURNING id', [userId, hashShort(code + userId), 'verify']);
  try {
    await sendMail({ to: email, template_name: 'EmailVerification', variables: { first_name: '', app_name: 'Lydia', otp_code: code } });
  } catch (e) {
    await pool.query('DELETE FROM auth_codes WHERE id = $1', [inserted.rows[0].id]).catch(() => {});
    throw new Error('Verifieringsmejl kunde inte skickas. Kontrollera e-postkonfigurationen.');
  }
}
function genToken() {
  return randomBytes(32).toString('base64url');
}

function signGoogleState() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', config.jwtSecret).update(payload).digest('base64url')}`;
}
function validGoogleState(state) {
  try {
    const [payload, sig] = String(state).split('.');
    if (!payload || !sig) return false;
    const expected = createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch { return false; }
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
  await issueVerifyCode(userId, email);
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
  // Okänd e-post eller redan verifierad: gör inget men svara lika (ingen kontoläcka).
  if (u && !u.email_verified) await issueVerifyCode(u.id, email);
  res.json({ ok: true });
});

authRouter.get('/google/start', async (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) return res.status(503).send('Google-inloggning är inte konfigurerad.');
  const state = signGoogleState();
  const callback = `${config.appBaseUrl}/api/auth/google/callback`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: config.google.clientId, redirect_uri: callback, response_type: 'code',
    scope: 'openid email profile', state, access_type: 'online', prompt: 'select_account',
  });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) return res.status(400).send('Ogiltig Google-inloggning.');
    if (!validGoogleState(state)) return res.status(400).send('Google-inloggningen har löpt ut. Försök igen.');
    const callback = `${config.appBaseUrl}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: callback, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.status(400).send('Google-inloggning misslyckades.');
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const info = await infoRes.json();
    const email = String(info.email || '').toLowerCase().trim();
    if (!info.email_verified || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(403).send('Google-kontot har ingen verifierad e-postadress.');
    let u = (await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
    if (!u) {
      const placeholder = await hashPassword(genToken());
      u = (await pool.query("INSERT INTO users (email,password_hash,role,email_verified,token_version,full_name) VALUES ($1,$2,'user',true,0,$3) RETURNING *", [email, placeholder, String(info.name || '').slice(0,100)])).rows[0];
    } else if (!u.email_verified) {
      u = (await pool.query('UPDATE users SET email_verified = true, failed_login = 0 WHERE id = $1 RETURNING *', [u.id])).rows[0];
    }
    setSessionCookie(res, signSession(u, u.token_version));
    res.redirect('/portal');
  } catch (e) {
    console.error('google auth:', e);
    res.status(500).send('Google-inloggningen kunde inte slutföras.');
  }
});

authRouter.post('/admin/staff-invite', async (req, res) => {
  const admin = await loadUser(req);
  if (!admin || admin.role !== 'admin') return fail(res, 403, 'Endast administratör kan bjuda in personal.');
  const email = String(req.body?.email || '').toLowerCase().trim();
  const staffRole = String(req.body?.staff_role || 'behandlare').trim();
  const fullName = String(req.body?.name || '').trim().slice(0, 100);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Ogiltig e-post');
  if (!['administratör','behandlare','reception',''].includes(staffRole)) return fail(res, 400, 'Ogiltig personalroll');
  const existing = (await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email])).rows[0];
  if (existing && existing.clinic_id && admin.clinic_id && existing.clinic_id !== admin.clinic_id) return fail(res, 403, 'Användaren tillhör en annan klinik.');
  let u = existing;
  if (u?.email_verified) {
    if (staffRole) {
      u = (await pool.query("UPDATE users SET clinic_id=COALESCE($1,clinic_id),staff_role=$2,full_name=COALESCE(NULLIF($3,''),full_name) WHERE id=$4 RETURNING *", [admin.clinic_id || null, staffRole, fullName, u.id])).rows[0];
    } else {
      u = (await pool.query("UPDATE users SET staff_role='' WHERE id=$1 RETURNING *", [u.id])).rows[0];
    }
    return res.json({ ok: true, invited: false, existing: true });
  }
  if (!u) {
    const placeholder = await hashPassword(genToken());
    u = (await pool.query("INSERT INTO users (email,password_hash,role,email_verified,token_version,clinic_id,staff_role,full_name) VALUES ($1,$2,'user',false,0,$3,$4,$5) RETURNING *", [email, placeholder, admin.clinic_id || null, staffRole, fullName])).rows[0];
  } else {
    u = (await pool.query("UPDATE users SET clinic_id=COALESCE($1,clinic_id),staff_role=$2,full_name=COALESCE(NULLIF($3,''),full_name) WHERE id=$4 RETURNING *", [admin.clinic_id || null, staffRole, fullName, u.id])).rows[0];
  }
  if (!staffRole) return res.json({ ok: true, invited: false });
  const invite = genToken();
  await pool.query("INSERT INTO auth_codes (user_id,code_hash,kind,expires_at) VALUES ($1,$2,'staff_invite',NOW()+INTERVAL '48 hours')", [u.id, hashShort(invite)]);
  const actionUrl = `${config.appBaseUrl}/accept-invite?token=${encodeURIComponent(invite)}`;
  await sendMail({
    to: email, subject: 'Du har blivit inbjuden till Lydia',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto"><h2>Välkommen till Lydia</h2><p>Du har bjudits in som ${staffRole} på Lydia.</p><p><a href="${actionUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Aktivera ditt konto</a></p><p>Länken gäller i 48 timmar.</p></div>`,
    text: `Välkommen till Lydia. Aktivera ditt konto: ${actionUrl}`,
  });
  res.json({ ok: true, invited: true });
});

authRouter.post('/accept-invite', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 8) return fail(res, 400, 'Lösenordet måste vara minst 8 tecken.');
  const c = (await pool.query("SELECT id,user_id,expires_at FROM auth_codes WHERE code_hash=$1 AND kind='staff_invite' ORDER BY created_date DESC LIMIT 1", [hashShort(token)])).rows[0];
  if (!c || new Date(c.expires_at) < new Date()) return fail(res, 400, 'Inbjudan är ogiltig eller har löpt ut.');
  const hash = await hashPassword(password);
  const u = (await pool.query("UPDATE users SET password_hash=$1,email_verified=true,failed_login=0,lockout_until=NULL,token_version=token_version+1 WHERE id=$2 RETURNING *", [hash,c.user_id])).rows[0];
  await pool.query('DELETE FROM auth_codes WHERE id=$1', [c.id]);
  setSessionCookie(res, signSession(u, u.token_version));
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
    try { await sendMail({ to: email, template_name: 'PasswordReset', variables: { action_url: `${config.appBaseUrl}/reset-password?token=${token}`, app_name: 'Lydia' } }); } catch (e) { console.error('reset mail:', e.message); }
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