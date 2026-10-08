globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/getStripeConfig/entry.ts
import { secrets } from "./runtime/secrets-shim.js";
async function entry_default(req) {
  try {
    const publishable_key = secrets.get("STRIPE_PUBLISHABLE_KEY");
    if (!publishable_key) {
      return Response.json({ error: "Stripe publishable key saknas" }, { status: 500 });
    }
    return Response.json({ publishable_key });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
