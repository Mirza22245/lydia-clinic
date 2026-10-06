// BankID RP API v6.0-klient med mTLS (pfx-certifikat).
// Kräver secrets: BANKID_MODE, BANKID_API_URL, BANKID_CLIENT_SECRET,
// BANKID_PFX_B64 (base64-kodat .pfx), BANKID_PFX_PASSPHRASE.
// Feature flag 'bankid' (disabled/test/enabled) styr om funktionen är åtkomlig.
//
// RP v6.0 skiljer från äldre API: /auth tar endast endUserIp (personalNumber är
// valfritt och används bara för "same device"-flöde), QR-kod härleds från
// autoStartToken, och anropen kräver klientcertifikat (mTLS).

export type BankIDMode = 'disabled' | 'test' | 'production';

export interface BankIDConfig {
  mode: BankIDMode;
  api_url: string;
  client_secret: string;
  pfx_b64?: string;
  pfx_passphrase?: string;
}

export function resolveBankIDConfig(
  secretGetter: (name: string) => string | undefined
): BankIDConfig | null {
  const mode = (secretGetter('BANKID_MODE') || 'disabled') as BankIDMode;
  if (mode === 'disabled') return null;
  const api_url = secretGetter('BANKID_API_URL');
  const client_secret = secretGetter('BANKID_CLIENT_SECRET');
  if (!api_url || !client_secret) return null;
  return {
    mode,
    api_url,
    client_secret,
    pfx_b64: secretGetter('BANKID_PFX_B64') || undefined,
    pfx_passphrase: secretGetter('BANKID_PFX_PASSPHRASE') || undefined,
  };
}

async function makeRequest<T = any>(config: BankIDConfig, path: string, body: any): Promise<T> {
  const https = await import('node:https');
  const url = `${config.api_url}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.client_secret}`,
  };
  const data = JSON.stringify(body);
  const agentOpts: any = { rejectUnauthorized: true };
  if (config.pfx_b64) {
    agentOpts.pfx = Buffer.from(config.pfx_b64, 'base64');
    if (config.pfx_passphrase) agentOpts.passphrase = config.pfx_passphrase;
  }
  const agent = new https.Agent(agentOpts);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname, headers, agent },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(buf)); } catch { resolve({} as T); }
          } else {
            reject(new Error(`BankID ${path} misslyckades: ${res.statusCode} ${buf.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export interface BankIDAuthResult {
  orderRef: string;
  autoStartToken: string;
  qrStartToken?: string;
  qrStartSecret?: string;
}

export async function initiateBankIDAuth(
  config: BankIDConfig,
  endUserIp: string,
  personalNumber?: string
): Promise<BankIDAuthResult> {
  const body: any = { endUserIp };
  if (personalNumber) body.personalNumber = personalNumber;
  return makeRequest<BankIDAuthResult>(config, '/auth', body);
}

export interface BankIDCollectResult {
  status: 'pending' | 'complete' | 'failed';
  hintCode?: string;
  user?: {
    personalNumber: string;
    name: string;
    givenName: string;
    surname: string;
  };
  signature?: string;
  ocspResponse?: string;
}

export async function collectBankID(config: BankIDConfig, orderRef: string): Promise<BankIDCollectResult> {
  return makeRequest<BankIDCollectResult>(config, '/collect', { orderRef });
}

export async function cancelBankID(config: BankIDConfig, orderRef: string): Promise<void> {
  try { await makeRequest(config, '/cancel', { orderRef }); } catch { /* ignore */ }
}