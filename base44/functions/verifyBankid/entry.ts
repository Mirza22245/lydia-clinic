import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { resolveBankIDConfig, initiateBankIDAuth, collectBankID, cancelBankID } from "../../shared/bankid.ts";
import { recordAudit } from "../../shared/audit.ts";
import { requireStaff } from "../../shared/authz.ts";

// BankID-integration för identitetsverifiering.
// Kräver secrets: BANKID_MODE, BANKID_API_URL, BANKID_CLIENT_SECRET
// Feature flag 'bankid' måste vara enabled eller test.
//
// Actions:
//   initiate — startar BankID-auth för ett personnummer
//   collect  — pollar status för en orderRef
//   cancel   — avbryter en pågående auth
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Endast personal startar/följer BankID-verifiering (annars kan personnummer sondas av vem som helst).
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const config = resolveBankIDConfig((n) => secrets.get(n));
    if (!config) {
      return Response.json(
        { error: "BankID inte konfigurerat. Kontakta administratör." },
        { status: 503 }
      );
    }

    if (action === "initiate") {
      const { personal_number, customer_id } = body;
      if (!personal_number) {
        return Response.json({ error: "personal_number krävs" }, { status: 400 });
      }
      const endUserIp = req.headers.get("x-forwarded-for") || "0.0.0.0";
      const result = await initiateBankIDAuth(config, personal_number, endUserIp);

      await recordAudit(base44, {
        event_type: "bankid_initiate",
        entity_type: "Customer",
        entity_id: customer_id || "",
        description: `BankID-verifiering initierad${config.mode === "test" ? " (TESTLÄGE)" : ""}`,
        metadata: { orderRef: result.orderRef, mode: config.mode },
      });

      return Response.json(result);
    }

    if (action === "collect") {
      const { order_ref, customer_id } = body;
      if (!order_ref) {
        return Response.json({ error: "order_ref krävs" }, { status: 400 });
      }
      const result = await collectBankID(config, order_ref);

      if (result.status === "complete" && result.user) {
        await recordAudit(base44, {
          event_type: "bankid_verified",
          entity_type: "Customer",
          entity_id: customer_id || "",
          description: `BankID-verifiering godkänd: ${result.user.name} (${result.user.personalNumber})`,
          metadata: {
            personal_number: result.user.personalNumber,
            name: result.user.name,
            mode: config.mode,
          },
        });
      }

      return Response.json(result);
    }

    if (action === "cancel") {
      const { order_ref } = body;
      if (!order_ref) {
        return Response.json({ error: "order_ref krävs" }, { status: 400 });
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