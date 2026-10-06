globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/cancelPatientBooking/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/waitingList.ts
async function notifyWaitingListOnCancellation(svc, cancelledBooking) {
  if (!cancelledBooking || !cancelledBooking.clinic_id) return 0;
  const clinicId = cancelledBooking.clinic_id;
  const treatmentId = cancelledBooking.treatment_id || "";
  const staffName = cancelledBooking.staff_name || "";
  const slotStart = cancelledBooking.start_time;
  const query = { clinic_id: clinicId, status: "active" };
  if (treatmentId) query.treatment_id = treatmentId;
  const page = await svc.entities.WaitingList.filter(query, { limit: 100, sort: "created_date" });
  const entries = page.items || [];
  let notified = 0;
  for (const entry of entries) {
    if (entry.staff_name && staffName && entry.staff_name !== staffName) continue;
    const slotDate = slotStart ? slotStart.slice(0, 10) : "";
    if (entry.desired_from && slotDate && slotDate < entry.desired_from) continue;
    if (entry.desired_until && slotDate && slotDate > entry.desired_until) continue;
    try {
      await svc.entities.WaitingList.update(entry.id, {
        status: "offered",
        notified_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch {
    }
    if (entry.customer_email) {
      try {
        const fmtTime = (d) => new Date(d).toLocaleString("sv-SE", {
          timeZone: "Europe/Stockholm",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit"
        });
        const clinic = await svc.entities.Clinic.get(clinicId).catch(() => null);
        const clinicName = clinic?.name || "Klinik";
        await svc.integrations.Core.SendEmail({
          to: entry.customer_email,
          subject: `En tid har blivit ledig \u2014 ${entry.treatment_name}`,
          body: [
            `Hej ${entry.customer_name || ""},`,
            ``,
            `En tid f\xF6r ${entry.treatment_name} har blivit ledig${staffName ? ` hos ${staffName}` : ""}.`,
            `Tid: ${fmtTime(slotStart)}`,
            ``,
            `G\xE5 till bokningen f\xF6r att reservera tiden innan n\xE5gon annan g\xF6r det:`,
            ``,
            `V\xE4nliga h\xE4lsningar,`,
            clinicName
          ].join("\n")
        });
      } catch {
      }
    }
    notified += 1;
  }
  return notified;
}

// ../base44/functions/cancelPatientBooking/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { booking_id } = body;
    if (!booking_id) return Response.json({ error: "booking_id kr\xE4vs" }, { status: 400 });
    const email = (user.email || "").toLowerCase().trim();
    if (!email) return Response.json({ error: "No email on account" }, { status: 400 });
    const svc = base44.asServiceRole;
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const custPage = await svc.entities.Customer.filter(
      { email: { $regex: `^${escEmail}$`, $options: "i" } },
      { limit: 1 }
    );
    const customer = (custPage.items || [])[0];
    if (!customer) return Response.json({ error: "Ingen kundprofil hittades" }, { status: 404 });
    const booking = await svc.entities.Booking.get(booking_id);
    if (!booking || booking.customer_id !== customer.id) {
      return Response.json({ error: "Bokningen h\xF6r inte till ditt konto" }, { status: 403 });
    }
    if (["cancelled", "completed", "no_show"].includes(booking.status)) {
      return Response.json({ error: "Bokningen kan inte avbokas" }, { status: 409 });
    }
    const start = new Date(booking.start_time);
    if (start.getTime() < Date.now()) {
      return Response.json({ error: "Bokningen har redan passerat" }, { status: 409 });
    }
    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
    const hoursUntilStart = (start.getTime() - Date.now()) / 36e5;
    const cancellationHours = treatment?.cancellation_hours ?? 24;
    const noShowFee = treatment?.no_show_fee ?? 0;
    const withinCancellationWindow = hoursUntilStart < cancellationHours;
    let feeInfo = null;
    if (withinCancellationWindow && noShowFee > 0) {
      feeInfo = {
        applies: true,
        amount: noShowFee,
        reason: `Avbokning inom ${cancellationHours}h \u2014 avgift om ${noShowFee} kr kan debiteras`
      };
    }
    let depositInfo = null;
    if (booking.deposit_amount > 0 && booking.deposit_paid) {
      if (withinCancellationWindow) {
        depositInfo = { refunded: false, amount: booking.deposit_amount, reason: "Deposition beh\xE5lls \u2014 avbokning inom avbokningsf\xF6nstret" };
      } else {
        depositInfo = { refunded: true, amount: booking.deposit_amount, reason: "Deposition \xE5terbetalas \u2014 avbokning i tid" };
      }
    }
    const updated = await svc.entities.Booking.update(booking_id, { status: "cancelled" });
    try {
      await svc.entities.AuditLog.create({
        clinic_id: booking.clinic_id,
        event_type: "booking_cancellation",
        entity_type: "Booking",
        entity_id: booking_id,
        description: `Avbokning f\xF6r ${booking.customer_name || ""}${feeInfo ? ` \u2014 avgift: ${feeInfo.amount} kr` : ""}`,
        user_id: user.id,
        user_name: user.full_name || user.email || "",
        metadata: JSON.stringify({ feeInfo, depositInfo, hoursUntilStart })
      });
    } catch {
    }
    try {
      await notifyWaitingListOnCancellation(svc, updated);
    } catch {
    }
    return Response.json({ booking: updated, feeInfo, depositInfo });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
