import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { requireStaff } from "../../shared/authz.ts";
import { recordAudit } from "../../shared/audit.ts";
import { resolveSMSConfig, sendSMS, SMS_TEMPLATES } from "../../shared/sms.ts";

// Skickar bokningspåminnelser (e-post 24h, SMS 24h + 2h) för bekräftade bokningar.
// Anropas av intern cron (x-cron-secret) eller av admin. Feature flags 'sms'
// och 'email' styr respektive kanal. Idempotent via reminder_*_sent_at på bokningen.
function envGet(n) {
  try { if (typeof Deno !== "undefined") return Deno.env.get(n); } catch {}
  return (typeof process !== "undefined" && process.env ? process.env[n] : undefined) || undefined;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const cronSecret = req.headers.get("x-cron-secret") || "";
    let authorized = false;
    if (cronSecret && cronSecret === (envGet("CRON_SECRET") || "")) {
      authorized = true;
    } else {
      const user = await base44.auth.me();
      const chk = requireStaff(user);
      if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
      authorized = true;
    }

    const svc = base44.asServiceRole;
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
    const in2h = new Date(now.getTime() + 2 * 3600 * 1000);
    const sent = { email_24h: 0, sms_24h: 0, sms_2h: 0 };

    // 24h: e-post + SMS för bokningar inom 22-26h som inte fått 24h-påminnelse.
    const due24 = await svc.entities.Booking.filter(
      { status: "confirmed", start_time: { $gte: now.toISOString(), $lt: in24h.toISOString() }, reminder_24h_sent_at: { $exists: false } },
      { limit: 200 }
    );
    for (const b of (due24.items || [])) {
      const customer = b.customer_id ? await svc.entities.Customer.get(b.customer_id).catch(() => null) : null;
      const email = customer?.email || "";
      const phone = customer?.phone || "";
      const dateStr = new Date(b.start_time).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long" });
      const timeStr = new Date(b.start_time).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
      if (email) {
        try {
          await svc.integrations.Core.SendEmail({
            to: email,
            template_name: "BookingReminder",
            variables: { customer_name: customer.name || b.customer_name, treatment_name: b.treatment_name || "", staff_name: b.staff_name || "", booking_date: dateStr, booking_time: timeStr },
          });
          sent.email_24h++;
        } catch {}
      }
      const smsConfig = resolveSMSConfig((n) => envGet(n));
      if (phone && smsConfig) {
        try {
          const r = await sendSMS(smsConfig, phone, SMS_TEMPLATES.booking_reminder_24h(dateStr, timeStr));
          if (r.success) sent.sms_24h++;
        } catch {}
      }
      await svc.entities.Booking.update(b.id, { reminder_24h_sent_at: new Date().toISOString() }).catch(() => {});
    }

    // 2h: SMS för bokningar inom 1.5-2.5h som inte fått 2h-påminnelse.
    const due2 = await svc.entities.Booking.filter(
      { status: "confirmed", start_time: { $gte: now.toISOString(), $lt: in2h.toISOString() }, reminder_2h_sent_at: { $exists: false } },
      { limit: 200 }
    );
    for (const b of (due2.items || [])) {
      const customer = b.customer_id ? await svc.entities.Customer.get(b.customer_id).catch(() => null) : null;
      const phone = customer?.phone || "";
      const timeStr = new Date(b.start_time).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
      const smsConfig = resolveSMSConfig((n) => envGet(n));
      if (phone && smsConfig) {
        try {
          const r = await sendSMS(smsConfig, phone, SMS_TEMPLATES.booking_reminder_2h(timeStr));
          if (r.success) sent.sms_2h++;
        } catch {}
      }
      await svc.entities.Booking.update(b.id, { reminder_2h_sent_at: new Date().toISOString() }).catch(() => {});
    }

    await recordAudit(base44, { event_type: "reminder_run", entity_type: "Booking", entity_id: "", description: `Påminnelser: ${JSON.stringify(sent)}`, metadata: sent });
    return Response.json({ ok: true, sent });
  } catch (error) {
    console.error("sendDueReminders:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}