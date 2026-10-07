import { randomBytes } from 'node:crypto';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Saknad miljövariabel: ${name}. Konfigurera i server/.env`);
  return v;
}

function bool(name, def) {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || '') === 'production',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  fileSigningSecret: required('FILE_SIGNING_SECRET'),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cronSecret: required('CRON_SECRET'),
  appBaseUrl: process.env.APP_BASE_URL || 'https://app.lydiaestetisk.se',
  storage: {
    driver: process.env.STORAGE_DRIVER || 'LOCAL',
    dir: process.env.STORAGE_DIR || '/var/lydia/files',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      bucket: process.env.S3_BUCKET || '',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      region: process.env.S3_REGION || 'eu-north-1',
    },
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: bool('SMTP_SECURE', true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Lydia',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  encryptionKey: process.env.ENCRYPTION_KEY || (config_jwtSecret_alias()),
};

function config_jwtSecret_alias() {
  return process.env.JWT_SECRET || randomBytes(32).toString('hex');
}