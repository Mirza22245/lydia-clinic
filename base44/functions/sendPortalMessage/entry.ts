import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { findCustomerForUser } from '../../shared/portalCustomer.ts';
import { isFlagActive } from '../../shared/featureFlags.ts';

// Låter en inloggad kund skicka ett meddelande till kliniken från kundportalen.
// Kunden matchas mot sin egen Customer-post via e-post; meddelandet skapas alltid
// som "inbound" kopplat till den kunden — kunden kan aldrig skriva som någon annan.
// Max 10 meddelanden per timme och 2000 tecken per meddelande.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const text = String(body.body || '').trim();
    const subject = String(body.subject || '').trim().slice(0, 120);
    if (!text) return Response.json({ error: 'Skriv ett meddelande' }, { status: 400 });
    if (text.length > 2000) return Response.json({ error: 'Meddelandet är för långt (max 2000 tecken)' }, { status: 400 });

    const svc = base44.asServiceRole;
    const customer = await findCustomerForUser(svc, user);
    if (!customer) return Response.json({ error: 'Ingen kundprofil hittades' }, { status: 404 });
    if (!(await isFlagActive(svc, customer.clinic_id, 'messages'))) {
      return Response.json({ error: 'Meddelanden är inte aktiverade ännu.', code: 'messages_not_active' }, { status: 409 });
    }

    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await svc.entities.Message.filter(
      { customer_id: customer.id, direction: 'inbound', sent_at: { $gte: since } }, { limit: 11 }
    );
    if ((recent.items || []).length >= 10) {
      return Response.json({ error: 'Du har skickat många meddelanden nyligen. Försök igen om en stund.' }, { status: 429 });
    }

    const message = await svc.entities.Message.create({
      clinic_id: customer.clinic_id,
      customer_id: customer.id,
      customer_name: customer.name,
      direction: 'inbound',
      subject,
      body: text,
      is_read: false,
      sent_at: new Date().toISOString(),
    });

    return Response.json({ message });
  } catch (error) {
    console.error('sendPortalMessage:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}