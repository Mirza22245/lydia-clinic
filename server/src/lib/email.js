import { createTransport } from 'nodemailer';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mjml2html from 'mjml';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '../../../base44/emails');

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) {
    throw new Error('E-post inte konfigurerad. Kontakta administratör.');
  }
  transporter = createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTemplate(templateName, variables = {}) {
  const safe = /^[A-Za-z0-9_]+$/.test(templateName) ? templateName : null;
  if (!safe) throw new Error('Ogiltigt mallnamn');
  const file = join(TEMPLATES_DIR, `${safe}.html`);
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { throw new Error(`E-postmall saknas: ${templateName}`); }
  // Substituera variabler INNAN MJML-kompilering (HTML-escapa värden).
  const filled = raw.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, key) => escapeHtml(variables[key] ?? ''));
  // Systemmejl (EmailVerification, PasswordReset) är färdig HTML; övriga mallar är MJML.
  let html = filled;
  if (/^\s*<mjml/i.test(filled)) {
    const r = mjml2html(filled, { validationLevel: 'soft' });
    html = r.html;
    if (r.errors && r.errors.length) console.error('mjml errors:', r.errors);
  }
  // Ämne från <mj-title> eller <title>.
  const titleMatch = raw.match(/<mj-title>([^<]+)<\/mj-title>|<title>([^<]+)<\/title>/);
  let subject = titleMatch ? (titleMatch[1] || titleMatch[2]) : 'Lydia';
  subject = subject.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, key) => String(variables[key] ?? ''));
  return { html, subject };
}

export async function sendMail({ to, subject, html, text, template_name, variables, from_name, attachments }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Ogiltig mottagare');
  let finalHtml = html;
  let finalSubject = subject;
  let finalText = text;
  if (template_name) {
    const r = renderTemplate(template_name, variables || {});
    finalHtml = r.html;
    if (!finalSubject) finalSubject = r.subject;
  }
  if (!finalSubject) finalSubject = 'Lydia';
  if (finalSubject && /[\r\n]/.test(finalSubject)) throw new Error('Ogiltigt ämne');
  const fromName = from_name || config.smtp.fromName;
  const from = `"${fromName}" <${config.smtp.fromEmail || config.smtp.user}>`;
  const transport = getTransport();
  const info = await transport.sendMail({ from, to: to, subject: finalSubject, html: finalHtml, text: finalText, attachments });
  return { messageId: info.messageId };
}