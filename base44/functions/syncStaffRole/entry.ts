import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getUserClinicId } from '../../shared/authz.ts';

// Admin-only: synkar en personalposts roll till motsvarande User-posts staff_role (och klinik)
// så att RLS kan styra åtkomst till känslig journal-/hälsodata på datanivå.
// Säkerhet: bara en verifierad e-postadress kan få personalroll, och en admin kan aldrig
// flytta en användare som redan tillhör en annan klinik.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const email = (body?.email || '').toString().toLowerCase().trim();
    const staff_role = (body?.staff_role || '').toString().trim();
    if (!email) return Response.json({ error: 'E-post krävs' }, { status: 400 });

    const allowed = ['administratör', 'behandlare', 'reception', ''];
    if (!allowed.includes(staff_role)) return Response.json({ error: 'Ogiltig roll' }, { status: 400 });

    const page = await base44.asServiceRole.entities.User.filter({ email });
    const target = (page.items || [])[0];
    if (!target) return Response.json({ error: 'Användare hittades inte — inbjuden ännu?' }, { status: 404 });

    const adminClinic = getUserClinicId(user);
    const targetClinic = getUserClinicId(target);
    if (adminClinic && targetClinic && targetClinic !== adminClinic) {
      return Response.json({ error: 'Användaren tillhör en annan klinik' }, { status: 403 });
    }
    if (staff_role && target.email_verified === false) {
      return Response.json({ error: 'Användarens e-postadress är inte verifierad ännu' }, { status: 400 });
    }

    if (staff_role) {
      await base44.asServiceRole.entities.User.update(target.id, adminClinic ? { staff_role, clinic_id: adminClinic } : { staff_role });
    } else {
      await base44.asServiceRole.entities.User.updateMany({ id: target.id }, { $unset: adminClinic ? { staff_role: '', clinic_id: '' } : { staff_role: '' } });
    }

    return Response.json({ ok: true, user_id: target.id, staff_role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}