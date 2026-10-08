globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/verifyBankid/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
import { secrets } from "./runtime/secrets-shim.js";

// base44/shared/bankid.ts
function resolveBankIDConfig(secretGetter) {
  const mode = secretGetter("BANKID_MODE") || "disabled";
  if (mode === "disabled") return null;
  const api_url = secretGetter("BANKID_API_URL");
  const client_secret = secretGetter("BANKID_CLIENT_SECRET");
  if (!api_url || !client_secret) return null;
  return {
    mode,
    api_url,
    client_secret,
    pfx_b64: secretGetter("BANKID_PFX_B64") || void 0,
    pfx_passphrase: secretGetter("BANKID_PFX_PASSPHRASE") || void 0
  };
}
async function makeRequest(config, path, body) {
  const https = await import("node:https");
  const url = `${config.api_url}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.client_secret}`
  };
  const data = JSON.stringify(body);
  const agentOpts = { rejectUnauthorized: true };
  if (config.pfx_b64) {
    agentOpts.pfx = Buffer.from(config.pfx_b64, "base64");
    if (config.pfx_passphrase) agentOpts.passphrase = config.pfx_passphrase;
  }
  const agent = new https.Agent(agentOpts);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: "POST", hostname: u.hostname, port: u.port || 443, path: u.pathname, headers, agent },
      (res) => {
        let buf = "";
        res.on("data", (c) => buf += c);
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(buf));
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`BankID ${path} misslyckades: ${res.statusCode} ${buf.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
async function initiateBankIDAuth(config, endUserIp, personalNumber) {
  const body = { endUserIp };
  if (personalNumber) body.personalNumber = personalNumber;
  return makeRequest(config, "/auth", body);
}
async function collectBankID(config, orderRef) {
  return makeRequest(config, "/collect", { orderRef });
}
async function cancelBankID(config, orderRef) {
  try {
    await makeRequest(config, "/cancel", { orderRef });
  } catch {
  }
}

// base44/shared/audit.ts
async function recordAudit(base44, evt) {
  try {
    const user = await base44.auth.me();
    const clinicId = evt.clinic_id || getUserClinicIdSafe(user);
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: evt.event_type,
      entity_type: evt.entity_type,
      entity_id: evt.entity_id || "",
      description: (evt.description || "").slice(0, 500),
      user_id: user?.id || "",
      user_name: user?.full_name || user?.email || "",
      metadata: evt.metadata ? JSON.stringify(evt.metadata).slice(0, 4e3) : "",
      clinic_id: clinicId || ""
    });
  } catch {
  }
}
function getUserClinicIdSafe(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}

// base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function getStaffRole(user) {
  if (user?.role === "admin") return "administrat\xF6r";
  const v = user?.staff_role ?? user?.data?.staff_role ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function isPlatformAdmin(user) {
  return user?.role === "admin" && !getUserClinicId(user);
}
function isStaff(user) {
  return isPlatformAdmin(user) || !!getStaffRole(user);
}
function requireStaff(user) {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isStaff(user)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

// base44/functions/verifyBankid/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const config = resolveBankIDConfig((n) => secrets.get(n));
    if (!config) {
      return Response.json(
        { error: "BankID inte konfigurerat. Kontakta administrat\xF6r." },
        { status: 503 }
      );
    }
    if (action === "initiate") {
      const { personal_number, customer_id } = body;
      if (!personal_number) {
        return Response.json({ error: "personal_number kr\xE4vs" }, { status: 400 });
      }
      const endUserIp = req.headers.get("x-forwarded-for") || "0.0.0.0";
      const result = await initiateBankIDAuth(config, personal_number, endUserIp);
      await recordAudit(base44, {
        event_type: "bankid_initiate",
        entity_type: "Customer",
        entity_id: customer_id || "",
        description: `BankID-verifiering initierad${config.mode === "test" ? " (TESTL\xC4GE)" : ""}`,
        metadata: { orderRef: result.orderRef, mode: config.mode }
      });
      return Response.json(result);
    }
    if (action === "collect") {
      const { order_ref, customer_id } = body;
      if (!order_ref) {
        return Response.json({ error: "order_ref kr\xE4vs" }, { status: 400 });
      }
      const result = await collectBankID(config, order_ref);
      if (result.status === "complete" && result.user) {
        await recordAudit(base44, {
          event_type: "bankid_verified",
          entity_type: "Customer",
          entity_id: customer_id || "",
          description: `BankID-verifiering godk\xE4nd: ${result.user.name} (${result.user.personalNumber})`,
          metadata: {
            personal_number: result.user.personalNumber,
            name: result.user.name,
            mode: config.mode
          }
        });
      }
      return Response.json(result);
    }
    if (action === "cancel") {
      const { order_ref } = body;
      if (!order_ref) {
        return Response.json({ error: "order_ref kr\xE4vs" }, { status: 400 });
      }
      await cancelBankID(config, order_ref);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Ogiltig action" }, { status: 400 });
  } catch (error) {
    console.error("verifyBankid:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
