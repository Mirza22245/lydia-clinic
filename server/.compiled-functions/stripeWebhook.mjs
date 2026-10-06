globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/stripeWebhook/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";
import { secrets } from "/app/server/src/runtime/secrets-shim.js";

// ../base44/shared/receipt.ts
var methodLabels = {
  card: "Kort",
  swish: "Swish",
  cash: "Kontant",
  invoice: "Faktura"
};
var fmtDateTime = (d) => d ? new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
var fmtSEK = (n) => new Intl.NumberFormat("sv-SE").format(n || 0);
async function sendReceiptForPayment(svc, paymentId) {
  const payment = await svc.entities.Payment.get(paymentId);
  if (!payment) throw new Error("Payment not found");
  let email = "";
  let customerName = payment.customer_name || "";
  if (payment.customer_id) {
    const customer = await svc.entities.Customer.get(payment.customer_id).catch(() => null);
    if (customer) {
      email = customer.email || "";
      customerName = customer.name || customerName;
    }
  }
  if (!email) throw new Error("Customer has no email");
  let clinicName = "Klinik";
  let clinicAddress = "";
  let clinicOrgNumber = "";
  let clinicPhone = "";
  let clinicEmail = "";
  if (payment.clinic_id) {
    const clinic = await svc.entities.Clinic.get(payment.clinic_id).catch(() => null);
    if (clinic) {
      clinicName = clinic.name || clinicName;
      clinicAddress = clinic.address || "";
      clinicOrgNumber = clinic.org_number || "";
      clinicPhone = clinic.phone || "";
      clinicEmail = clinic.email || "";
    }
  }
  await svc.integrations.Core.SendEmail({
    to: email,
    template_name: "Receipt",
    variables: {
      customer_name: customerName,
      treatment_name: payment.treatment_name || "",
      receipt_number: payment.receipt_number || "",
      amount: fmtSEK(payment.amount),
      vat: fmtSEK(payment.vat),
      method: methodLabels[payment.method] || payment.method || "",
      paid_at: fmtDateTime(payment.paid_at),
      clinic_name: clinicName,
      clinic_address: clinicAddress,
      clinic_org_number: clinicOrgNumber,
      clinic_phone: clinicPhone,
      clinic_email: clinicEmail
    }
  });
  return { sent: true, to: email };
}

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

// ../base44/functions/stripeWebhook/entry.ts
async function verifySignature(rawBody, sigHeader, secret) {
  const parts = (sigHeader || "").split(",").map((s) => s.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !v1Part) return null;
  const t = tPart.slice(2);
  const v1 = v1Part.slice(3);
  const signed = `${t}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signed));
  const expected = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== v1.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0 ? Number(t) : null;
}
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const sig = req.headers.get("stripe-signature") || "";
    const secret = secrets.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) {
      return Response.json({ error: "Webhook-secret saknas" }, { status: 500 });
    }
    const rawBody = await req.text();
    const ts = await verifySignature(rawBody, sig, secret);
    if (!ts) {
      return Response.json({ error: "Ogiltig signatur" }, { status: 400 });
    }
    const event = JSON.parse(rawBody);
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const bookingId = pi.metadata?.booking_id;
      const clinicId = pi.metadata?.clinic_id || "";
      const customerName = pi.metadata?.customer_name || "";
      const amount = (pi.amount_received ?? pi.amount) / 100;
      if (bookingId) {
        const booking = await svc.entities.Booking.get(bookingId).catch(() => null);
        const treatmentName = booking?.treatment_name || "";
        const customerId = booking?.customer_id || "";
        const existing = await svc.entities.Payment.filter(
          { booking_id: bookingId, status: "paid" },
          { limit: 1 }
        );
        if (!(existing.items || []).length) {
          const year = (/* @__PURE__ */ new Date()).getFullYear();
          const countRes = await svc.entities.Payment.count({ clinic_id: clinicId });
          const seq = (countRes + 1).toString().padStart(4, "0");
          const vatRate = 25;
          const created = await svc.entities.Payment.create({
            customer_id: customerId,
            customer_name: customerName,
            booking_id: bookingId,
            treatment_name: treatmentName,
            amount,
            vat: Math.round(amount * vatRate / (100 + vatRate)),
            vat_rate: vatRate,
            method: "card",
            status: "paid",
            paid_at: (/* @__PURE__ */ new Date()).toISOString(),
            receipt_number: `R-${year}-${seq}`,
            clinic_id: clinicId
          });
          if (booking) {
            const patch = { deposit_paid: (booking.deposit_amount || 0) > 0 };
            if (booking.status === "pending") {
              const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
              const check = await computeBookingRequirements(svc, booking, treatment);
              if (!treatment || check.enforceableCount === 0 || check.allCompleted) patch.status = "confirmed";
            }
            await svc.entities.Booking.update(bookingId, patch);
          }
          await sendReceiptForPayment(svc, created.id).catch((e) => {
            console.error("Receipt email failed:", e.message);
          });
        }
      }
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const bookingId = charge.metadata?.booking_id;
      if (bookingId) {
        await svc.entities.Payment.updateMany(
          { booking_id: bookingId, status: "paid" },
          { $set: { status: "refunded" } }
        ).catch(() => {
        });
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("stripeWebhook:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
