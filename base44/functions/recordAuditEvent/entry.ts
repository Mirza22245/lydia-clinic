import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { recordAudit } from '../../shared/audit.ts';

// Registrerar en audit-händelse från klienten. Användarens identitet hämtas
// server-side via base44.auth.me() så att den inte kan förfalskas från klienten.
// Anropas med { event_type, entity_type, entity_id, description, metadata }.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (!body.event_type || !body.entity_type) {
      return Response.json({ error: 'event_type and entity_type required' }, { status: 400 });
    }

    await recordAudit(base44, {
      event_type: body.event_type,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      description: body.description,
      metadata: body.metadata,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}