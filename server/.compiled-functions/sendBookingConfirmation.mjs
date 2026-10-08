globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/sendBookingConfirmation/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// base44/shared/authz.ts
function getUserClinicId(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function getStaffRole(user) {
  if (user?.role === "admin") return "administrat\xF6r";
  const v = user?.staff_role ?? user?.data?.staff_role ?? null;
  return v && String(v).trim() ? String(v) : null;
}
function isPlatformAdmin(user) {
  return user?.role === "admin" && !getUserClinicId(user);
}
function isStaff(user) {
  return isPlatformAdmin(user) || !!getStaffRole(user);
}
function canAccessClinic(user, recordClinicId) {
  if (isPlatformAdmin(user)) return true;
  const userClinic = getUserClinicId(user);
  const rec = recordClinicId && String(recordClinicId).trim() ? String(recordClinicId) : null;
  if (!userClinic || !rec) return false;
  return userClinic === rec;
}
function requireStaff(user) {
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isStaff(user)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

// base44/functions/sendBookingConfirmation/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const bookingId = body.booking_id;
    if (!bookingId) return Response.json({ error: "booking_id required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(bookingId);
    if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });
    if (!requireStaff(user).ok || !canAccessClinic(user, booking.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    let email = "";
    let customerName = booking.customer_name || "";
    if (booking.customer_id) {
      const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
      if (customer) {
        email = customer.email || "";
        customerName = customer.name || customerName;
      }
    }
    if (!email) return Response.json({ error: "Customer has no email" }, { status: 400 });
    let clinicName = "Klinik";
    if (booking.clinic_id) {
      const clinic = await svc.entities.Clinic.get(booking.clinic_id).catch(() => null);
      if (clinic) clinicName = clinic.name || clinicName;
    }
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const baseUrl = host ? `${proto}://${host}` : "";
    const portalUrl = baseUrl ? `${baseUrl}/portal` : "";
    const fmtTime = (d) => d ? new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    await svc.integrations.Core.SendEmail({
      to: email,
      template_name: "BookingConfirmation",
      variables: {
        customer_name: customerName,
        treatment_name: booking.treatment_name || "",
        staff_name: booking.staff_name || "",
        start_time: fmtTime(booking.start_time),
        price: String(booking.price ?? ""),
        portal_url: portalUrl,
        clinic_name: clinicName
      }
    });
    return Response.json({ sent: true, to: email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
