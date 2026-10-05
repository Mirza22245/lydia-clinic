// Delad logik för behandlingsspecifika bokningskrav. Används av
// getBookingRequirements och updateBookingStatus (och kan återanvändas av
// createPublicBooking vid behov). Hålls portabel — ingen Base44-specifik kod
// förutom SDK-anropen som anroparen skickar in.

export function parseRequiredFormIds(treatment) {
  try {
    const ids = JSON.parse(treatment?.required_form_ids || '[]');
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Returnerar en kravlista med completed-flagga per krav, samt allCompleted och
// missing (etiketter för ej uppfyllda obligatoriska krav).
// `svc` är en Base44-klient (service role eller user-scoped) som kan läsa
// HealthDeclaration, Consent, FormSubmission, Payment och FormTemplate.
export async function computeBookingRequirements(svc, booking, treatment) {
  const requirements = [];
  if (!treatment) {
    return { requirements, allCompleted: true, missing: [], enforceableCount: 0 };
  }
  const cid = booking?.customer_id || null;
  const bid = booking?.id || null;

  // 1. Hälsodeklaration
  if (treatment.requires_health_declaration) {
    let completed = false;
    if (cid) {
      const hd = await svc.entities.HealthDeclaration.filter(
        { customer_id: cid, status: 'submitted' },
        { limit: 1 }
      );
      completed = !!(hd.items && hd.items.length);
    }
    requirements.push({ key: 'health_declaration', label: 'Hälsodeklaration', required: true, completed });
  }

  // 2. Samtycke till behandling
  if (treatment.requires_consent) {
    let completed = false;
    if (cid) {
      const c = await svc.entities.Consent.filter(
        { customer_id: cid, type: 'treatment', granted: true, revoked_at: { $exists: false } },
        { limit: 1 }
      );
      completed = !!(c.items && c.items.length);
    }
    requirements.push({ key: 'consent', label: 'Samtycke till behandling', required: true, completed });
  }

  // 3. Obligatoriska formulär
  const formIds = parseRequiredFormIds(treatment);
  if (formIds.length > 0) {
    let submittedPage = { items: [] };
    if (cid) {
      submittedPage = await svc.entities.FormSubmission.filter(
        { customer_id: cid, template_id: { $in: formIds }, status: 'submitted' },
        { limit: 200 }
      );
    }
    const submittedIds = new Set((submittedPage.items || []).map((s) => s.template_id));
    for (const fid of formIds) {
      let name = fid;
      try {
        const t = await svc.entities.FormTemplate.get(fid);
        if (t && t.name) name = t.name;
      } catch { /* ignore — använd id som fallback */ }
      requirements.push({ key: `form:${fid}`, label: `Formulär: ${name}`, required: true, completed: submittedIds.has(fid) });
    }
  }

  // 4. Betalning
  if (treatment.requires_payment) {
    let completed = false;
    if (bid) {
      const p = await svc.entities.Payment.filter(
        { booking_id: bid, status: 'paid' },
        { limit: 1 }
      );
      completed = !!(p.items && p.items.length);
    }
    requirements.push({ key: 'payment', label: 'Betalning', required: true, completed });
  }

  // Informella (visas men blockerar inte)
  if (treatment.requires_treatment_info) {
    requirements.push({ key: 'treatment_info', label: 'Behandlingsinformation & risker', required: false, completed: true });
  }
  if (treatment.requires_aftercare) {
    requirements.push({ key: 'aftercare', label: 'Eftervårdsinformation', required: false, completed: true });
  }

  const enforceable = requirements.filter((r) => r.required);
  const allCompleted = enforceable.every((r) => r.completed);
  const missing = enforceable.filter((r) => !r.completed).map((r) => r.label);

  return { requirements, allCompleted, missing, enforceableCount: enforceable.length };
}

// Statusar som kräver att alla obligatoriska krav är uppfyllda innan bokningen
// kan gå dit. pending/utkast/cancelled/no_show kräver inte komplettering.
export const ADVANCING_STATUSES = ['confirmed', 'checked_in', 'in_progress', 'completed'];