import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Offentlig data för onlinebokning: klinik, behandlingar och aktiv personal.
// Ingen inloggning krävs. Klinik väljs via clinic_id eller första tillgängliga.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    let clinic;
    if (body.clinic_id) {
      clinic = await svc.entities.Clinic.get(body.clinic_id).catch(() => null);
    }
    if (!clinic) {
      const clinics = await svc.entities.Clinic.filter({}, { limit: 1 });
      clinic = (clinics.items || [])[0];
    }
    if (!clinic) return Response.json({ error: 'Ingen klinik hittades' }, { status: 404 });

    const [treatments, staff] = await Promise.all([
      svc.entities.Treatment.filter({ clinic_id: clinic.id }, { sort: 'name', limit: 200 }),
      svc.entities.Staff.filter({ clinic_id: clinic.id, active: true }, { sort: 'name', limit: 100 }),
    ]);

    return Response.json({
      clinic: {
        id: clinic.id, name: clinic.name, phone: clinic.phone, email: clinic.email, address: clinic.address,
      },
      treatments: (treatments.items || []).map((t) => ({
        id: t.id, name: t.name, duration: t.duration, price: t.price, category: t.category, description: t.description,
      })),
      staff: (staff.items || []).map((s) => ({ id: s.id, name: s.name, title: s.title })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}