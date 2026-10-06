import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '../../dist');
import { authRouter } from './auth/routes.js';
import { entityRouter } from './entities/routes.js';
import { functionsRouter } from './runtime/functions.js';
import { filesRouter } from './routes/files.js';
import { googleRouter } from './routes/google.js';
import { publicBookingRouter } from './routes/publicBooking.js';
import { apiLimiter, authLimiter } from './lib/rateLimit.js';
import { csrfGuard } from './lib/csrf.js';

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

const app = express();
app.disable('x-powered-by');
// Antal proxy-hopp framför Node (host-nginx + container-nginx = 2). Styr req.ip för rate-limits.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
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
app.listen(config.port, config.host, () => console.log(`Lydia backend på ${config.host}:${config.port}`));