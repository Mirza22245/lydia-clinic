import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { resolveSMSConfig, sendSMS, SMS_TEMPLATES } from "../../shared/sms.ts";
import { recordAudit } from "../../shared/audit.ts";
import { requireStaff } from "../../shared/authz.ts";

// Skickar SMS via konfigurerad provider.
// Kräver secrets: SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET, SMS_SENDER
// Feature flag 'sms' måste vara enabled.
//
// Body: { to, template, template_args } eller { to, message }
// Templates: booking_confirmation, booking_reminder_24h, booking_reminder_2h,
//            booking_cancelled, booking_rescheduled, form_reminder, consent_reminder, follow_up
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Endast inloggad personal får skicka SMS (annars kan vem som helst köra upp SMS-kostnader).
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const { to, template, template_args, message, customer_id, booking_id } = body;

    if (!to) {
      return Response.json({ error: "to krävs" }, { status: 400 });
    }

    const config = resolveSMSConfig((n) => secrets.get(n));
    if (!config) {
      return Response.json(
        { error: "SMS inte konfigurerat. Kontakta administratör." },
        { status: 503 }
      );
    }

    let text = message;
    if (template) {
      const fn = SMS_TEMPLATES[template];
      if (!fn) {
        return Response.json({ error: "Okänd mall: " + template }, { status: 400 });
      }
      text = fn(...(template_args || []));
    }

    if (!text) {
      return Response.json({ error: "Meddelande saknas" }, { status: 400 });
    }
    if (String(text).length > 480) {
      return Response.json({ error: "Meddelandet är för långt (max 480 tecken)" }, { status: 400 });
    }

    const result = await sendSMS(config, to, text);

    const tplName = template || "custom";
    const desc = result.success
      ? "SMS skickat (" + tplName + ")"
      : "SMS misslyckades: " + (result.error || "");

    await recordAudit(base44, {
      event_type: result.success ? "sms_sent" : "sms_failed",
      entity_type: "Customer",
      entity_id: customer_id || "",
      description: desc,
      metadata: {
        to,
        template: tplName,
        booking_id: booking_id || "",
        message_id: result.messageId || "",
        error: result.error || "",
      },
    });

    if (!result.success) {
      return Response.json(result, { status: 502 });
    }

    return Response.json(result);
  } catch (error) {
    console.error("sendSms:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}