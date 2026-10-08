import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { seedLuxeCatalog } from './db/luxeCatalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '../../dist');
import { authRouter } from './auth/routes.js';
import { entityRouter } from './entities/routes.js';
import { functionsRouter } from './runtime/functions.js';
import { filesRouter } from './routes/files.js';
import { googleRouter } from './routes/google.js';
import { publicBookingRouter } from './routes/publicBooking.js';
import { getAvailableSlotsNative } from './routes/nativeAvailability.js';
import { createPublicBookingNative } from './routes/nativePublicBooking.js';
import { apiLimiter, authLimiter, publicLimiter } from './lib/rateLimit.js';
import { csrfGuard } from './lib/csrf.js';
import { hashPassword } from './auth/password.js';

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

async function bootstrapAdminFromEnv() {
  const email = String(process.env.LYDIA_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.LYDIA_ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!email || !password) return;
  if (password.length < 12) throw new Error('LYDIA_ADMIN_BOOTSTRAP_PASSWORD måste vara minst 12 tecken');
  const clinicId = process.env.LYDIA_CLINIC_ID || 'lydia-estetisk';
  const clinicName = process.env.LYDIA_CLINIC_NAME || 'Lydia Estetisk';
  await pool.query(
    'INSERT INTO e_clinic (id, data, clinic_id) VALUES ($1, $2::jsonb, $1) ON CONFLICT (id) DO NOTHING',
    [clinicId, JSON.stringify({ name: clinicName, clinic_id: clinicId })]
  );
  const hash = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name, clinic_id, staff_role, email_verified)
     VALUES ($1, $2, 'admin', $3, $4, 'administratör', true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, hash, process.env.LYDIA_ADMIN_NAME || 'Admin', clinicId]
  );
  if (!result.rowCount) {
    console.log('[admin-bootstrap] Befintligt adminkonto lämnas orört:', email);
    return;
  }
  console.log('[admin-bootstrap] Admin skapad/uppdaterad:', email);
}


const app = express();
app.disable('x-powered-by');
// Antal proxy-hopp framför Node (host-nginx + container-nginx = 2). Styr req.ip för rate-limits.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", "https://api.stripe.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());

// Rå body FÖRST för funktioner: Stripe-signaturen kräver exakta bytes och
// funktionerna läser själva body via Request.json(). Måste ligga före express.json.
app.use('/api/functions', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api', csrfGuard);

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/entities', apiLimiter, entityRouter);
app.use('/api/files', apiLimiter, filesRouter);
app.use('/api/google', googleRouter);
app.use('/api/public-booking-data', publicBookingRouter);
app.post('/api/public-booking', publicLimiter, async (req, res) => {
  try {
    const data = await createPublicBookingNative(req.body || {}, req);
    res.status(200).json(data);
  } catch (e) {
    console.error('[public-booking]', e);
    res.status(e?.status || 500).json({ error: e?.message || 'Internt serverfel' });
  }
});
app.post('/api/availability', publicLimiter, async (req, res) => {
  try {
    const data = await getAvailableSlotsNative(req.body || {});
    res.status(200).json(data);
  } catch (e) {
    console.error('[availability]', e);
    res.status(e?.status || 500).json({ error: e?.message || 'Internt serverfel', slots: [] });
  }
});
app.use('/api/functions', functionsRouter);

// Statisk frontend + SPA-fallback för Hostinger Cloud (enkel Node-app utan nginx).
// API-rutter (/api/*) hanteras ovan; allt annat som inte är en fil → index.html.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(join(DIST_DIR, 'index.html'), (err) => err && next());
  });
}

app.use((req, res) => res.status(404).json({ error: 'Hittades inte' }));
app.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status >= 500) console.error('[unhandled]', err);
  res.status(status).json({ error: status >= 500 ? 'Internt serverfel' : 'Ogiltig förfrågan' });
});

// Schemat skapas av `npm run migrate` (ägar-rollen). Appen kör som lydia_app (endast DML).
// Starta HTTP-servern först. Katalogsynken får aldrig blockera Hostingers startup.
const server = app.listen(config.port, config.host, () => {
  console.log(`Lydia backend på ${config.host}:${config.port}`);
  setImmediate(async () => {
    try { await bootstrapAdminFromEnv(); } catch (e) { console.error('[admin-bootstrap]', e.message); }
  });
  setImmediate(async () => {
    try {
      const count = await seedLuxeCatalog(pool);
      console.log(`Luxe-katalog synkad: ${count} behandlingar`);
    } catch (e) {
      console.error('[catalog-sync]', e.message);
    }
  });
});
server.on('error', (err) => {
  console.error('[startup]', err);
  process.exit(1);
});