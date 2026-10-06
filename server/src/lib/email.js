// E-post-abstraktion — ersätter Base44 SendEmail.
// Stödjer SMTP (Nodemailer) och MJML-mallar från base44/emails/.
// På Hostinger: använd SMTP eller Resend/SendGrid via .env.
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

// Laddar och renderar en MJML/HTML-mall med variabel-ersättning.
// Mallar ligger i base44/emails/<Name>.html (portabla — flyttas till server/emails/).
function renderTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, "../../emails", templateName + ".html");
  let html = fs.readFileSync(templatePath, "utf-8");

  // Ersätt {{variable}} med värden
  for (const [key, val] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), val || "");
  }

  // Extrahera titel från <mj-title> eller <title>
  const titleMatch = html.match(/<mj-title>(.*?)<\/mj-title>/) || html.match(/<title>(.*?)<\/title>/);
  const subject = titleMatch ? titleMatch[1] : "Lydia";

  // För produktion: kompilera MJML till HTML här. Under migrering används raw HTML.
  return { html, subject };
}

export async function sendEmail({ to, template_name, variables, subject, body, attachments }) {
  try {
    const transporter = getTransporter();
    let emailSubject = subject;
    let emailHtml = body;

    if (template_name) {
      const rendered = renderTemplate(template_name, variables);
      emailSubject = emailSubject || rendered.subject;
      emailHtml = rendered.html;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "noreply@lydiaestetisk.se",
      to,
      subject: emailSubject,
      html: emailHtml,
      attachments: attachments?.map((a) => ({ filename: a.filename, path: a.file_url })),
    });

    return { success: true };
  } catch (error) {
    console.error("Email send failed:", error.message);
    return { success: false, error: error.message };
  }
}