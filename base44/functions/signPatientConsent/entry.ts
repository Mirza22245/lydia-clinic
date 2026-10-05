import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Låter en inloggad patient digitalt signera (bevilja) ett samtycke som kliniken
// har lagt upp för dem. Accesskontroll: matchar anroparens e-post mot en Customer
// och verifierar att samtycket tillhör just den kunden innan uppdatering.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const consentId = body.consent_id;
    if (!consentId) return Response.json({ error: 'consent_id required' }, { status: 400 });

    const email = (user.email || '').toLowerCase().trim();
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const svc = base44.asServiceRole;
    const custPage = await svc.entities.Customer.filter(
      { email: { $regex: `^${escEmail}$`, $options: 'i' } },
      { limit: 1 }
    );
    const customer = (custPage.items || [])[0];
    if (!customer) return Response.json({ error: 'No patient profile' }, { status: 404 });

    const consent = await svc.entities.Consent.get(consentId);
    if (!consent || consent.customer_id !== customer.id) {
      return Response.json({ error: 'Consent not found for this patient' }, { status: 404 });
    }

    const updated = await svc.entities.Consent.update(consentId, {
      granted: true,
      granted_at: new Date().toISOString(),
      granted_by: customer.name,
    });

    return Response.json({ consent: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}