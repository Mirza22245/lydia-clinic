globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/submitHealthDeclarationConsent/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const {
      name,
      personnummer,
      phone,
      email,
      booking_id,
      treatment_type,
      treatment_type_other,
      treatment_name,
      pregnant_breastfeeding,
      skin_infection,
      blood_thinning,
      neuromuscular,
      previous_reactions,
      strong_skincare,
      betanketid_acknowledged,
      risks_acknowledged,
      photo_consent,
      signature
    } = body;
    if (!name || !treatment_type || !signature) {
      return Response.json({ error: "Namn, behandlingstyp och signatur kr\xE4vs" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const customerPage = await svc.entities.Customer.filter(
      { email: user.email },
      { limit: 1 }
    );
    const customer = (customerPage.items || [])[0];
    if (!customer) {
      return Response.json({ error: "Kundprofil hittades inte" }, { status: 404 });
    }
    const clinic_id = customer.clinic_id || "";
    let treatmentName = "";
    if (booking_id) {
      const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
      if (!booking || booking.customer_id !== customer.id || booking.clinic_id !== clinic_id) {
        return Response.json({ error: "Bokningen h\xF6r inte till ditt patientkonto" }, { status: 403 });
      }
      treatmentName = booking.treatment_name || "";
    }
    const informationGivenAt = /* @__PURE__ */ new Date();
    const waitingPeriodUntil = treatment_type === "injektion" ? new Date(informationGivenAt.getTime() + 48 * 60 * 60 * 1e3) : null;
    const structuredAnswers = {
      personnummer,
      phone,
      email,
      treatment_type,
      treatment_type_other: treatment_type_other || "",
      treatment_name: treatmentName || treatment_name || "",
      information_given_at: informationGivenAt.toISOString(),
      waiting_period_until: waitingPeriodUntil?.toISOString() || null,
      form_version: "aesthetic-1.0",
      pregnant_breastfeeding,
      skin_infection,
      blood_thinning,
      neuromuscular,
      previous_reactions,
      strong_skincare,
      betanketid_acknowledged,
      risks_acknowledged,
      photo_consent,
      signature_present: !!signature,
      submitted_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const healthDecl = await base44.entities.HealthDeclaration.create({
      customer_id: customer.id,
      customer_name: customer.name,
      booking_id: booking_id || void 0,
      treatment_name: treatmentName || treatment_name || void 0,
      treatment_category: ["filler", "botox", "injektion"].includes(treatment_type) ? treatment_type : treatment_type || "annan",
      information_given_at: informationGivenAt.toISOString(),
      waiting_period_until: waitingPeriodUntil?.toISOString(),
      form_version: "aesthetic-1.0",
      submitted_at: (/* @__PURE__ */ new Date()).toISOString(),
      submitted_by: customer.name,
      status: "submitted",
      pregnant: pregnant_breastfeeding === true,
      breastfeeding: pregnant_breastfeeding === true,
      skin_condition: skin_infection === true,
      conditions: neuromuscular === true ? "Neuromuskul\xE4r sjukdom, keloidbildning eller nedsatt immunf\xF6rsvar" : void 0,
      allergies: previous_reactions === true ? "Tidigare reaktion p\xE5 fillers/botox/bed\xF6vning/laser" : void 0,
      medications: blood_thinning === true ? "Blodf\xF6rtunnande mediciner" : void 0,
      other: JSON.stringify(structuredAnswers),
      clinic_id
    });
    const treatmentTypeLabel = {
      filler: "Fillers",
      botox: "Botox / botulinumtoxin",
      injektion: "Annan injektionsbehandling",
      hudvard: "Avancerad hudv\xE5rd / CO2-laser / Peeling",
      apparat: "Apparatbehandling (HIFU / Radiofrekvens / Fettreducering)",
      annan: `Annan behandling: ${treatment_type_other || ""}`
    }[treatment_type] || treatment_type;
    const consentText = [
      "Jag intygar att ovanst\xE5ende h\xE4lsouppgifter \xE4r korrekta och fullst\xE4ndiga.",
      "Jag har tagit del av informationen inf\xF6r behandlingen och f\xF6rst\xE5r att slutligt behandlingssamtycke l\xE4mnas f\xF6rst efter bet\xE4nketiden.",
      "",
      `Behandlingstyp: ${treatmentTypeLabel}`,
      `Bet\xE4nketid: ${betanketid_acknowledged ? "Bekr\xE4ftad" : "Ej aktuellt"}`,
      `Risker & biverkningar: ${risks_acknowledged ? "Bekr\xE4ftad" : "Ej bekr\xE4ftad"}`,
      `Fotodokumentation: ${photo_consent ? "Godk\xE4nd" : "Ej godk\xE4nd"}`
    ].join("\n");
    const encoder = new TextEncoder();
    const hashData = encoder.encode(consentText + signature + (/* @__PURE__ */ new Date()).toISOString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signatureHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const treatmentConsent = await base44.entities.Consent.create({
      customer_id: customer.id,
      customer_name: customer.name,
      type: "treatment",
      version: 1,
      text: consentText,
      granted: false,
      granted_at: void 0,
      granted_by: void 0,
      signed_text: void 0,
      booking_id: booking_id || void 0,
      waiting_period_until: waitingPeriodUntil?.toISOString(),
      signature_hash: void 0,
      ip_address: req.headers.get("x-forwarded-for") || "",
      device_info: req.headers.get("user-agent") || "",
      clinic_id
    });
    let photoConsentRecord = null;
    if (photo_consent) {
      const photoText = "Jag godk\xE4nner att f\xF6re/efter-bilder tas f\xF6r dokumentation i min patientjournal.";
      const photoHashData = encoder.encode(photoText + signature + (/* @__PURE__ */ new Date()).toISOString());
      const photoHashBuffer = await crypto.subtle.digest("SHA-256", photoHashData);
      const photoHashArray = Array.from(new Uint8Array(photoHashBuffer));
      const photoHash = photoHashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      photoConsentRecord = await base44.entities.Consent.create({
        customer_id: customer.id,
        customer_name: customer.name,
        type: "photography",
        version: 1,
        text: photoText,
        granted: true,
        granted_at: (/* @__PURE__ */ new Date()).toISOString(),
        granted_by: customer.name,
        signed_text: photoText,
        signature_hash: photoHash,
        ip_address: req.headers.get("x-forwarded-for") || "",
        device_info: req.headers.get("user-agent") || "",
        clinic_id
      });
    }
    try {
      await svc.entities.AuditLog.create({
        clinic_id,
        event_type: "health_declaration_submit",
        entity_type: "HealthDeclaration",
        entity_id: healthDecl.id,
        description: `H\xE4lsodeklaration och samtycke inl\xE4mnat av ${customer.name} (${treatmentTypeLabel})`,
        user_id: user.id,
        user_name: customer.name,
        metadata: JSON.stringify({
          treatment_type,
          booking_id: booking_id || null,
          photo_consent: !!photo_consent,
          consent_id: treatmentConsent.id
        })
      });
    } catch {
    }
    return Response.json({
      healthDeclaration: healthDecl,
      treatmentConsent,
      photoConsent: photoConsentRecord
    });
  } catch (error) {
    console.error("submitHealthDeclarationConsent error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
