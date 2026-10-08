import { Router } from 'express';
import { safeRouter } from '../lib/safeRouter.js';
import { loadUser } from '../auth/session.js';
import { config } from '../config.js';
import { sendMail } from '../lib/email.js';

export const integrationsRouter = safeRouter(Router());

async function requireStaff(req, res) {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!user.staff_role && user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

integrationsRouter.get('/email/status', async (req, res) => {
  const user = await requireStaff(req, res);
  if (!user) return;

  const configured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
  res.json({
    configured,
    provider: 'gmail-smtp',
    host: config.smtp.host || null,
    user: config.smtp.user || null,
    from_email: config.smtp.fromEmail || config.smtp.user || null,
  });
});

integrationsRouter.post('/email/test', async (req, res) => {
  const user = await requireStaff(req, res);
  if (!user) return;

  const recipient = config.smtp.fromEmail || config.smtp.user;
  if (!recipient) return res.status(503).json({ error: 'E-postadress saknas i SMTP_FROM_EMAIL/SMTP_USER' });

  try {
    await sendMail({
      to: recipient,
      subject: 'Lydia – test av e-post',
      text: 'Detta är ett testmeddelande från Lydia. E-postintegrationen fungerar.',
      html: '<p>Detta är ett testmeddelande från <strong>Lydia</strong>.</p><p>E-postintegrationen fungerar.</p>',
    });
    res.json({ ok: true, sent_to: recipient });
  } catch (error) {
    console.error('[email-test]', error);
    res.status(503).json({ error: error?.message || 'Kunde inte skicka testmeddelande' });
  }
});
