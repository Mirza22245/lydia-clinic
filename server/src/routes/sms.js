// SMS-rutter — speglar sendSms
import { Router } from "express";
import { recordAudit } from "../lib/audit.js";

const router = Router();

const SMS_TEMPLATES = {
  booking_confirmation: (date, time) => `Lydia: Din bokning är bekräftad. Välkommen ${date} kl ${time}.`,
  booking_reminder_24h: (date, time) => `Lydia: Påminnelse om din tid ${date} kl ${time}.`,
  booking_reminder_2h: (time) => `Lydia: Din tid börjar om 2 timmar (kl ${time}).`,
  booking_cancelled: () => `Lydia: Din bokning har avbokats.`,
  booking_rescheduled: (date, time) => `Lydia: Din tid har ombokats till ${date} kl ${time}.`,
  form_reminder: () => `Lydia: Du har ett formulär att fylla i. Logga in i kundportalen.`,
  consent_reminder: () => `Lydia: Ett samtycke väntar din signering. Logga in i kundportalen.`,
  follow_up: () => `Lydia: Vi hoppas du är nöjd med din behandling.`,
};

router.post("/send", async (req, res) => {
  try {
    const { to, template, template_args, message, customer_id, booking_id } = req.body;
    if (!to) return res.status(400).json({ error: "to krävs" });

    const provider = process.env.SMS_PROVIDER;
    if (!provider) return res.status(503).json({ error: "SMS inte konfigurerat" });

    let text = message;
    if (template) {
      const fn = SMS_TEMPLATES[template];
      if (!fn) return res.status(400).json({ error: "Okänd mall: " + template });
      text = fn(...(template_args || []));
    }

    // Skicka via provider (Twilio/46elks/SMSAPI)
    let result;
    if (provider.toLowerCase() === "twilio") {
      const auth = Buffer.from(process.env.SMS_API_KEY + ":" + process.env.SMS_API_SECRET).toString("base64");
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.SMS_API_KEY}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: process.env.SMS_SENDER || "Lydia", To: to, Body: text }).toString(),
      });
      result = await r.json();
    } else {
      result = { success: false, error: "Provider ej implementerad: " + provider };
    }

    await recordAudit(req, {
      event_type: result.sid ? "sms_sent" : "sms_failed",
      entity_type: "Customer",
      entity_id: customer_id || "",
      description: "SMS (" + (template || "custom") + ")",
      metadata: { to, template: template || "custom", booking_id: booking_id || "" },
    });

    res.json({ success: !!result.sid, messageId: result.sid, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;