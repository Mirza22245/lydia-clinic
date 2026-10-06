globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/rescheduleBooking/entry.ts
import { createClientFromRequest } from "/app/server/src/runtime/sdk-shim.js";

// ../base44/shared/availability.ts
var CLINIC_TZ = "Europe/Stockholm";
function tzOffsetMs(epoch) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(epoch))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epoch / 1e3) * 1e3;
}
function zonedToEpoch(date, hhmm) {
  const [y, mo, d] = date.split("-").map((x) => parseInt(x, 10));
  const [h, mi] = hhmm.split(":").map((x) => parseInt(x, 10));
  const guess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
  const off1 = tzOffsetMs(guess);
  let t = guess - off1;
  const off2 = tzOffsetMs(t);
  if (off2 !== off1) t = guess - off2;
  return t;
}
function clinicDateOf(ms) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function nextDate(date) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
}
function parseHHmmToEpoch(date, hhmm) {
  return zonedToEpoch(date, hhmm);
}
function overlaps(a, b) {
  return a.start < b.end && a.end > b.start;
}
function subtractIntervals(base, remove) {
  let result = [...base];
  for (const r of remove) {
    const next = [];
    for (const b of result) {
      if (!overlaps(b, r)) {
        next.push(b);
        continue;
      }
      if (r.start > b.start) next.push({ start: b.start, end: r.start });
      if (r.end < b.end) next.push({ start: r.end, end: b.end });
    }
    result = next;
  }
  return result;
}
function isSlotFree(input, candidateStartMs) {
  const now = input.now ?? Date.now();
  const bufBefore = (input.bufferBeforeMin ?? 0) * 6e4;
  const bufAfter = (input.bufferAfterMin ?? 0) * 6e4;
  const durMs = input.durationMin * 6e4;
  const minLeadMs = (input.minLeadHours ?? 0) * 36e5;
  const maxLeadMs = (input.maxLeadDays ?? 0) * 864e5;
  const requireRoomId = input.requireRoomId || void 0;
  const requireResourceIds = (input.requireResourceIds || []).filter(Boolean);
  if (candidateStartMs < now + minLeadMs) return false;
  if (maxLeadMs > 0 && candidateStartMs > now + maxLeadMs) return false;
  const slotEnd = candidateStartMs + durMs;
  const blockIv = { start: candidateStartMs - bufBefore, end: slotEnd + bufAfter };
  const working = input.schedule.filter((s) => s.start_time && s.end_time).map((s) => ({ start: parseHHmmToEpoch(input.date, s.start_time), end: parseHHmmToEpoch(input.date, s.end_time) })).filter((iv) => iv.end > iv.start);
  const available = subtractIntervals(working, input.timeOff);
  const inWork = available.some((iv) => candidateStartMs >= iv.start && slotEnd <= iv.end);
  if (!inWork) return false;
  if (input.staffBookings.some((b) => overlaps(blockIv, b))) return false;
  if (requireRoomId && input.roomBookings.some((b) => overlaps(blockIv, b))) return false;
  for (const rid of requireResourceIds) {
    const qty = input.resourceQuantities[rid] ?? 1;
    const overlapping = input.resourceBookings.filter(
      (rb) => rb.resource_id === rid && overlaps(blockIv, rb.interval)
    ).length;
    if (overlapping >= qty) return false;
  }
  return true;
}
async function fetchAvailabilityData(svc, params) {
  const { clinic_id, staff_name, date } = params;
  const requireResourceIds = (params.requireResourceIds || []).filter(Boolean);
  const dayStart = new Date(zonedToEpoch(date, "00:00"));
  const dayEnd = new Date(zonedToEpoch(nextDate(date), "00:00") - 1);
  const weekday = (/* @__PURE__ */ new Date(`${date}T12:00:00Z`)).getUTCDay();
  const notExcluded = (b) => !params.excludeBookingId || b.id !== params.excludeBookingId;
  const toIv = (b) => ({
    start: new Date(b.start_time).getTime(),
    end: b.end_time ? new Date(b.end_time).getTime() : new Date(b.start_time).getTime() + (b.duration || 30) * 6e4
  });
  const schedPage = await svc.entities.StaffSchedule.filter(
    { clinic_id, staff_name, day_of_week: weekday },
    { limit: 50 }
  );
  const schedule = (schedPage.items || []).filter((s) => {
    if (!s.start_time || !s.end_time) return false;
    if (s.effective_from && date < s.effective_from) return false;
    if (s.effective_until && date > s.effective_until) return false;
    return true;
  });
  const offPage = await svc.entities.StaffTimeOff.filter(
    { clinic_id, staff_name, start: { $lte: dayEnd.toISOString() }, end: { $gte: dayStart.toISOString() } },
    { limit: 100 }
  );
  const timeOff = (offPage.items || []).map((o) => ({
    start: new Date(o.start).getTime(),
    end: new Date(o.end).getTime()
  }));
  const bookPage = await svc.entities.Booking.filter(
    {
      clinic_id,
      staff_name,
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
      status: { $nin: ["cancelled", "no_show"] }
    },
    { sort: "start_time", limit: 200 }
  );
  const staffBookings = (bookPage.items || []).filter(notExcluded).map(toIv);
  let roomBookings = [];
  if (params.requireRoomId) {
    const roomPage = await svc.entities.Booking.filter(
      {
        clinic_id,
        room_id: params.requireRoomId,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ["cancelled", "no_show"] }
      },
      { limit: 200 }
    );
    roomBookings = (roomPage.items || []).filter(notExcluded).map(toIv);
  }
  let resourceBookings = [];
  let resourceQuantities = {};
  if (requireResourceIds.length > 0) {
    const resPage = await svc.entities.Booking.filter(
      {
        clinic_id,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ["cancelled", "no_show"] }
      },
      { limit: 300 }
    );
    for (const b of resPage.items || []) {
      if (!notExcluded(b)) continue;
      const ids = parseResourceIds(b.resource_ids);
      const iv = toIv(b);
      for (const rid of ids) {
        if (requireResourceIds.includes(rid)) {
          resourceBookings.push({ resource_id: rid, interval: iv });
        }
      }
    }
    const resQtyPage = await svc.entities.Resource.filter(
      { clinic_id, id: { $in: requireResourceIds } },
      { limit: 50 }
    );
    for (const r of resQtyPage.items || []) {
      resourceQuantities[r.id] = r.quantity || 1;
    }
  }
  return { schedule, timeOff, staffBookings, roomBookings, resourceBookings, resourceQuantities };
}
function parseResourceIds(raw) {
  try {
    const ids = JSON.parse(raw || "[]");
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
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

// ../base44/shared/staffCompetence.ts
function parseAllowedTreatments(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}
function canPerformTreatment(staff, treatmentId) {
  const allowed = parseAllowedTreatments(staff?.allowed_treatment_ids);
  return allowed === null ? true : allowed.includes(String(treatmentId));
}
async function checkStaffBookable(svc, params) {
  const { clinic_id, staff_name, treatment_id } = params;
  const page = await svc.entities.Staff.filter({ clinic_id, name: staff_name }, { limit: 5 });
  const staff = (page.items || []).find((s) => s.active !== false);
  if (!staff) {
    return { ok: false, status: 400, code: "staff_unavailable", error: "Behandlaren finns inte eller \xE4r inte aktiv." };
  }
  if (!canPerformTreatment(staff, treatment_id)) {
    return {
      ok: false,
      status: 403,
      code: "staff_not_authorized",
      error: "Den valda behandlaren \xE4r inte beh\xF6rig att utf\xF6ra den h\xE4r behandlingen."
    };
  }
  return { ok: true, staff };
}

// ../base44/functions/rescheduleBooking/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { booking_id, new_start_time } = body;
    if (!booking_id || !new_start_time) {
      return Response.json({ error: "booking_id och new_start_time kr\xE4vs" }, { status: 400 });
    }
    const svc = base44.asServiceRole;
    const booking = await svc.entities.Booking.get(booking_id).catch(() => null);
    if (!booking) return Response.json({ error: "Bokning hittades inte" }, { status: 404 });
    const treatment = booking.treatment_id ? await svc.entities.Treatment.get(booking.treatment_id).catch(() => null) : null;
    const isStaff = user.role === "admin" || !!user.data?.staff_role;
    if (isStaff) {
      if (!canAccessClinic(user, booking.clinic_id)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      const email = (user.email || "").toLowerCase().trim();
      if (!email) return Response.json({ error: "No email on account" }, { status: 400 });
      if (!booking.customer_id) return Response.json({ error: "Forbidden" }, { status: 403 });
      const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
      if (!customer || (customer.email || "").toLowerCase().trim() !== email) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (["cancelled", "completed", "no_show"].includes(booking.status)) {
      return Response.json({ error: "Bokningen kan inte ombokas" }, { status: 409 });
    }
    const newStart = new Date(new_start_time);
    if (isNaN(newStart.getTime())) {
      return Response.json({ error: "Ogiltigt datumformat" }, { status: 400 });
    }
    if (newStart.getTime() < Date.now()) {
      return Response.json({ error: "Kan inte boka tid i det f\xF6rflutna" }, { status: 400 });
    }
    const durationMin = treatment?.duration || 30;
    const newEnd = new Date(newStart.getTime() + durationMin * 6e4);
    if (booking.staff_name && booking.clinic_id) {
      if (booking.treatment_id) {
        const bookable = await checkStaffBookable(svc, {
          clinic_id: booking.clinic_id,
          staff_name: booking.staff_name,
          treatment_id: booking.treatment_id
        });
        if (!bookable.ok) return Response.json({ error: bookable.error, code: bookable.code }, { status: bookable.status });
      }
      const dateStr = clinicDateOf(newStart.getTime());
      const requireRoomId = treatment?.room_id || booking.room_id || void 0;
      const requireResourceIds = parseResourceIds(treatment?.required_resource_ids || booking.resource_ids);
      const avail = await fetchAvailabilityData(svc, {
        clinic_id: booking.clinic_id,
        staff_name: booking.staff_name,
        date: dateStr,
        requireRoomId,
        requireResourceIds,
        excludeBookingId: booking_id
      });
      const free = isSlotFree({
        date: dateStr,
        durationMin,
        bufferBeforeMin: treatment?.buffer_before || 0,
        bufferAfterMin: treatment?.buffer_after || 0,
        minLeadHours: treatment?.min_lead_hours || 0,
        maxLeadDays: treatment?.max_lead_days || 0,
        schedule: avail.schedule,
        timeOff: avail.timeOff,
        staffBookings: avail.staffBookings,
        roomBookings: avail.roomBookings,
        resourceBookings: avail.resourceBookings,
        resourceQuantities: avail.resourceQuantities,
        requireRoomId,
        requireResourceIds
      }, newStart.getTime());
      if (!free) {
        return Response.json({ error: "Tiden \xE4r inte tillg\xE4nglig. V\xE4lj en annan tid.", code: "slot_unavailable" }, { status: 409 });
      }
    }
    const prevStart = booking.start_time;
    const updated = await svc.entities.Booking.update(booking_id, {
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString()
    });
    try {
      await svc.entities.AuditLog.create({
        clinic_id: booking.clinic_id,
        event_type: "booking_reschedule",
        entity_type: "Booking",
        entity_id: booking_id,
        description: `Ombokning f\xF6r ${booking.customer_name || ""}: ${prevStart} \u2192 ${newStart.toISOString()}`,
        user_id: user.id,
        user_name: user.full_name || user.email || "",
        metadata: JSON.stringify({ from: prevStart, to: newStart.toISOString() })
      });
    } catch {
    }
    try {
      if (booking.customer_id) {
        const customer = await svc.entities.Customer.get(booking.customer_id).catch(() => null);
        if (customer?.email) {
          const dateStr = newStart.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: customer.email,
            subject: "Bokning ombokad \u2014 ny tid bekr\xE4ftad",
            body: `Din bokning f\xF6r ${booking.treatment_name || "behandling"} har ombokats till ${dateStr}.`
          });
        }
      }
    } catch {
    }
    return Response.json({ booking: updated });
  } catch (error) {
    console.error("rescheduleBooking error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
