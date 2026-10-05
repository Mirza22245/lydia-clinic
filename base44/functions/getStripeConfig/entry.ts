import { secrets } from "base44:runtime";

// Returnerar den publika Stripe-nyckeln till frontend. Publishable keys är
// säkra att exponera i klienten och används av Stripe Elements.
export default async function(req) {
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