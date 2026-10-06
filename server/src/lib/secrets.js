// Secrets — ersätter Base44 secrets.get(). Läser från .env / miljövariabler.
// På Hostinger: sätt dessa i .env eller via panelens Environment Variables.
export function getSecret(name) {
  return process.env[name] || "";
}

export function requireSecret(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Secret ${name} is not configured`);
  return val;
}

// Alla secrets Lydia använder (för dokumentation och .env.example)
export const REQUIRED_SECRETS = {
  // Databas
  DATABASE_URL: "PostgreSQL-anslutningssträng",
  DB_SSL: "true om SSL krävs (Hostinger)",

  // Auth
  JWT_SECRET: "Hemlig nyckel för JWT-signering",

  // Stripe
  STRIPE_SECRET_KEY: "Stripe secret key",
  STRIPE_PUBLISHABLE_KEY: "Stripe publishable key",
  STRIPE_WEBHOOK_SECRET: "Stripe webhook signing secret",

  // E-post
  SMTP_HOST: "SMTP-server (t.ex. smtp.gmail.com)",
  SMTP_PORT: "SMTP-port (587 för TLS)",
  SMTP_USER: "SMTP-användare",
  SMTP_PASS: "SMTP-lösenord",
  EMAIL_FROM: "Avsändaradress (t.ex. noreply@lydiaestetisk.se)",

  // SMS
  SMS_PROVIDER: "twilio | 46elks | smsapi",
  SMS_API_KEY: "API-nyckel för SMS-provider",
  SMS_API_SECRET: "API-secret för SMS-provider",
  SMS_SENDER: "Avsändarnamn (t.ex. Lydia)",

  // BankID
  BANKID_MODE: "disabled | test | production",
  BANKID_API_URL: "BankID API URL",
  BANKID_CLIENT_SECRET: "BankID klienthemlighet",

  // Fillagring (S3-kompatibel)
  S3_ENDPOINT: "S3-endpoint (t.ex. Hostinger Object Storage)",
  S3_BUCKET: "S3-bucket",
  S3_ACCESS_KEY: "S3 access key",
  S3_SECRET_KEY: "S3 secret key",

  // Frontend
  CORS_ORIGIN: "Tillåten origin (t.ex. https://app.lydiaestetisk.se)",
};