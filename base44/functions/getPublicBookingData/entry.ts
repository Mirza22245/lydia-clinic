import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { parseAllowedTreatments } from '../../shared/staffCompetence.ts';
import { clinicDateOf } from '../../shared/availability.ts';

// Offentlig data för klinikens webbplats och onlinebokning: klinik, behandlingar,
// aktiv personal (inkl. vilka behandlingar de får utföra) och aktiva kampanjer.
// Ingen inloggning krävs — returnerar ENDAST publik information (inga patientuppgifter).
// Klinik väljs via clinic_id eller första tillgängliga.
function parseFaq(raw: any): { q: string; a: string }[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string' && x.q.trim() && x.a.trim())
      .map((x) => ({ q: x.q.trim(), a: x.a.trim() }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

export default async function(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const response = await fetch('http://127.0.0.1:3001/api/public-booking-data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({ error: 'Serverfel' }));
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message || 'Serverfel' }, { status: 500 });
  }
}
