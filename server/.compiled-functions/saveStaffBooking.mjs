globalThis.Deno ??= { env: { get: (k) => process.env[k] } };

// base44/functions/saveStaffBooking/entry.ts
import { createClientFromRequest } from "./runtime/sdk-shim.js";

// base44/shared/availability.ts
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
function entityStore(svc, name) {
  const store = svc?.entity ? svc.entity(name) : svc?.entities?.[name];
  if (!store?.filter) throw new Error(`${name}-entiteten \xE4r inte tillg\xE4nglig i runtime`);
  return store;
}
function pageItems(page) {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.items)) return page.items;
  if (Array.isArray(page?.data)) return page.data;
  return [];
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
  const schedPage = await entityStore(svc, "StaffSchedule").filter(
    { clinic_id, staff_name, day_of_week: weekday },
    { limit: 50 }
  );
  const schedule = pageItems(schedPage).filter((s) => {
    if (!s.start_time || !s.end_time) return false;
    if (s.effective_from && date < s.effective_from) return false;
    if (s.effective_until && date > s.effective_until) return false;
    return true;
  });
  const offPage = await entityStore(svc, "StaffTimeOff").filter(
    { clinic_id, staff_name, start: { $lte: dayEnd.toISOString() }, end: { $gte: dayStart.toISOString() } },
    { limit: 100 }
  );
  const timeOff = pageItems(offPage).map((o) => ({
    start: new Date(o.start).getTime(),
    end: new Date(o.end).getTime()
  }));
  const bookPage = await entityStore(svc, "Booking").filter(
    {
      clinic_id,
      staff_name,
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
      status: { $nin: ["cancelled", "no_show"] }
    },
    { sort: "start_time", limit: 200 }
  );
  const staffBookings = pageItems(bookPage).filter(notExcluded).map(toIv);
  let roomBookings = [];
  if (params.requireRoomId) {
    const roomPage = await entityStore(svc, "Booking").filter(
      {
        clinic_id,
        room_id: params.requireRoomId,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ["cancelled", "no_show"] }
      },
      { limit: 200 }
    );
    roomBookings = pageItems(roomPage).filter(notExcluded).map(toIv);
  }
  let resourceBookings = [];
  let resourceQuantities = {};
  if (requireResourceIds.length > 0) {
    const resPage = await entityStore(svc, "Booking").filter(
      {
        clinic_id,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ["cancelled", "no_show"] }
      },
      { limit: 300 }
    );
    for (const b of pageItems(resPage)) {
      if (!notExcluded(b)) continue;
      const ids = parseResourceIds(b.resource_ids);
      const iv = toIv(b);
      for (const rid of ids) {
        if (requireResourceIds.includes(rid)) {
          resourceBookings.push({ resource_id: rid, interval: iv });
        }
      }
    }
    const resQtyPage = await entityStore(svc, "Resource").filter(
      { clinic_id, id: { $in: requireResourceIds } },
      { limit: 50 }
    );
    for (const r of pageItems(resQtyPage)) {
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

// base44/shared/bookingRequirements.ts
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
  try {
    const clinicId = booking?.clinic_id;
    if (clinicId) {
      const infoRule = await getClinicRule(svc, clinicId, "treatment_information");
      if (infoRule.active && configMatches(infoRule.config, treatment)) {
        const info = await svc.entities.TreatmentInformation.filter(
          { treatment_id: treatment.id, active: true },
          { sort: "-created_date", limit: 1 }
        );
        requirements.push({
          key: "configured_treatment_information",
          label: "Aktuell behandlingsinformation",
          required: infoRule.enforce,
          completed: !!(info.items || []).length,
          mode: infoRule.status
        });
      }
      const licenseRule = await getClinicRule(svc, clinicId, "staff_licensing");
      if (licenseRule.active && configMatches(licenseRule.config, treatment, { staff_name: booking.staff_name })) {
        const requiredTypes = Array.isArray(licenseRule.config.required_license_types) ? licenseRule.config.required_license_types.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
        if (requiredTypes.length) {
          const licenses = await svc.entities.StaffLicense.filter({ staff_id: booking.staff_id || "" }, { limit: 100 });
          const fallback = await svc.entities.StaffLicense.filter({ staff_name: booking.staff_name || "" }, { limit: 100 });
          const ok = [...licenses.items || [], ...fallback.items || []].some(
            (x) => (x.status || "active") === "active" && (!x.valid_until || new Date(x.valid_until) >= /* @__PURE__ */ new Date()) && requiredTypes.includes(String(x.license_type || "").toLowerCase())
          );
          requirements.push({
            key: "configured_staff_license",
            label: "Personalens beh\xF6righet",
            required: licenseRule.enforce,
            completed: ok,
            mode: licenseRule.status
          });
        }
      }
      const radiationRule = await getClinicRule(svc, clinicId, "radiation_compliance");
      if (radiationRule.active && configMatches(radiationRule.config, treatment)) {
        const equipmentId = treatment.equipment_id || treatment.machine_id || radiationRule.config.equipment_id;
        if (equipmentId) {
          const eq = await svc.entities.RadiationEquipment.filter({ equipment_id: equipmentId, status: "active" }, { limit: 1 });
          const equipment = eq.items?.[0];
          const notificationOk = !!equipment?.ssm_notification;
          requirements.push({
            key: "configured_radiation_equipment",
            label: "Godk\xE4nd utrustning/maskin",
            required: radiationRule.enforce,
            completed: !!equipment && notificationOk,
            mode: radiationRule.status
          });
        }
      }
      const ageRule = await getClinicRule(svc, clinicId, "age_verification");
      if (ageRule.active && configMatches(ageRule.config, treatment) && cid) {
        const minimumAge = Number(ageRule.config.minimum_age || 0);
        if (minimumAge > 0) {
          const customer = await svc.entities.Customer.get(cid).catch(() => null);
          const age = customer?.birth_date ? Math.floor((Date.now() - new Date(customer.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1e3)) : -1;
          requirements.push({
            key: "configured_age_verification",
            label: `\xC5ldersverifiering (${minimumAge}+ \xE5r)`,
            required: ageRule.enforce,
            completed: age >= minimumAge,
            mode: ageRule.status
          });
        }
      }
      if (["injektion", "filler", "botox"].includes(String(treatment?.treatment_type || "").toLowerCase()) && treatment.requires_health_declaration) {
        const declarations = await svc.entities.HealthDeclaration.filter(
          { clinic_id: clinicId, customer_id: booking.customer_id, status: "submitted" },
          { sort: "-submitted_at", limit: 20 }
        );
        const latest = (declarations.items || []).find(
          (x) => !x.booking_id || x.booking_id === booking.id || String(x.treatment_name || "").toLowerCase() === String(treatment.name || "").toLowerCase()
        );
        const waitingUntil = latest?.waiting_period_until ? new Date(latest.waiting_period_until).getTime() : NaN;
        let repeatSameTypeWithinSixMonths = false;
        try {
          const since = new Date(Date.now() - 183 * 864e5).toISOString();
          const previous = await svc.entities.ClinicalTreatmentRecord.filter(
            { clinic_id: clinicId, customer_id: booking.customer_id, treatment_name: treatment.name },
            { sort: "-record_date", limit: 20 }
          );
          repeatSameTypeWithinSixMonths = (previous.items || []).some((x) => {
            const ts = new Date(x.record_date || 0).getTime();
            return ts > 0 && new Date(ts).toISOString() >= since;
          });
        } catch {
        }
        requirements.push({
          key: "aesthetic_waiting_period",
          label: "Lagstadgad bet\xE4nketid \xE4r klar",
          required: true,
          completed: repeatSameTypeWithinSixMonths || Number.isFinite(waitingUntil) && Date.now() >= waitingUntil,
          mode: "enabled",
          waiting_period_until: repeatSameTypeWithinSixMonths ? null : latest?.waiting_period_until || null,
          repeat_treatment_exception: repeatSameTypeWithinSixMonths
        });
      }
      const ordinationRequired = treatment?.requires_ordination === true;
      if (ordinationRequired) {
        const records = await svc.entities.ClinicalTreatmentRecord.filter(
          { clinic_id: clinicId, customer_id: booking.customer_id, booking_id: booking.id },
          { limit: 5 }
        );
        const hasOrdination = (records.items || []).some((x) => x.ordination_prescriber && x.ordination_date);
        requirements.push({ key: "treatment_ordination", label: "L\xE4karordination registrerad", required: true, completed: hasOrdination, mode: "enabled" });
      }
      const waitRule = await getClinicRule(svc, clinicId, "waiting_periods");
      if (waitRule.active && configMatches(waitRule.config, treatment)) {
        const days = Number(waitRule.config.days || 0);
        if (days > 0) {
          const earliest = new Date(Date.now() + days * 864e5);
          const scheduled = booking?.start_time ? new Date(booking.start_time) : null;
          const completed = !!scheduled && scheduled.getTime() >= earliest.getTime();
          requirements.push({
            key: "configured_waiting_period",
            label: `Bet\xE4nketid/v\xE4ntetid (${days} dagar)`,
            required: waitRule.enforce,
            completed,
            mode: waitRule.status
          });
        }
      }
      const incidentRule = await getClinicRule(svc, clinicId, "incident_management");
      if (incidentRule.active && configMatches(incidentRule.config, treatment)) {
        const open = await svc.entities.Incident.filter(
          { clinic_id: clinicId, booking_id: booking.id, status: { $in: ["open", "investigating"] } },
          { limit: 20 }
        );
        const hasOpen = (open.items || []).length > 0;
        requirements.push({
          key: "configured_incident_check",
          label: "\xD6ppna avvikelser m\xE5ste hanteras",
          required: incidentRule.enforce,
          completed: !hasOpen,
          mode: incidentRule.status
        });
      }
      const hygieneRule = await getClinicRule(svc, clinicId, "hygiene_checks");
      if (hygieneRule.active && configMatches(hygieneRule.config, treatment)) {
        const areas = Array.isArray(hygieneRule.config.areas) ? hygieneRule.config.areas.map(String).filter(Boolean) : [];
        const maxAgeHours = Number(hygieneRule.config.max_age_hours || 24);
        const query = { clinic_id: clinicId, result: "ok" };
        if (areas.length === 1) query.area = areas[0];
        const checks = await svc.entities.HygieneCheck.filter(query, { sort: "-last_checked", limit: 100 });
        const now = Date.now();
        const valid = (checks.items || []).some((x) => {
          if (areas.length > 1 && !areas.includes(String(x.area || ""))) return false;
          const ts = new Date(x.last_checked || x.created_date || 0).getTime();
          return ts > 0 && now - ts <= maxAgeHours * 36e5;
        });
        requirements.push({
          key: "configured_hygiene_check",
          label: "Aktuell hygienkontroll",
          required: hygieneRule.enforce,
          completed: valid,
          mode: hygieneRule.status
        });
      }
      const inventoryRule = await getClinicRule(svc, clinicId, "inventory_lots");
      if (inventoryRule.active && configMatches(inventoryRule.config, treatment)) {
        const productIds = Array.isArray(inventoryRule.config.product_ids) ? inventoryRule.config.product_ids.map(String).filter(Boolean) : [];
        if (productIds.length) {
          const lots = await svc.entities.InventoryLot.filter(
            { clinic_id: clinicId, product_id: { $in: productIds }, status: "available" },
            { limit: 200 }
          );
          const today = Date.now();
          const available = (lots.items || []).some(
            (x) => Number(x.quantity || 0) > 0 && (!x.expires_at || new Date(x.expires_at).getTime() >= today)
          );
          requirements.push({
            key: "configured_inventory_lot",
            label: "Sp\xE5rbar lagerbatch tillg\xE4nglig",
            required: inventoryRule.enforce,
            completed: available,
            mode: inventoryRule.status
          });
        }
      }
      const attendanceRule = await getClinicRule(svc, clinicId, "staff_attendance");
      if (attendanceRule.active && configMatches(attendanceRule.config, treatment, { staff_name: booking.staff_name })) {
        const workDate = new Date(booking.start_time || Date.now()).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
        const attendance = await svc.entities.StaffAttendance.filter(
          { clinic_id: clinicId, staff_name: booking.staff_name, work_date: workDate },
          { limit: 20 }
        );
        const clockedIn = (attendance.items || []).some((x) => !!x.clock_in && !x.clock_out);
        requirements.push({
          key: "configured_staff_attendance",
          label: "Personalliggare: personal incheckad",
          required: attendanceRule.enforce,
          completed: clockedIn,
          mode: attendanceRule.status
        });
      }
      const bookingRule = await getClinicRule(svc, clinicId, "booking_rules");
      if (bookingRule.active && configMatches(bookingRule.config, treatment, { staff_name: booking.staff_name })) {
        const minLeadHours = Number(bookingRule.config.min_lead_hours || 0);
        const maxDays = Number(bookingRule.config.max_days || 0);
        const scheduled = booking?.start_time ? new Date(booking.start_time) : null;
        const leadHours = scheduled ? (scheduled.getTime() - Date.now()) / 36e5 : -1;
        const minOk = !minLeadHours || leadHours >= minLeadHours;
        const maxOk = !maxDays || scheduled && scheduled.getTime() <= Date.now() + maxDays * 864e5;
        requirements.push({
          key: "configured_booking_rule",
          label: "Konfigurerade bokningsregler",
          required: bookingRule.enforce,
          completed: minOk && maxOk,
          mode: bookingRule.status
        });
      }
    }
  } catch {
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
var ADVANCING_STATUSES = ["confirmed", "checked_in", "in_progress", "completed"];

// base44/shared/staffCompetence.ts
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
  const staffEntity = svc.entity ? svc.entity("Staff") : svc.entities?.Staff;
  if (!staffEntity?.filter) throw new Error("Staff-entiteten \xE4r inte tillg\xE4nglig i runtime");
  const page = await staffEntity.filter({ clinic_id, name: staff_name }, { limit: 5 });
  const items = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : Array.isArray(page?.data) ? page.data : [];
  const staff = items.find((s) => s?.active !== false);
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

// base44/shared/audit.ts
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

// base44/shared/featureFlags.ts
function parseFlagConfig(flag) {
  try {
    const value = typeof flag?.config === "string" ? JSON.parse(flag.config || "{}") : flag?.config || {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
async function getClinicRule2(svc, clinic_id, key) {
  const page = await svc.entities.FeatureFlag.filter({ clinic_id, key }, { limit: 1 });
  const flag = (page.items || [])[0];
  const status = flag?.status === "enabled" || flag?.status === "test" ? flag.status : "disabled";
  return {
    status,
    config: parseFlagConfig(flag),
    active: status !== "disabled",
    enforce: status === "enabled"
  };
}
function configMatches2(config, treatment, extra = {}) {
  const treatmentIds = Array.isArray(config.treatment_ids) ? config.treatment_ids.map(String).filter(Boolean) : [];
  const treatmentNames = Array.isArray(config.treatment_names) ? config.treatment_names.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
  const staffNames = Array.isArray(config.staff_names) ? config.staff_names.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
  const treatmentMatch = !treatmentIds.length && !treatmentNames.length || treatmentIds.includes(String(treatment?.id)) || treatmentNames.includes(String(treatment?.name || "").toLowerCase());
  const staffName = String(extra.staff_name || "").toLowerCase();
  const staffMatch = !staffNames.length || staffNames.includes(staffName);
  return treatmentMatch && staffMatch;
}

// base44/functions/saveStaffBooking/entry.ts
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const chk = requireStaff(user);
    if (!chk.ok) return Response.json({ error: chk.error }, { status: chk.status });
    const body = await req.json().catch(() => ({}));
    const { booking_id, customer_id, treatment_id, staff_name, start_time, notes } = body;
    if (!customer_id || !treatment_id || !start_time) {
      return Response.json({ error: "Kund, behandling och starttid kr\xE4vs" }, { status: 400 });
    }
    if (!staff_name) return Response.json({ error: "V\xE4lj en behandlare" }, { status: 400 });
    const svc = base44.asServiceRole;
    const existing = booking_id ? await svc.entities.Booking.get(booking_id).catch(() => null) : null;
    if (booking_id && !existing) return Response.json({ error: "Bokning hittades inte" }, { status: 404 });
    if (existing && !canAccessClinic(user, existing.clinic_id)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const treatment = await svc.entities.Treatment.get(treatment_id).catch(() => null);
    const customer = await svc.entities.Customer.get(customer_id).catch(() => null);
    if (!treatment || !customer) return Response.json({ error: "Ogiltig kund eller behandling" }, { status: 400 });
    if (!canAccessClinic(user, treatment.clinic_id) || !canAccessClinic(user, customer.clinic_id)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const clinic_id = existing?.clinic_id || getUserClinicId(user) || treatment.clinic_id;
    if (treatment.clinic_id !== clinic_id || customer.clinic_id !== clinic_id) {
      return Response.json({ error: "Kund och behandling m\xE5ste tillh\xF6ra samma klinik" }, { status: 400 });
    }
    const start = new Date(start_time);
    if (isNaN(start.getTime())) return Response.json({ error: "Ogiltig starttid" }, { status: 400 });
    const durationMin = treatment.duration || 30;
    const end = new Date(start.getTime() + durationMin * 6e4);
    const bookingRule = await getClinicRule2(svc, clinic_id, "booking_rules");
    if (bookingRule.active && configMatches2(bookingRule.config, treatment, { staff_name })) {
      const minLeadHours = Number(bookingRule.config.min_lead_hours || 0);
      const maxDays = Number(bookingRule.config.max_days || 0);
      const leadHours = (start.getTime() - Date.now()) / 36e5;
      if (bookingRule.enforce && minLeadHours && leadHours < minLeadHours) {
        return Response.json({ error: `Bokningen m\xE5ste g\xF6ras minst ${minLeadHours} timmar i f\xF6rv\xE4g.`, code: "booking_rule" }, { status: 409 });
      }
      if (bookingRule.enforce && maxDays && start.getTime() > Date.now() + maxDays * 864e5) {
        return Response.json({ error: `Bokningen kan inte g\xF6ras mer \xE4n ${maxDays} dagar fram\xE5t.`, code: "booking_rule" }, { status: 409 });
      }
    }
    const scheduleChanged = !existing || existing.treatment_id !== treatment_id || existing.staff_name !== staff_name || new Date(existing.start_time).getTime() !== start.getTime();
    if (scheduleChanged) {
      const bookable = await checkStaffBookable(svc, { clinic_id, staff_name, treatment_id });
      if (!bookable.ok) return Response.json({ error: bookable.error, code: bookable.code }, { status: bookable.status });
      const dateStr = clinicDateOf(start.getTime());
      const requireRoomId = treatment.room_id || void 0;
      const requireResourceIds = parseResourceIds(treatment.required_resource_ids);
      const avail = await fetchAvailabilityData(svc, {
        clinic_id,
        staff_name,
        date: dateStr,
        requireRoomId,
        requireResourceIds,
        excludeBookingId: existing?.id
      });
      const free = isSlotFree({
        date: dateStr,
        durationMin,
        bufferBeforeMin: treatment.buffer_before || 0,
        bufferAfterMin: treatment.buffer_after || 0,
        minLeadHours: 0,
        maxLeadDays: 0,
        now: 0,
        // personal får registrera även bakåt i tiden
        schedule: avail.schedule,
        timeOff: avail.timeOff,
        staffBookings: avail.staffBookings,
        roomBookings: avail.roomBookings,
        resourceBookings: avail.resourceBookings,
        resourceQuantities: avail.resourceQuantities,
        requireRoomId,
        requireResourceIds
      }, start.getTime());
      if (!free) {
        return Response.json({
          error: "Tiden \xE4r inte tillg\xE4nglig f\xF6r den h\xE4r behandlaren (utanf\xF6r arbetstid, fr\xE5nvaro eller krock med annan bokning, rum eller utrustning).",
          code: "slot_unavailable"
        }, { status: 409 });
      }
    }
    const requestedStatus = body.status || existing?.status || "pending";
    const statusChanging = !existing || requestedStatus !== existing.status;
    const needsGate = statusChanging && ADVANCING_STATUSES.includes(requestedStatus);
    if (existing && needsGate) {
      const check = await computeBookingRequirements(svc, { ...existing, treatment_id }, treatment);
      if (check.enforceableCount > 0 && !check.allCompleted) {
        return Response.json({
          error: "Bokningen kan inte g\xE5 till " + requestedStatus + " \u2014 ofullst\xE4ndiga krav.",
          code: "requirements_incomplete",
          missing: check.missing,
          requirements: check.requirements
        }, { status: 409 });
      }
    }
    const fields = {
      clinic_id,
      customer_id,
      customer_name: customer.name,
      treatment_id,
      treatment_name: treatment.name,
      staff_name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      room_id: treatment.room_id || "",
      resource_ids: treatment.required_resource_ids || "[]",
      notes: notes || ""
    };
    if (!existing || existing.treatment_id !== treatment_id) {
      fields.price = treatment.price ?? 0;
      fields.deposit_amount = treatment.deposit_amount || 0;
    }
    let booking;
    let statusBlocked = null;
    if (existing) {
      booking = await svc.entities.Booking.update(existing.id, { ...fields, status: requestedStatus });
    } else {
      booking = await svc.entities.Booking.create({ ...fields, status: "pending" });
      if (requestedStatus !== "pending") {
        if (needsGate) {
          const check = await computeBookingRequirements(svc, booking, treatment);
          if (check.enforceableCount > 0 && !check.allCompleted) {
            statusBlocked = { status: requestedStatus, missing: check.missing };
          }
        }
        if (!statusBlocked) booking = await svc.entities.Booking.update(booking.id, { status: requestedStatus });
      }
    }
    await recordAudit(base44, {
      event_type: existing ? "booking_update" : "booking_create",
      entity_type: "Booking",
      entity_id: booking.id,
      clinic_id,
      description: `Bokning f\xF6r ${customer.name} (${treatment.name}, ${staff_name}) ${existing ? "uppdaterad" : "skapad"}`,
      metadata: { status: booking.status, from_status: existing?.status || null, staff_name, start_time: booking.start_time }
    });
    return Response.json({ booking, status_blocked: statusBlocked });
  } catch (error) {
    console.error("saveStaffBooking:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export {
  entry_default as default
};
