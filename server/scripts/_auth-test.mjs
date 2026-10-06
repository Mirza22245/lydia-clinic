import { authRouter } from '/app/server/src/auth/routes.js';
import { pool } from '/app/server/src/db/pool.js';

const R = globalThis.__ROUTES;
globalThis.__MAILS = [];
let pass = 0;
const fails = [];
const check = (n, ok, d = '') => { if (ok) pass++; else { fails.push(n + ' ' + d); console.log('  FEL', n, d); } };

async function hit(method, path, { body, cookie } = {}) {
  const handlers = R[method + ' ' + path];
  if (!handlers) throw new Error('ingen route ' + method + ' ' + path);
  return new Promise(async (resolve) => {
    const out = { status: 200, body: null, cookies: [] };
    const req = { body, headers: cookie ? { cookie } : {}, ip: '9.9.9.9', query: {}, get: () => undefined };
    const res = {
      status(c) { out.status = c; return res; },
      json(b) { out.body = b; resolve(out); return res; },
      cookie(n, v) { out.cookies.push([n, v]); return res; },
      clearCookie() { return res; },
    };
    try {
      for (const h of handlers) await h(req, res, (e) => { if (e) { out.status = 500; out.err = e?.message; } resolve(out); });
    } catch (e) { out.status = 500; out.err = e.message; resolve(out); }
    setTimeout(() => resolve(out), 4000);
  });
}

const email = 'auth-' + Date.now() + '@example.test';
const pw = 'Abcdef123!x';

let r = await hit('post', '/register', { body: { email, password: pw } });
check('registrering ger ok', r.status === 200 && r.body?.ok, JSON.stringify(r).slice(0, 120));

const mail1 = globalThis.__MAILS.at(-1);
const code = (mail1?.html || '').match(/>\s*(\d{6})\s*</)?.[1];
check('verifieringsmejl skickas med 6-siffrig kod (mall finns)', !!code && /verifieringskod/i.test(mail1?.subject || ''), mail1?.subject || '(ämne saknas)');

r = await hit('post', '/resend-otp', { body: { email: 'finns-inte-' + Date.now() + '@example.test' } });
check('resend-otp för okänd e-post kraschar inte (tidigare processkrasch)', r.status === 200 && r.body?.ok, JSON.stringify(r).slice(0, 120));

const n = globalThis.__MAILS.length;
r = await hit('post', '/resend-otp', { body: { email } });
check('resend inom 60 s ger ingen ny kod (spärr)', r.status === 200 && globalThis.__MAILS.length === n);

r = await hit('post', '/login', { body: { email, password: pw } });
check('inloggning nekas innan e-post verifierats', r.status === 403, String(r.status));

r = await hit('post', '/verify-otp', { body: { email, otpCode: code === '000000' ? '111111' : '000000' } });
check('fel kod nekas', r.status === 400, String(r.status));

r = await hit('post', '/verify-otp', { body: { email, otpCode: code } });
const sess = r.cookies.find((c) => c[0] === 'lydia_session')?.[1];
check('rätt kod verifierar och ger session', r.status === 200 && !!sess, JSON.stringify(r).slice(0, 150));

r = await hit('get', '/me', { cookie: 'lydia_session=' + sess });
check('/me med session ger användaren utan klinik/roll', r.status === 200 && r.body?.email === email && r.body?.role === 'user' && !r.body?.clinic_id, JSON.stringify(r.body).slice(0, 120));

r = await hit('get', '/me', { cookie: 'lydia_session=' + sess.slice(0, -3) + 'abc' });
check('manipulerad session nekas', r.status === 401, String(r.status));

r = await hit('post', '/register', { body: { email, password: 'Annat-losen-123' } });
check('omregistrering av verifierat konto svarar ok utan att ändra lösenord', r.status === 200);
check('...och gamla lösenordet fungerar fortfarande', (await hit('post', '/login', { body: { email, password: pw } })).status === 200);

r = await hit('post', '/forgot-password', { body: { email } });
const rm = globalThis.__MAILS.at(-1);
const token = (rm?.html || '').match(/token=([A-Za-z0-9_-]+)/)?.[1];
check('återställningsmejl skickas med länk (mall finns)', r.status === 200 && !!token, rm?.subject || '(ämne saknas)');

r = await hit('post', '/reset-password', { body: { resetToken: token, newPassword: 'Nytt-losen-456!' } });
check('återställning med giltig token', r.status === 200, String(r.status));

r = await hit('post', '/reset-password', { body: { resetToken: token, newPassword: 'Nytt-losen-789!' } });
check('token kan inte återanvändas', r.status === 400, String(r.status));

check('gamla lösenordet fungerar inte efter återställning', (await hit('post', '/login', { body: { email, password: pw } })).status === 401);
check('gamla sessionen ogiltigförklaras efter återställning', (await hit('get', '/me', { cookie: 'lydia_session=' + sess })).status === 401);

for (let i = 0; i < 5; i++) await hit('post', '/login', { body: { email, password: 'fel-' + i } });
r = await hit('post', '/login', { body: { email, password: 'Nytt-losen-456!' } });
check('kontot låses efter 5 felförsök', r.status === 429, String(r.status));

await pool.query('DELETE FROM users WHERE email = $1', [email]);
console.log(pass + ' godkända, ' + fails.length + ' fel');
process.exit(fails.length ? 1 : 0);