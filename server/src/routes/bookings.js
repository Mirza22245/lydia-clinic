// Bokningsrutter — speglar createPublicBooking, getAvailableSlots, getBookingRequirements,
// updateBookingStatus, cancelPatientBooking, rescheduleBooking
import { Router } from "express";
import { db } from "../db/client.js";
import { recordAudit } from "../lib/audit.js";
import { sendEmail } from "../lib/email.js";

const router = Router();

// Skapa publik bokning (utan auth — används från WordPress-länkad bokningssida)
router.post("/", async (req, res) => {
  try {
    const { treatment_id, customer_name, customer_email, customer_phone, start_time, staff_name } = req.body;

    // Hämta behandling
    const treatment = await db.get("treatments", treatment_id, req.body.clinic_id);
    if (!treatment) return res.status(404).json({ error: "Behandling saknas" });

    // Validera ålder (18+ för injektioner)
    if (treatment.treatment_type === "injektion") {
      // TODO: kontrollera kundens ålder från personnummer/födelsedatum
    }

    // Validera väntetid
    if (treatment.waiting_period_days > 0) {
      const earliest = new Date();
      earliest.setDate(earliest.getDate() + treatment.waiting_period_days);
      if (new Date(start_time) < earliest) {
        return res.status(400).json({ error: `Tidigaste bokning är ${earliest.toLocaleDateString("sv-SE")}` });
      }
    }

    // Kontrollera dubbelbokning
    const existing = await db.filter("bookings", {
      staff_name,
      start_time: { $gte: start_time },
      status: { $ne: "cancelled" },
    }, { limit: 1, clinicId: treatment.clinic_id });
    if (existing.items.length) {
      return res.status(409).json({ error: "Tiden är redan bokad" });
    }

    // Find-or-create customer
    let customer = null;
    if (customer_email) {
      const custRes = await db.filter("customers", { email: customer_email }, { limit: 1, clinicId: treatment.clinic_id });
      customer = custRes.items[0];
    }
    if (!customer) {
      customer = await db.create("customers", {
        name: customer_name,
        email: customer_email,
        phone: customer_phone,
        status: "active",
        clinic_id: treatment.clinic_id,
      }, treatment.clinic_id);
    }

    const end = new Date(start_time);
    end.setMinutes(end.getMinutes() + (treatment.duration || 30));

    const booking = await db.create("bookings", {
      customer_id: customer.id,
      customer_name: customer.name,
      treatment_id: treatment.id,
      treatment_name: treatment.name,
      staff_name,
      start_time,
      end_time: end.toISOString(),
      status: "pending",
      price: treatment.price,
      room_id: treatment.room_id || "",
      deposit_amount: treatment.deposit_amount || 0,
      clinic_id: treatment.clinic_id,
    }, treatment.clinic_id);

    // Auto-skapa placeholder-journal
    await db.create("journal_entries", {
      customer_id: customer.id,
      customer_name: customer.name,
      treatment_id: treatment.id,
      treatment_name: treatment.name,
      booking_id: booking.id,
      provider: staff_name,
      entry_date: start_time,
      notes: "Väntar på behandling",
      is_signed: false,
      version: 1,
      clinic_id: treatment.clinic_id,
    }, treatment.clinic_id);

    // Skicka bekräftelse (best-effort)
    if (customer.email) {
      await sendEmail({
        to: customer.email,
        template_name: "BookingConfirmation",
        variables: {
          customer_name: customer.name,
          treatment_name: treatment.name,
          booking_date: new Date(start_time).toLocaleDateString("sv-SE"),
          booking_time: new Date(start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
          staff_name: staff_name || "",
        },
      }).catch(() => {});
    }

    res.json({ booking, customer });
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Hämta tillgängliga tider
router.get("/slots", async (req, res) => {
  try {
    const { treatment_id, date, staff_name } = req.query;
    const treatment = await db.get("treatments", treatment_id, req.user?.clinic_id);
    if (!treatment) return res.status(404).json({ error: "Behandling saknas" });

    // Hämta befintliga bokningar för dagen
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const bookings = await db.filter("bookings", {
      staff_name,
      start_time: { $gte: dayStart.toISOString(), $lt: dayEnd.toISOString() },
      status: { $ne: "cancelled" },
    }, { limit: 100, clinicId: treatment.clinic_id });

    // Hämta personalens schema
    const dayOfWeek = dayStart.getDay();
    const schedules = await db.filter("staff_schedules", {
      staff_name,
      day_of_week: dayOfWeek,
    }, { limit: 10, clinicId: treatment.clinic_id });

    // Hämta frånvaro
    const timeOff = await db.filter("staff_time_off", {
      staff_name,
      start_date: { $lte: dayStart.toISOString() },
      end_date: { $gte: dayEnd.toISOString() },
    }, { limit: 10, clinicId: treatment.clinic_id });

    // Beräkna tillgängliga slots (förenklat)
    const slots = [];
    for (const sched of schedules.items) {
      const [sh, sm] = sched.start_time.split(":").map(Number);
      const [eh, em] = sched.end_time.split(":").map(Number);
      let slotStart = new Date(date);
      slotStart.setHours(sh, sm, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(eh, em, 0, 0);

      while (slotStart < slotEnd) {
        const slotEndTime = new Date(slotStart.getTime() + (treatment.duration + (treatment.buffer_after || 0)) * 60000);
        const conflict = bookings.items.some((b) => {
          const bs = new Date(b.start_time);
          const be = new Date(b.end_time);
          return slotStart < be && slotEndTime > bs;
        });
        if (!conflict && slotStart > new Date()) {
          slots.push(slotStart.toISOString());
        }
        slotStart = new Date(slotEndTime.getTime() + (treatment.buffer_before || 0) * 60000);
      }
    }

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Uppdatera bokningsstatus (med kravkontroll)
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await db.get("bookings", req.params.id, req.user.clinic_id);
    if (!booking) return res.status(404).json({ error: "Bokning saknas" });

    // Blockera bekräftelse om krav saknas
    const advancingStatuses = ["confirmed", "checked_in", "completed"];
    if (advancingStatuses.includes(status)) {
      // TODO: kontrollera krav via bookingRequirements-logik
      // Returnera 400 med code: requirements_incomplete om krav saknas
    }

    const updated = await db.update("bookings", booking.id, { status }, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "booking_status_change",
      entity_type: "Booking",
      entity_id: booking.id,
      description: `Bokning för ${booking.customer_name} ändrad till ${status}`,
    });
    res.json({ booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Avboka bokning
router.post("/:id/cancel", async (req, res) => {
  try {
    const booking = await db.get("bookings", req.params.id, req.user.clinic_id);
    if (!booking) return res.status(404).json({ error: "Bokning saknas" });

    const updated = await db.update("bookings", booking.id, { status: "cancelled" }, req.user.clinic_id);
    await recordAudit(req, {
      event_type: "booking_cancelled",
      entity_type: "Booking",
      entity_id: booking.id,
      description: `Bokning avbokad för ${booking.customer_name}`,
    });

    if (req.body.customer_email) {
      await sendEmail({
        to: req.body.customer_email,
        template_name: "BookingCancellation",
        variables: {
          customer_name: booking.customer_name,
          treatment_name: booking.treatment_name,
          booking_date: new Date(booking.start_time).toLocaleDateString("sv-SE"),
          booking_time: new Date(booking.start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
          staff_name: booking.staff_name || "",
        },
      }).catch(() => {});
    }

    res.json({ booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;