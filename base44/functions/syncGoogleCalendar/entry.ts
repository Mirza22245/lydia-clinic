import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { recordAudit } from "../../shared/audit.ts";

// Synkar bokningar till personalens Google Calendar.
// Kräver Google Calendar-connector (app-user mode).
// Feature flag 'google_calendar' måste vara enabled.
//
// Body: { booking_id, action }
//   action: "create" | "update" | "cancel"
//
// Skapar/uppdaterar/tar bort en kalenderhändelse i den inloggade
// behandlarens primära Google Calendar och sparar calendar_event_id på bokningen.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { booking_id, action } = body;
    if (!booking_id || !action) {
      return Response.json({ error: "booking_id och action krävs" }, { status: 400 });
    }

    // Kontrollera om Google Calendar-connector är ansluten
    let connection;
    try {
      connection = await base44.asServiceRole.connectors.getConnection("googlecalendar");
    } catch {
      return Response.json(
        { error: "Google Calendar inte ansluten. Aktivera via Inställningar." },
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

    // Klinikisolering
    const userClinicId = user?.clinic_id ?? user?.data?.clinic_id ?? null;
    if (booking.clinic_id && userClinicId && booking.clinic_id !== userClinicId) {
      return Response.json({ error: "Åtkomst nekad" }, { status: 403 });
    }

    const event = {
      summary: `${booking.treatment_name} — ${booking.customer_name}`,
      description: [
        `Bokning i Lydia`,
        `Behandling: ${booking.treatment_name}`,
        `Kund: ${booking.customer_name}`,
        booking.staff_name ? `Behandlare: ${booking.staff_name}` : "",
      ].filter(Boolean).join("\n"),
      start: { dateTime: booking.start_time, timeZone: "Europe/Stockholm" },
      end: { dateTime: booking.end_time, timeZone: "Europe/Stockholm" },
    };

    const calApi = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    let result;

    if (action === "create") {
      const res = await fetch(calApi, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
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
        // Ingen event ännu — skapa istället
        const res = await fetch(calApi, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
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
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });
        result = await res.json();
      }
    } else if (action === "cancel") {
      if (booking.calendar_event_id) {
        await fetch(`${calApi}/${booking.calendar_event_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${connection.accessToken}` },
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
      description: `Google Calendar: ${action} för ${booking.customer_name}`,
      metadata: { action, calendar_event_id: result?.id || "" },
    });

    return Response.json({ ok: true, event: result });
  } catch (error) {
    console.error("syncGoogleCalendar:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}