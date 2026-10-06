// SMS provider abstraction — supports multiple providers (Twilio, 46elks, etc.).
// Provider väljs via SMS_PROVIDER env. Disabled by default.
// Secrets: SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET, SMS_SENDER
// Feature flag: 'sms' (disabled/test/enabled)

export interface SMSConfig {
  provider: string;
  api_key: string;
  api_secret: string;
  sender: string;
}

export function resolveSMSConfig(
  secretGetter: (name: string) => string | undefined
): SMSConfig | null {
  const provider = secretGetter("SMS_PROVIDER");
  if (!provider) return null;
  const api_key = secretGetter("SMS_API_KEY");
  const api_secret = secretGetter("SMS_API_SECRET");
  const sender = secretGetter("SMS_SENDER") || "Lydia";
  if (!api_key || !api_secret) return null;
  return { provider, api_key, api_secret, sender };
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("0")) p = "+46" + p.slice(1);
  if (p.startsWith("+") && !p.startsWith("+46")) return p;
  if (!p.startsWith("+")) p = "+46" + p;
  return p;
}

export async function sendSMS(
  config: SMSConfig,
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phone = normalizePhone(to);
  switch (config.provider.toLowerCase()) {
    case "twilio":
      return sendViaTwilio(config, phone, message);
    case "46elks":
      return sendVia46Elks(config, phone, message);
    case "smsapi":
      return sendViaSmsApi(config, phone, message);
    default:
      return { success: false, error: `Okänd SMS-provider: ${config.provider}` };
  }
}

async function sendViaTwilio(config: SMSConfig, to: string, message: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.api_key}/Messages.json`;
  const auth = btoa(`${config.api_key}:${config.api_secret}`);
  const body = new URLSearchParams({ From: config.sender, To: to, Body: message });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Twilio error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.sid };
}

async function sendVia46Elks(config: SMSConfig, to: string, message: string) {
  const res = await fetch("https://api.46elks.com/a1/sms", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.api_key}:${config.api_secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ from: config.sender, to, message }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `46elks error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.id };
}

async function sendViaSmsApi(config: SMSConfig, to: string, message: string) {
  const res = await fetch("https://api.smsapi.com/sms.do", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.api_secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      to: to.replace("+", ""),
      from: config.sender,
      message,
      format: "json",
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `SMSAPI error: ${err}` };
  }
  const data = await res.json();
  return { success: true, messageId: data.message_id };
}

// Fördefinierade meddelandemallar (inga känsliga patientuppgifter i klartext).
export const SMS_TEMPLATES = {
  booking_confirmation: (date, time) =>
    `Lydia: Din bokning är bekräftad. Välkommen ${date} kl ${time}. Se detaljer i din kundportal.`,
  booking_reminder_24h: (date, time) =>
    `Lydia: Påminnelse om din tid ${date} kl ${time}. Avboka senast 24h i förväg om behov.`,
  booking_reminder_2h: (time) =>
    `Lydia: Din tid börjar om 2 timmar (kl ${time}). Välkommen!`,
  booking_cancelled: () =>
    `Lydia: Din bokning har avbokats. Boka ny tid i kundportalen när du önskar.`,
  booking_rescheduled: (date, time) =>
    `Lydia: Din tid har ombokats till ${date} kl ${time}.`,
  form_reminder: () =>
    `Lydia: Du har ett formulär att fylla i inför ditt besök. Logga in i kundportalen.`,
  consent_reminder: () =>
    `Lydia: Ett samtycke väntar din signering. Logga in i kundportalen för att slutföra.`,
  follow_up: () =>
    `Lydia: Vi hoppas du är nöjd med din behandling. Logga in i kundportalen för att lämna feedback.`,
};