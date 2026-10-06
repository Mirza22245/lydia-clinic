// BankID provider abstraction — supports DISABLED/TEST/PRODUCTION modes.
// Provider kan bytas utan att ändra anropande kod.
// Secrets: BANKID_MODE, BANKID_API_URL, BANKID_CLIENT_SECRET
// Feature flag: 'bankid' (disabled/test/enabled)

export type BankIDMode = "disabled" | "test" | "production";

export interface BankIDConfig {
  mode: BankIDMode;
  api_url: string;
  client_secret: string;
}

export function resolveBankIDConfig(
  secretGetter: (name: string) => string | undefined
): BankIDConfig | null {
  const mode = (secretGetter("BANKID_MODE") || "disabled") as BankIDMode;
  if (mode === "disabled") return null;
  const api_url = secretGetter("BANKID_API_URL");
  const client_secret = secretGetter("BANKID_CLIENT_SECRET");
  if (!api_url || !client_secret) return null;
  return { mode, api_url, client_secret };
}

export interface BankIDAuthResult {
  orderRef: string;
  autoStartToken: string;
}

export async function initiateBankIDAuth(
  config: BankIDConfig,
  personalNumber: string,
  endUserIp: string
): Promise<BankIDAuthResult> {
  const res = await fetch(`${config.api_url}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.client_secret}`,
    },
    body: JSON.stringify({
      personalNumber: config.mode === "test" ? "20120909-1234" : personalNumber,
      endUserIp,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BankID auth failed: ${res.status} ${err}`);
  }
  return res.json();
}

export interface BankIDCollectResult {
  status: "pending" | "complete" | "failed";
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

export async function collectBankID(
  config: BankIDConfig,
  orderRef: string
): Promise<BankIDCollectResult> {
  const res = await fetch(`${config.api_url}/collect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.client_secret}`,
    },
    body: JSON.stringify({ orderRef }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BankID collect failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function cancelBankID(
  config: BankIDConfig,
  orderRef: string
): Promise<void> {
  await fetch(`${config.api_url}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.client_secret}`,
    },
    body: JSON.stringify({ orderRef }),
  }).catch(() => {});
}