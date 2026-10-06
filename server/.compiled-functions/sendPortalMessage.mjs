globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/sendPortalMessage/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// ../base44/shared/portalCustomer.ts
function normalizeEmail(user) {
  return (user?.email || "").toLowerCase().trim();
}
async function findCustomerForUser(svc, user) {
  const email = normalizeEmail(user);
  if (!email) return null;
  const esc = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = await svc.entities.Customer.filter(
    { email: { $regex: `^${esc}$`, $options: "i" } },
    { limit: 1 }
  );
  return (page.items || [])[0] || null;
}

// ../base44/shared/featureFlags.ts
async function isFlagActive(svc, clinic_id, key) {
  const page = await svc.entities.FeatureFlag.filter({ clinic_id, key }, { limit: 1 });
  const flag = (page.items || [])[0];
  return !!flag && (flag.status === "enabled" || flag.status === "test");
}

// ../base44/functions/sendPortalMessage/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const text = String(body.body || "").trim();
    const subject = String(body.subject || "").trim().slice(0, 120);
    if (!text) return Response.json({ error: "Skriv ett meddelande" }, { status: 400 });
    if (text.length > 2e3) return Response.json({ error: "Meddelandet \xE4r f\xF6r l\xE5ngt (max 2000 tecken)" }, { status: 400 });
    const svc = base44.asServiceRole;
    const customer = await findCustomerForUser(svc, user);
    if (!customer) return Response.json({ error: "Ingen kundprofil hittades" }, { status: 404 });
    if (!await isFlagActive(svc, customer.clinic_id, "messages")) {
      return Response.json({ error: "Meddelanden \xE4r inte aktiverade \xE4nnu.", code: "messages_not_active" }, { status: 409 });
    }
    const since = new Date(Date.now() - 3600 * 1e3).toISOString();
    const recent = await svc.entities.Message.filter(
      { customer_id: customer.id, direction: "inbound", sent_at: { $gte: since } },
      { limit: 11 }
    );
    if ((recent.items || []).length >= 10) {
      return Response.json({ error: "Du har skickat m\xE5nga meddelanden nyligen. F\xF6rs\xF6k igen om en stund." }, { status: 429 });
    }
    const message = await svc.entities.Message.create({
      clinic_id: customer.clinic_id,
      customer_id: customer.id,
      customer_name: customer.name,
      direction: "inbound",
      subject,
      body: text,
      is_read: false,
      sent_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return Response.json({ message });
  } catch (error) {
    console.error("sendPortalMessage:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
