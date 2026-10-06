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
        requires_health_declaration: !!t.requires_health_declaration,
        requires_consent: t.requires_consent !== false,
        requires_treatment_info: !!t.requires_treatment_info,
        requires_aftercare: !!t.requires_aftercare,
        requires_payment: !!t.requires_payment,
        guest_booking_allowed: t.guest_booking_allowed !== false,
        // Injektioner har alltid lägst 18 år (IVO), oavsett inställt min_age — styr även födelsedatumsfältet i bokningen.
        min_age: t.treatment_type === 'injektion' ? Math.max(18, t.min_age || 0) : (t.min_age || 0),
        waiting_period_days: t.waiting_period_days || 0,
        cancellation_hours: t.cancellation_hours ?? 24,
        no_show_fee: t.no_show_fee || 0,
        required_form_ids: t.required_form_ids || "",
      })),
      staff: (staff.items || []).map((s) => ({ id: s.id, name: s.name, title: s.title })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}