globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/getBookingRequirements/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/bookingRequirements.ts
function parseRequiredFormIds(treatment) {
  try {
    const ids = JSON.parse(treatment?.required_form_ids || "[]");
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}
async function computeBookingRequirements(svc, booking, treatment) {
  const requirements = [];
  if (!treatment) {
    return { requirements, allCompleted: true, missing: [], enforceableCount: 0 };
  }
  const cid = booking?.customer_id || null;
  const bid = booking?.id || null;
  if (treatment.requires_health_declaration) {
    let completed = false;
    if (cid) {
      const hd = await svc.entities.HealthDeclaration.filter(
        { customer_id: cid, status: "submitted" },
        { limit: 1 }
      );
      completed = !!(hd.items && hd.items.length);
    }
    requirements.push({ key: "health_declaration", label: "H\xE4lsodeklaration", required: true, completed });
  }
  if (treatment.requires_consent) {
    let completed = false;
    if (cid) {
      const c = await svc.entities.Consent.filter(
        { customer_id: cid, type: "treatment", granted: true },
        { limit: 50 }
      );
      completed = !!(c.items || []).some((x) => !x.revoked_at);
    }
    requirements.push({ key: "consent", label: "Samtycke till behandling", required: true, completed });
  }
  const formIds = parseRequiredFormIds(treatment);
  if (formIds.length > 0) {
    let submittedPage = { items: [] };
    if (cid) {
      submittedPage = await svc.entities.FormSubmission.filter(
        { customer_id: cid, template_id: { $in: formIds }, status: "submitted" },
        { limit: 200 }
      );
    }
    const submittedIds = new Set((submittedPage.items || []).map((s) => s.template_id));
    for (const fid of formIds) {
      let name = fid;
      try {
        const t = await svc.entities.FormTemplate.get(fid);
        if (t && t.name) name = t.name;
      } catch {
      }
      requirements.push({ key: `form:${fid}`, label: `Formul\xE4r: ${name}`, required: true, completed: submittedIds.has(fid) });
    }
  }
  if (treatment.requires_payment) {
    let completed = false;
    if (bid) {
      const p = await svc.entities.Payment.filter(
        { booking_id: bid, status: "paid" },
        { limit: 1 }
      );
      completed = !!(p.items && p.items.length);
    }
    requirements.push({ key: "payment", label: "Betalning", required: true, completed });
  }
  if (treatment.treatment_type === "injektion" && cid) {
    const minAge = Math.max(18, treatment.min_age || 0);
    if (minAge > 0) {
      const customer = await svc.entities.Customer.get(cid).catch(() => null);
      let ageOk = false;
      if (customer?.birth_date) {
        const age = Math.floor((Date.now() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1e3));
        ageOk = age >= minAge;
      }
      requirements.push({ key: "compliance_age", label: `\xC5lderskontroll (${minAge}+ \xE5r)`, required: true, completed: ageOk });
    }
    const cpQuery = bid ? { customer_id: cid, treatment_id: treatment.id, booking_id: bid } : { customer_id: cid, treatment_id: treatment.id };
    const cp = await svc.entities.TreatmentCompliance.filter(cpQuery, { sort: "-created_date", limit: 1 });
    const compliance = cp.items?.[0];
    requirements.push({
      key: "compliance_info",
      label: "Behandlingsinformation l\xE4mnad",
      required: true,
      completed: !!compliance?.information_given_at
    });
    if (treatment.betanketid_hours > 0) {
      const betanketidPassed = !!(compliance?.betanketid_ends_at && /* @__PURE__ */ new Date() >= new Date(compliance.betanketid_ends_at));
      requirements.push({
        key: "compliance_betanketid",
        label: `Bet\xE4nketid (${treatment.betanketid_hours}h)`,
        required: true,
        completed: betanketidPassed
      });
    }
    if (treatment.requires_consent && compliance) {
      const consentOk = !!(compliance.consent_signed_at && compliance.consent_eligible_at && new Date(compliance.consent_signed_at) >= new Date(compliance.consent_eligible_at));
      requirements.push({
        key: "compliance_consent",
        label: "Samtycke efter bet\xE4nketid",
        required: true,
        completed: consentOk
      });
    }
  }
  if (treatment.requires_treatment_info) {
    requirements.push({ key: "treatment_info", label: "Behandlingsinformation & risker", required: false, completed: true });
  }
  if (treatment.requires_aftercare) {
    requirements.push({ key: "aftercare", label: "Efterv\xE5rdsinformation", required: false, completed: true });
  }
  const enforceable = requirements.filter((r) => r.required);
  const allCompleted = enforceable.every((r) => r.completed);
  const missing = enforceable.filter((r) => !r.completed).map((r) => r.label);
  return { requirements, allCompleted, missing, enforceableCount: enforceable.length };
}

// ../base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function isPlatformAdmin(user) {
  return user?.role === "admin" && !getUserClinicId(user);
}
function canAccessClinic(user, recordClinicId) {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}

// ../base44/functions/getBookingRequirements/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const bookingId = body.booking_id || new URL(req.url).searchParams.get("booking_id");
    if (!bookingId) return Response.json({ error: "booking_id kr\xE4vs" }, { status: 400 });
    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(bookingId).catch(() => null);
    if (!booking) return Response.json({ error: "Bokning hittades inte" }, { status: 404 });
    const isStaff = user.role === "admin" || !!user.data?.staff_role;
    if (isStaff) {
      if (!canAccessClinic(user, booking.clinic_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      if (!booking.customer_id) return Response.json({ error: "Forbidden" }, { status: 403 });
      const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
      const email = (user.email || "").toLowerCase().trim();
      if (!customer || (customer.email || "").toLowerCase().trim() !== email) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
    const result = await computeBookingRequirements(svc, booking, treatment);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
