globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/checkTreatmentCompliance/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

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

// ../base44/functions/checkTreatmentCompliance/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const isStaff = user.role === "admin" || !!user.data?.staff_role;
    if (!isStaff) return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { customer_id, treatment_id, booking_id, action } = body;
    if (!customer_id || !treatment_id) {
      return Response.json({ error: "customer_id och treatment_id kr\xE4vs" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const treatment = await svc.entities.Treatment.get(treatment_id).catch(() => null);
    if (!treatment) return Response.json({ error: "Behandling hittades inte" }, { status: 404 });
    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!customer) return Response.json({ error: "Kund hittades inte" }, { status: 404 });
    if (!canAccessClinic(user, treatment.clinic_id) || !canAccessClinic(user, customer.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const isInjection = treatment.treatment_type === "injektion";
    const checks = [];
    const now = /* @__PURE__ */ new Date();
    const minAge = isInjection ? Math.max(18, treatment.min_age || 0) : treatment.min_age || 0;
    if (minAge > 0) {
      let agePassed = false;
      let ageDetail = "F\xF6delsedatum saknas p\xE5 kunden";
      if (customer.birth_date) {
        const birth = new Date(customer.birth_date);
        const ageMs = now.getTime() - birth.getTime();
        const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1e3));
        agePassed = age >= minAge;
        ageDetail = agePassed ? `${age} \xE5r (krav: ${minAge})` : `${age} \xE5r \u2014 krav \xE4r ${minAge} \xE5r`;
      }
      checks.push({ key: "age", label: `\xC5lderskontroll (${minAge}+ \xE5r)`, passed: agePassed, detail: ageDetail });
    }
    let compliance = null;
    const query = booking_id ? { customer_id, treatment_id, booking_id } : { customer_id, treatment_id };
    const cp = await svc.entities.TreatmentCompliance.filter(query, { sort: "-created_date", limit: 1 });
    if (cp.items && cp.items.length > 0) compliance = cp.items[0];
    if (action === "record_information") {
      const betanketidHours = treatment.betanketid_hours || 0;
      const infoGivenAt = /* @__PURE__ */ new Date();
      const betanketidEndsAt = betanketidHours > 0 ? new Date(infoGivenAt.getTime() + betanketidHours * 36e5) : infoGivenAt;
      let ageOk = true;
      if (minAge > 0 && customer.birth_date) {
        const age = Math.floor((now.getTime() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1e3));
        ageOk = age >= minAge;
      } else if (minAge > 0) {
        ageOk = false;
      }
      const complianceData = {
        customer_id,
        customer_name: customer.name,
        treatment_id,
        treatment_name: treatment.name,
        treatment_type: treatment.treatment_type || "annan",
        booking_id: booking_id || "",
        information_given_at: infoGivenAt.toISOString(),
        information_version: treatment.information_version || "",
        information_given_by: user.full_name || user.email || "",
        betanketid_hours: betanketidHours,
        betanketid_ends_at: betanketidEndsAt.toISOString(),
        consent_eligible_at: betanketidEndsAt.toISOString(),
        age_verified: ageOk,
        age_verified_at: ageOk ? infoGivenAt.toISOString() : "",
        status: betanketidHours > 0 ? "betanketid_active" : "consent_eligible",
        block_reason: ageOk ? "" : `\xC5lderskontroll misslyckades (krav: ${minAge} \xE5r)`,
        clinic_id: treatment.clinic_id || customer.clinic_id || ""
      };
      if (compliance) {
        await base44.entities.TreatmentCompliance.update(compliance.id, complianceData);
        compliance = { ...compliance, ...complianceData };
      } else {
        compliance = await base44.entities.TreatmentCompliance.create(complianceData);
      }
      try {
        await svc.entities.AuditLog.create({
          clinic_id: treatment.clinic_id || customer.clinic_id || "",
          event_type: "compliance_info_given",
          entity_type: "TreatmentCompliance",
          entity_id: compliance.id || "",
          description: `Behandlingsinformation l\xE4mnad till ${customer.name} f\xF6r ${treatment.name}`,
          user_id: user.id,
          user_name: user.full_name || user.email || "",
          metadata: JSON.stringify({ information_version: complianceData.information_version, betanketid_hours: betanketidHours })
        });
      } catch {
      }
    }
    const infoPassed = !!(compliance && compliance.information_given_at);
    checks.push({
      key: "information",
      label: "Behandlingsinformation l\xE4mnad",
      passed: infoPassed,
      detail: infoPassed ? new Date(compliance.information_given_at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }) : 'Ej registrerad \u2014 klicka "Registrera information"'
    });
    if (treatment.betanketid_hours > 0) {
      const betanketidEnds = compliance?.betanketid_ends_at ? new Date(compliance.betanketid_ends_at) : null;
      const betanketidPassed = !!(betanketidEnds && now >= betanketidEnds);
      checks.push({
        key: "betanketid",
        label: `Bet\xE4nketid (${treatment.betanketid_hours}h)`,
        passed: betanketidPassed,
        detail: betanketidEnds ? betanketidPassed ? `Uppfylld sedan ${betanketidEnds.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}` : `Uppfylls ${betanketidEnds.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}` : "Ej startad"
      });
    }
    if (treatment.requires_consent) {
      const consentSigned = compliance?.consent_signed_at ? new Date(compliance.consent_signed_at) : null;
      const consentEligible = compliance?.consent_eligible_at ? new Date(compliance.consent_eligible_at) : null;
      let consentPassed = false;
      let consentDetail = "Ej signerat";
      if (consentSigned && consentEligible) {
        consentPassed = consentSigned >= consentEligible;
        consentDetail = consentPassed ? `Signerat ${consentSigned.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}` : `Signerat F\xD6RE bet\xE4nketidens slut \u2014 ogiltigt`;
      }
      checks.push({
        key: "consent_after_betanketid",
        label: "Samtycke efter bet\xE4nketid",
        passed: consentPassed,
        detail: consentDetail
      });
    }
    if (isInjection && (treatment.repeat_treatment_months || 0) > 0) {
      const months = treatment.repeat_treatment_months;
      const cutoff = new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1e3);
      const prevJournals = await svc.entities.JournalEntry.filter(
        { customer_id, treatment_id, is_signed: true, entry_date: { $gte: cutoff.toISOString() } },
        { sort: "-entry_date", limit: 1 }
      );
      const prevFound = !!(prevJournals.items && prevJournals.items.length);
      const prevDate = prevFound ? prevJournals.items[0].entry_date : null;
      checks.push({
        key: "previous_treatment",
        label: `Kontroll: tidigare behandling (${months} m\xE5n)`,
        passed: true,
        // flaggar men blockerar inte — kliniken måste vara medveten
        detail: prevFound ? `Tidigare behandling ${new Date(prevDate).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })} \u2014 dokumentera upprepning` : `Ingen tidigare behandling inom ${months} m\xE5nader`
      });
      if (compliance && !compliance.previous_treatment_checked) {
        await base44.entities.TreatmentCompliance.update(compliance.id, {
          previous_treatment_checked: true,
          previous_treatment_checked_at: now.toISOString(),
          previous_treatment_found: prevFound,
          previous_treatment_date: prevDate || ""
        }).catch(() => {
        });
      }
    }
    if (treatment.requires_identity_verification) {
      checks.push({
        key: "identity",
        label: "Identitetsverifiering kr\xE4vs",
        passed: false,
        detail: "BankID-verifiering ej implementerad \xE4nnu"
      });
    }
    if (treatment.requires_ordination) {
      checks.push({
        key: "ordination",
        label: "L\xE4karordination kr\xE4vs",
        passed: false,
        detail: "Ordination ej registrerad"
      });
    }
    const blockReasons = checks.filter((c) => !c.passed).map((c) => c.label);
    const eligible = checks.every((c) => c.passed);
    if (compliance && action !== "record_information") {
      const newStatus = eligible ? "consent_eligible" : compliance.information_given_at ? "betanketid_active" : "pending";
      await base44.entities.TreatmentCompliance.update(compliance.id, {
        status: newStatus,
        block_reason: eligible ? "" : blockReasons.join(", ")
      }).catch(() => {
      });
    }
    return Response.json({ eligible, checks, block_reasons: blockReasons, compliance });
  } catch (error) {
    console.error("checkTreatmentCompliance error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
