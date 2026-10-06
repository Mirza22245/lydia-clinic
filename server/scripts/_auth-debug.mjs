
import { authRouter } from '/app/server/src/auth/routes.js';
import { pool } from '/app/server/src/db/pool.js';
const R = globalThis.__ROUTES; globalThis.__MAILS = [];
async function hit(method, path, { body, cookie } = {}) {
  const handlers = R[method + ' ' + path];
  return new Promise(async (resolve) => {
    const out = { status: 200, body: null, cookies: [] };
    const req = { body, headers: cookie ? { cookie } : {}, ip: '9.9.9.9', query: {}, get: () => undefined };
    const res = { status(c){ out.status=c; return res; }, json(b){ out.body=b; resolve(out); return res; }, cookie(n,v){ out.cookies.push([n,v]); return res; }, clearCookie(){ return res; } };
    try { for (const h of handlers) await h(req, res, (e)=>{ if(e){out.status=500; out.err=e?.message;} resolve(out); }); } catch(e){ out.status=500; out.err=e.message; resolve(out); }
    setTimeout(()=>resolve(out), 3000);
  });
}
const email = 'dbg-' + Date.now() + '@example.test', pw = 'Abcdef123!x';
await hit('post', '/register', { body: { email, password: pw } });
const code = (globalThis.__MAILS.at(-1)?.html || '').match(/>\s*(\d{6})\s*</)?.[1];
let r = await hit('post', '/verify-otp', { body: { email, otpCode: code } });
const sess = r.cookies.find(c=>c[0]==='lydia_session')?.[1];
console.log('token len', sess?.length, 'has+/', /[+\/]/.test(sess||''), 'sample', JSON.stringify(sess?.slice(0,20)));
r = await hit('get', '/me', { cookie: 'lydia_session=' + sess });
console.log('/me status', r.status, 'body', JSON.stringify(r.body), 'err', r.err);
const rows = await pool.query('SELECT id, user_id, expires_at FROM sessions WHERE token = $1', [sess]);
console.log('session-rad med rå token:', rows.rows.length);
const rows2 = await pool.query('SELECT id, user_id, expires_at FROM sessions ORDER BY created_at DESC LIMIT 1');
console.log('senaste session-rad:', JSON.stringify(rows2.rows[0]));
await pool.query('DELETE FROM users WHERE email = $1', [email]);
process.exit(0);
