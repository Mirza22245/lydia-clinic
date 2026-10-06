import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Uppdaterar en feature flag. Endast administratörer kan ändra flaggor.
// Auditar ändringen och returnerar den uppdaterade flaggan.
// Status cyklar mellan: disabled → test → enabled → disabled.
import { canAccessClinic } from '../../shared/authz.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin' || user.data?.staff_role === 'administratör';
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { flag_id, status } = body;
    if (!flag_id || !status) {
      return Response.json({ error: 'flag_id och status krävs' }, { status: 400 });
    }
    if (!['disabled', 'test', 'enabled'].includes(status)) {
      return Response.json({ error: 'Ogiltig status. Använd: disabled, test eller enabled' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const flag = await svc.entities.FeatureFlag.get(flag_id).catch(() => null);
    if (!flag) return Response.json({ error: 'Flaggan hittades inte' }, { status: 404 });

    // Klinikisolering
    if (!canAccessClinic(user, flag.clinic_id)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const prevStatus = flag.status;
    const updated = await base44.entities.FeatureFlag.update(flag_id, { status });

    // Audit-logg
    try {
      await svc.entities.AuditLog.create({
        clinic_id: flag.clinic_id || '',
        event_type: 'feature_flag_update',
        entity_type: 'FeatureFlag',
        entity_id: flag_id,
        description: `Feature flag "${flag.key}" ändrad: ${prevStatus} → ${status}`,
        user_id: user.id,
        user_name: user.full_name || user.email || '',
        metadata: JSON.stringify({ key: flag.key, from: prevStatus, to: status }),
      });
    } catch { /* swallow */ }

    return Response.json({ flag: updated });
  } catch (error) {
    console.error('updateFeatureFlag error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}