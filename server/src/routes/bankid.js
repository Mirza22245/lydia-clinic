// BankID-rutter — speglar verifyBankid
import { Router } from "express";
import { recordAudit } from "../lib/audit.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { action, personal_number, order_ref, customer_id } = req.body;
    const mode = process.env.BANKID_MODE || "disabled";
    if (mode === "disabled") return res.status(503).json({ error: "BankID inte konfigurerat" });

    const apiUrl = process.env.BANKID_API_URL;
    const clientSecret = process.env.BANKID_CLIENT_SECRET;
    if (!apiUrl || !clientSecret) return res.status(503).json({ error: "BankID inte konfigurerat" });

    if (action === "initiate") {
      if (!personal_number) return res.status(400).json({ error: "personal_number krävs" });
      const ip = req.ip || "0.0.0.0";
      const r = await fetch(apiUrl + "/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + clientSecret },
        body: JSON.stringify({ personalNumber: mode === "test" ? "20120909-1234" : personal_number, endUserIp: ip }),
      });
      if (!r.ok) return res.status(502).json({ error: "BankID error" });
      const result = await r.json();
      await recordAudit(req, { event_type: "bankid_initiate", entity_type: "Customer", entity_id: customer_id || "", description: "BankID initierat" });
      return res.json(result);
    }

    if (action === "collect") {
      if (!order_ref) return res.status(400).json({ error: "order_ref krävs" });
      const r = await fetch(apiUrl + "/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + clientSecret },
        body: JSON.stringify({ orderRef: order_ref }),
      });
      const result = await r.json();
      if (result.status === "complete") {
        await recordAudit(req, { event_type: "bankid_verified", entity_type: "Customer", entity_id: customer_id || "", description: "BankID verifierad: " + (result.user?.name || ""), metadata: { personal_number: result.user?.personalNumber } });
      }
      return res.json(result);
    }

    res.status(400).json({ error: "Ogiltig action" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;