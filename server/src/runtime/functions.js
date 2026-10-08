import { Router } from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from '../auth/session.js';
import { bindContext } from './sdk-shim.js';
import { heavyLimiter, publicLimiter } from '../lib/rateLimit.js';
import { getPublicBookingData } from '../routes/publicBooking.js';
import { getAvailableSlotsNative } from '../routes/nativeAvailability.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILED = join(__dirname, '../../.compiled-functions');

export const functionsRouter = Router();

// Funktioner som får anropas utan session. De validerar själva sin indata;
// stripeWebhook kontrollerar Stripe-signaturen och sendDueReminders kräver
// x-cron-secret eller en personal-session (kontrolleras i funktionen).
const PUBLIC_FUNCS = new Set([
  'getPublicBookingData', 'getAvailableSlots', 'createPublicBooking',
  'createPaymentIntent', 'getStripeConfig', 'stripeWebhook', 'sendDueReminders',
]);
// Funktioner som även en inloggad kund (utan personalroll) får anropa. De kontrollerar själva att
// posten tillhör kunden (findCustomerForUser). ALLT annat kräver personalroll: en kund kan aldrig
// nå personalfunktioner som exportPatientData eller signJournalEntry, även om en funktion skulle
// sakna egen behörighetskontroll.
const PATIENT_FUNCS = new Set([
  'getPatientPortalData', 'cancelPatientBooking', 'signPatientConsent', 'submitHealthDeclarationConsent',
  'sendPortalMessage', 'verifyPhone', 'getBookingRequirements', 'rescheduleBooking', 'submitReview',
]);
const HEAVY_FUNCS = new Set(['createPublicBooking', 'sendSms', 'verifyBankid', 'exportPatientData', 'verifyPhone', 'sendPortalMessage']);

functionsRouter.use('/:name', (req, res, next) => {
  if (HEAVY_FUNCS.has(req.params.name)) return heavyLimiter(req, res, next);
  if (PUBLIC_FUNCS.has(req.params.name)) return publicLimiter(req, res, next);
  next();
});

functionsRouter.all('/:name', async (req, res) => {
  const name = req.params.name;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return res.status(400).json({ error: 'Ogiltigt funktionsnamn' });

  let user = null;
  try { user = await loadUser(req); } catch { user = null; }
  if (!PUBLIC_FUNCS.has(name) && !user) return res.status(401).json({ error: 'Unauthorized' });
  const staffUser = !!user && (user.role === 'admin' || !!user.staff_role);
  if (!PUBLIC_FUNCS.has(name) && !PATIENT_FUNCS.has(name) && !staffUser) return res.status(403).json({ error: 'Forbidden' });

  // getPublicBookingData is served directly by the native backend so it never depends on
  // the generated Base44 function bundle or its runtime shim.
  if (name === 'getAvailableSlots') {
    try {
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.length ? JSON.parse(body.toString('utf8')) : {};
      else if (typeof body === 'string') body = body ? JSON.parse(body) : {};
      const data = await getAvailableSlotsNative(body || {});
      return res.status(200).json(data);
    } catch (e) {
      console.error('[functions] getAvailableSlots native fel:', e);
      return res.status(e?.status || 500).json({ error: e?.message || 'Internt serverfel', slots: [] });
    }
  }

  if (name === 'getPublicBookingData') {
    try {
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.length ? JSON.parse(body.toString('utf8')) : {};
      else if (typeof body === 'string') body = body ? JSON.parse(body) : {};
      const data = await getPublicBookingData(body || {});
      return res.status(200).json(data);
    } catch (e) {
      console.error('[functions] getPublicBookingData fel:', e);
      return res.status(e?.status || 500).json({ error: e?.message || 'Internt serverfel' });
    }
  }

  let mod;
  try {
    mod = await import(join(COMPILED, `${name}.mjs`));
  } catch (e) {
    console.error(`[functions] kunde inte ladda ${name}:`, e.message);
    return res.status(404).json({ error: `Funktion '${name}' finns inte` });
  }

  // Funktionerna får en Fetch-Request och anropar createClientFromRequest(request):
  // användarkontexten måste därför bindas till DEN Request-instansen, inte Express-req.
  const url = `${req.protocol}://${req.get('host') || 'localhost'}${req.originalUrl}`;
  const headers = new Headers();
  for (const h of ['content-type', 'stripe-signature', 'user-agent', 'x-cron-secret', 'x-forwarded-for']) {
    const v = req.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = Buffer.isBuffer(req.body) && req.body.length > 0 && !['GET', 'HEAD'].includes(req.method);
  const request = new Request(url, { method: req.method, headers, body: hasBody ? req.body : undefined });
  bindContext(request, user, req.ip);

  try {
    const result = await mod.default(request);
    if (result instanceof Response) {
      const text = await result.text();
      res.status(result.status || 200);
      result.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k.toLowerCase())) res.setHeader(k, v);
      });
      res.send(text);
    } else {
      res.status(200).json(result);
    }
  } catch (e) {
    console.error(`[functions] ${name} fel:`, e);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});