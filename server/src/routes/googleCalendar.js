// Google Calendar-rutter — speglar syncGoogleCalendar
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";

const router = Router();

router.post("/sync", async (req, res) => {
  try {
    const { booking_id, action } = req.body;
    if (!booking_id || !action) return res.status(400).json({ error: "booking_id och action krävs" });

    // Hämta Google OAuth token från user.data
    const accessToken = req.user?.data?.google_calendar_token;
    if (!accessToken) return res.status(503).json({ error: "Google Calendar inte ansluten" });

    const booking = await db.get("bookings", booking_id, req.user.clinic_id);
    if (!booking) return res.status(404).json({ error: "Bokning saknas" });

    const event = {
      summary: booking.treatment_name + " — " + booking.customer_name,
      description: "Bokning i Lydia\nBehandling: " + booking.treatment_name + "\nKund: " + booking.customer_name,
      start: { dateTime: booking.start_time, timeZone: "Europe/Stockholm" },
      end: { dateTime: booking.end_time, timeZone: "Europe/Stockholm" },
    };

    const calApi = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    let result;

    if (action === "create") {
      const r = await fetch(calApi, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      result = await r.json();
      if (result.id) await db.update("bookings", booking_id, { calendar_event_id: result.id }, req.user.clinic_id);
    } else if (action === "cancel" && booking.calendar_event_id) {
      await fetch(calApi + "/" + booking.calendar_event_id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + accessToken },
      });
      await db.update("bookings", booking_id, { calendar_event_id: "" }, req.user.clinic_id);
      result = { cancelled: true };
    }

    await recordAudit(req, {
      event_type: "google_calendar_sync",
      entity_type: "Booking",
      entity_id: booking_id,
      description: "Google Calendar: " + action,
    });

    res.json({ ok: true, event: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;