import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Loggar när personal öppnar/läser en patients journal eller känsliga
// uppgifter. Skapar en AuditLog-post med event_type "patient_access" som
// innehåller vem, vilken patient, när och vilken åtgärd.
//
// Skillnaden mot vanlig audit-logg: detta loggar LÄSNING (read/view), inte
// bara ändringar (create/update/delete). Krävs av Socialstyrelsens föreskrifter.
//
// Endast personal kan anropa.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isStaff = user.role === 'admin' || !!user.data?.staff_role;
    if (!isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { customer_id, customer_name, access_type, entity_type, entity_id, description } = body;
    if (!customer_id) return Response.json({ error: 'customer_id krävs' }, { status: 400 });

    const svc = base44.asServiceRole;

    // Hämta clinic_id från kunden
    let clinicId = '';
    if (user.data?.clinic_id) {
      clinicId = user.data.clinic_id;
    } else {
      const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
      clinicId = customer?.clinic_id || '';
    }

    await svc.entities.AuditLog.create({
      clinic_id: clinicId,
      event_type: 'patient_access',
      entity_type: entity_type || 'Customer',
      entity_id: entity_id || customer_id,
      description: description || `Personal läste patientdata: ${customer_name || customer_id}`,
      user_id: user.id,
      user_name: user.full_name || user.email || '',
      metadata: JSON.stringify({
        customer_id,
        customer_name: customer_name || '',
        access_type: access_type || 'read',
        entity_type: entity_type || 'Customer',
      }),
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('logPatientAccess error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}