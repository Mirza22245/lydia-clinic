import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { ensureSchema } from './db/schema.js';
import { authRouter } from './auth/routes.js';
import { entityRouter } from './entities/routes.js';
import { functionsRouter } from './runtime/functions.js';
import { filesRouter } from './routes/files.js';
import { googleRouter } from './routes/google.js';
import { apiLimiter, authLimiter, publicLimiter } from './lib/rateLimit.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://api.stripe.com'],
      frameSrc: ["'self'", 'https://js.stripe.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Raw body för functions (Stripe webhook behöver raw body).
app.use('/api/functions', (req, res, next) => {
  express.raw({ type: '*/*', limit: '2mb' })(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Ogiltig body' });
    next();
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/entities', apiLimiter, entityRouter);
app.use('/api/files', apiLimiter, filesRouter);
app.use('/api/google', googleRouter);
app.use('/api/functions', functionsRouter);

app.use((req, res) => res.status(404).json({ error: 'Hittades inte' }));
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internt serverfel' });
});

ensureSchema().then(() => {
  app.listen(config.port, '127.0.0.1', () => console.log(`Lydia backend på 127.0.0.1:${config.port}`));
}).catch((e) => {
  console.error('Kunde inte starta — schemafel?', e);
  process.exit(1);
});