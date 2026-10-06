globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/syncGoogleCalendar/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// ../base44/shared/audit.ts
async function recordAudit(base44, evt) {
  try {
    const user = await base44.auth.me();
    const clinicId = evt.clinic_id || getUserClinicIdSafe(user);
    await base44.asServiceRole.entities.AuditLog.create({
      event_type: evt.event_type,
      entity_type: evt.entity_type,
      entity_id: evt.entity_id || "",
      description: (evt.description || "").slice(0, 500),
      user_id: user?.id || "",
      user_name: user?.full_name || user?.email || "",
      metadata: evt.metadata ? JSON.stringify(evt.metadata).slice(0, 4e3) : "",
      clinic_id: clinicId || ""
    });
  } catch {
  }
}
function getUserClinicIdSafe(user) {
  const v = user?.clinic_id ?? user?.data?.clinic_id ?? null;
  return v && String(v).trim() ? String(v) : null;
}

// ../base44/shared/authz.ts
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

// ../base44/functions/syncGoogleCalendar/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { booking_id, action } = body;
    if (!booking_id || !action) {
      return Response.json({ error: "booking_id och action kr\xE4vs" }, { status: 400 });
    }
    let connection;
    try {
      connection = await base44.asServiceRole.connectors.getConnection("googlecalendar");
    } catch {
      return Response.json(
        { error: "Google Calendar inte ansluten. Aktivera via Inst\xE4llningar." },
        { status: 503 }
      );
    }
    if (!connection?.accessToken) {
      return Response.json(
        { error: "Google Calendar inte ansluten" },
        { status: 503 }
      );
    }
    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
    if (!booking) return Response.json({ error: "Bokning saknas" }, { status: 404 });
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (!requireStaff(user).ok || !canAccessClinic(user, booking.clinic_id)) {
      return Response.json({ error: "\xC5tkomst nekad" }, { status: 403 });
    }
    const event = {
      summary: `${booking.treatment_name} \u2014 ${booking.customer_name}`,
      description: [
        `Bokning i Lydia`,
        `Behandling: ${booking.treatment_name}`,
        `Kund: ${booking.customer_name}`,
        booking.staff_name ? `Behandlare: ${booking.staff_name}` : ""
      ].filter(Boolean).join("\n"),
      start: { dateTime: booking.start_time, timeZone: "Europe/Stockholm" },
      end: { dateTime: booking.end_time, timeZone: "Europe/Stockholm" }
    };
    const calApi = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    let result;
    if (action === "create") {
      const res = await fetch(calApi, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(event)
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ error: `Google Calendar error: ${err}` }, { status: 502 });
      }
      result = await res.json();
      if (result.id) {
        await svc.entities.Booking.update(booking_id, { calendar_event_id: result.id });
      }
    } else if (action === "update") {
      if (!booking.calendar_event_id) {
        const res = await fetch(calApi, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(event)
        });
        result = await res.json();
        if (result.id) {
          await svc.entities.Booking.update(booking_id, { calendar_event_id: result.id });
        }
      } else {
        const res = await fetch(`${calApi}/${booking.calendar_event_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(event)
        });
        result = await res.json();
      }
    } else if (action === "cancel") {
      if (booking.calendar_event_id) {
        await fetch(`${calApi}/${booking.calendar_event_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${connection.accessToken}` }
        });
        await svc.entities.Booking.update(booking_id, { calendar_event_id: "" });
      }
      result = { cancelled: true };
    } else {
      return Response.json({ error: "Ogiltig action" }, { status: 400 });
    }
    await recordAudit(base44, {
      event_type: "google_calendar_sync",
      entity_type: "Booking",
      entity_id: booking_id,
      description: `Google Calendar: ${action} f\xF6r ${booking.customer_name}`,
      metadata: { action, calendar_event_id: result?.id || "" }
    });
    return Response.json({ ok: true, event: result });
  } catch (error) {
    console.error("syncGoogleCalendar:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
