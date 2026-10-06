// Skydd mot CSRF från andra ursprung. SameSite=Strict räcker inte ensamt: syskondomäner som
// WordPress på lydiaestetisk.se delar "site" med appen. Webbläsare skickar alltid Origin på
// POST/PATCH/DELETE, så ett annat ursprung nekas. Anrop utan Origin (Stripe-webhook, cron, curl)
// är inte webbläsar-CSRF och släpps igenom — de autentiseras av sig själva (signatur/secret/cookie).
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.headers.host) return next();
  } catch { /* ogiltig Origin nekas nedan */ }
  return res.status(403).json({ error: 'Cross-origin request nekad' });
}