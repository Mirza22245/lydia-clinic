import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from '../auth/session.js';
import { bindContext, createClientFromRequest } from './sdk-shim.js';
import { audit } from '../lib/audit.js';
import { heavyLimiter, publicLimiter } from '../lib/rateLimit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILED = join(__dirname, '../../.compiled-functions');

export const functionsRouter = Router();

const PUBLIC_FUNCS = new Set(['getPublicBookingData', 'getAvailableSlots', 'createPublicBooking', 'getStripeConfig', 'stripeWebhook']);
const HEAVY_FUNCS = new Set(['createPublicBooking', 'sendSms', 'verifyBankid', 'exportPatientData']);

functionsRouter.use('/_internal/reminder', heavyLimiter);

functionsRouter.all('/:name', async (req, res) => {
  const name = req.params.name;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return res.status(400).json({ error: 'Ogiltigt funktionsnamn' });
  const isPublic = PUBLIC_FUNCS.has(name);
  let user = null;
  try {
    user = await loadUser(req);
  } catch { user = null; }
  if (!isPublic && !user) return res.status(401).json({ error: 'Unauthorized' });
  bindContext(req, user, req.ip);

  let mod;
  try {
    mod = await import(join(COMPILED, `${name}.mjs`));
  } catch (e) {
    console.error(`[functions] kunde inte ladda ${name}:`, e.message);
    return res.status(404).json({ error: `Funktion '${name}' finns inte` });
  }

  // Bygg en Fetch Request med raw body + relevanta headers.
  const url = `${req.protocol}://${req.get('host') || 'localhost'}${req.originalUrl}`;
  const headers = new Headers();
  const passHeaders = ['content-type', 'stripe-signature', 'user-agent', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'host', 'cookie'];
  for (const h of passHeaders) { const v = req.get(h); if (v) headers.set(h, v); }
  const body = (req.body && req.body.length) ? req.body : undefined;
  const request = new Request(url, { method: req.method, headers, body });

  try {
    const result = await mod.default(request);
    if (result instanceof Response) {
      const text = await result.text();
      res.status(result.status || 200);
      result.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k.toLowerCase())) res.setHeader(k, v); });
      res.send(text);
    } else {
      res.status(200).json(result);
    }
  } catch (e) {
    console.error(`[functions] ${name} fel:`, e);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});