globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// ../base44/functions/createPublicBooking/entry.ts
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

// ../base44/shared/hash.ts
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ../base44/functions/createPublicBooking/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { clinic_id, treatment_id, staff_name, start_time, customer } = body;
    if (!clinic_id || !treatment_id || !staff_name || !start_time || !customer?.name || !customer?.email) {
      return Response.json({ error: "Alla obligatoriska f\xE4lt m\xE5ste fyllas i" }, { status: 400 });
    }
    const treatment = await svc.entities.Treatment.get(treatment_id);
    if (!treatment || treatment.clinic_id !== clinic_id) {
      return Response.json({ error: "Ogiltig behandling" }, { status: 400 });
    }
    const bookable = await checkStaffBookable(svc, { clinic_id, staff_name, treatment_id });
    if (!bookable.ok) {
      return Response.json({ error: bookable.error, code: bookable.code }, { status: bookable.status });
    }
    if (treatment.guest_booking_allowed === false) {
      const u = await base44.auth.me().catch(() => null);
      if (!u || (u.email || "").toLowerCase().trim() !== String(customer.email).toLowerCase().trim()) {
        return Response.json({
          error: "Den h\xE4r behandlingen kr\xE4ver att du \xE4r inloggad. Logga in eller registrera dig med samma e-postadress och boka igen.",
          code: "login_required"
        }, { status: 401 });
      }
    }
    const duration = treatment.duration || 30;
    const start = new Date(start_time);
    if (isNaN(start.getTime())) return Response.json({ error: "Ogiltig starttid" }, { status: 400 });
    const end = new Date(start.getTime() + duration * 6e4);
    if ((treatment.waiting_period_days || 0) > 0) {
      const earliest = new Date(Date.now() + treatment.waiting_period_days * 864e5);
      if (start < earliest) {
        return Response.json({
          error: `Denna behandling har en v\xE4ntetid p\xE5 ${treatment.waiting_period_days} dagar. Tidigaste m\xF6jliga datum \xE4r ${earliest.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}.`,
          code: "waiting_period",
          earliest: earliest.toISOString()
        }, { status: 400 });
      }
    }
    const minAge = treatment.treatment_type === "injektion" ? Math.max(18, treatment.min_age || 0) : treatment.min_age || 0;
    if (minAge > 0) {
      if (!customer.birth_date) {
        return Response.json({ error: `Denna behandling kr\xE4ver att du \xE4r minst ${minAge} \xE5r. Ange ditt f\xF6delsedatum.`, code: "age_required" }, { status: 400 });
      }
      const ageAtStart = Math.floor((start.getTime() - new Date(customer.birth_date).getTime()) / (365.25 * 864e5));
      if (ageAtStart < minAge) {
        return Response.json({ error: `Denna behandling kr\xE4ver att du \xE4r minst ${minAge} \xE5r gammal.`, code: "under_age" }, { status: 400 });
      }
    }
    const dateStr = clinicDateOf(start.getTime());
    const requireRoomId = treatment.room_id || void 0;
    const requireResourceIds = parseResourceIds(treatment.required_resource_ids);
    const availData = await fetchAvailabilityData(svc, { clinic_id, staff_name, date: dateStr, requireRoomId, requireResourceIds });
    const free = isSlotFree({
      date: dateStr,
      durationMin: duration,
      bufferBeforeMin: treatment.buffer_before || 0,
      bufferAfterMin: treatment.buffer_after || 0,
      minLeadHours: treatment.min_lead_hours || 0,
      maxLeadDays: treatment.max_lead_days || 0,
      schedule: availData.schedule,
      timeOff: availData.timeOff,
      staffBookings: availData.staffBookings,
      roomBookings: availData.roomBookings,
      resourceBookings: availData.resourceBookings,
      resourceQuantities: availData.resourceQuantities,
      requireRoomId,
      requireResourceIds
    }, start.getTime());
    if (!free) {
      return Response.json({ error: "Tiden \xE4r tyv\xE4rr inte tillg\xE4nglig. V\xE4lj en annan tid." }, { status: 409 });
    }
    const email = customer.email.toLowerCase().trim();
    const escEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const custPage = await svc.entities.Customer.filter(
      { clinic_id, email: { $regex: `^${escEmail}$`, $options: "i" } },
      { limit: 1 }
    );
    let cust = (custPage.items || [])[0];
    if (cust) {
      const me = await base44.auth.me().catch(() => null);
      if (!me || (me.email || "").toLowerCase().trim() !== email) {
        return Response.json({
          error: "Det finns redan en kund med den h\xE4r e-postadressen. Logga in (eller registrera dig med samma e-postadress) och boka igen.",
          code: "account_exists"
        }, { status: 409 });
      }
    }
    if (!cust) {
      cust = await svc.entities.Customer.create({
        clinic_id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        birth_date: customer.birth_date,
        personnummer: customer.personnummer,
        status: "lead"
      });
    } else {
      const patch = {};
      if (!cust.phone && customer.phone) patch.phone = customer.phone;
      if (!cust.name && customer.name) patch.name = customer.name;
      if (!cust.birth_date && customer.birth_date) patch.birth_date = customer.birth_date;
      if (!cust.personnummer && customer.personnummer) patch.personnummer = customer.personnummer;
      if (Object.keys(patch).length) cust = await svc.entities.Customer.update(cust.id, patch);
    }
    const payToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const payHash = await sha256(payToken);
    const booking = await svc.entities.Booking.create({
      clinic_id,
      customer_id: cust.id,
      customer_name: cust.name,
      treatment_id: treatment.id,
      treatment_name: treatment.name,
      staff_name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "pending",
      price: treatment.price,
      room_id: treatment.room_id || "",
      resource_ids: treatment.required_resource_ids || "[]",
      deposit_amount: treatment.deposit_amount || 0,
      pay_token_hash: payHash
    });
    try {
      await svc.entities.JournalEntry.create({
        clinic_id,
        customer_id: cust.id,
        customer_name: cust.name,
        treatment_id: treatment.id,
        treatment_name: treatment.name,
        booking_id: booking.id,
        provider: staff_name,
        entry_date: start.toISOString(),
        notes: "V\xE4ntar p\xE5 behandling",
        is_signed: false,
        version: 1
      });
    } catch {
    }
    const requirements = [];
    if (treatment.requires_health_declaration) requirements.push("H\xE4lsodeklaration");
    if (treatment.requires_consent) requirements.push("Samtycke");
    if (treatment.requires_treatment_info) requirements.push("Behandlingsinformation & risker");
    if (treatment.requires_aftercare) requirements.push("Efterv\xE5rdsinformation");
    if (treatment.requires_payment) requirements.push("Betalning");
    try {
      const formIds = JSON.parse(treatment.required_form_ids || "[]");
      if (Array.isArray(formIds) && formIds.length > 0) requirements.push(`${formIds.length} formul\xE4r`);
    } catch {
    }
    try {
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
      const baseUrl = host ? `${proto}://${host}` : "";
      const portalUrl = baseUrl ? `${baseUrl}/portal` : "";
      const clinic = await svc.entities.Clinic.get(clinic_id).catch(() => null);
      const clinicName = clinic?.name || "Klinik";
      const fmtTime = (d) => new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      await svc.integrations.Core.SendEmail({
        to: customer.email,
        template_name: "BookingConfirmation",
        variables: {
          customer_name: cust.name,
          treatment_name: treatment.name,
          staff_name,
          start_time: fmtTime(start),
          price: String(treatment.price || ""),
          portal_url: portalUrl,
          clinic_name: clinicName
        }
      });
    } catch {
    }
    return Response.json({
      booking: {
        id: booking.id,
        treatment_name: treatment.name,
        staff_name,
        start_time: booking.start_time,
        end_time: booking.end_time,
        price: treatment.price
      },
      requirements,
      payment_token: treatment.requires_payment && (treatment.price || 0) > 0 ? payToken : void 0
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
