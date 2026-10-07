import { serviceEntity } from '../entities/index.js';

const TZ = 'Europe/Stockholm';

function tzOffsetMs(epoch) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(epoch))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

function zonedToEpoch(date, hhmm) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
  const off1 = tzOffsetMs(guess);
  let t = guess - off1;
  const off2 = tzOffsetMs(t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

function nextDate(date) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

function items(page) {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.items)) return page.items;
  if (Array.isArray(page?.data)) return page.data;
  return [];
}

function overlap(a, b) {
  return a.start < b.end && a.end > b.start;
}

function subtract(base, remove) {
  let result = [...base];
  for (const r of remove) {
    const next = [];
    for (const b of result) {
      if (!overlap(b, r)) next.push(b);
      else {
        if (r.start > b.start) next.push({ start: b.start, end: r.start });
        if (r.end < b.end) next.push({ start: r.end, end: b.end });
      }
    }
    result = next;
  }
  return result;
}

function interval(b) {
  const start = new Date(b.start_time).getTime();
  return { start, end: b.end_time ? new Date(b.end_time).getTime() : start + (Number(b.duration) || 30) * 60000 };
}

function parseResources(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  } catch { return []; }
}

export async function getAvailableSlotsNative({ clinic_id, staff_name, date, duration, treatment_id }) {
  if (!clinic_id || !staff_name || !date) {
    const e = new Error('clinic_id, staff_name och date krävs'); e.status = 400; throw e;
  }

  const staff = serviceEntity('Staff');
  const staffPage = await staff.filter({ clinic_id, name: staff_name }, { limit: 5 });
  const staffItems = items(staffPage);
  const staffRow = staffItems.find((s) => s?.active !== false);
  if (!staffRow) {
    const e = new Error('Behandlaren finns inte eller är inte aktiv.'); e.status = 400; throw e;
  }

  let durationMin = Number(duration) || 30;
  let bufferBefore = 0, bufferAfter = 0, minLeadHours = 0, maxLeadDays = 0;
  let roomId;
  let requiredResourceIds = [];

  if (treatment_id) {
    const treatment = await serviceEntity('Treatment').get(treatment_id).catch(() => null);
    if (treatment && treatment.clinic_id === clinic_id) {
      durationMin = Number(treatment.duration) || durationMin;
      bufferBefore = Number(treatment.buffer_before) || 0;
      bufferAfter = Number(treatment.buffer_after) || 0;
      minLeadHours = Number(treatment.min_lead_hours) || 0;
      maxLeadDays = Number(treatment.max_lead_days) || 0;
      roomId = treatment.room_id || undefined;
      requiredResourceIds = parseResources(treatment.required_resource_ids);
    }
  }

  const dayStart = new Date(zonedToEpoch(date, '00:00'));
  const dayEnd = new Date(zonedToEpoch(nextDate(date), '00:00') - 1);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const schedule = items(await serviceEntity('StaffSchedule').filter(
    { clinic_id, staff_name, day_of_week: weekday }, { limit: 50 }
  )).filter((s) => s.start_time && s.end_time && (!s.effective_from || date >= s.effective_from) && (!s.effective_until || date <= s.effective_until));

  const timeOff = items(await serviceEntity('StaffTimeOff').filter(
    { clinic_id, staff_name, start: { $lte: dayEnd.toISOString() }, end: { $gte: dayStart.toISOString() } }, { limit: 100 }
  )).map((o) => ({ start: new Date(o.start).getTime(), end: new Date(o.end).getTime() }));

  const bookingQuery = {
    clinic_id, staff_name,
    start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
    status: { $nin: ['cancelled', 'no_show'] },
  };
  const staffBookings = items(await serviceEntity('Booking').filter(bookingQuery, { sort: 'start_time', limit: 200 })).map(interval);

  let roomBookings = [];
  if (roomId) {
    roomBookings = items(await serviceEntity('Booking').filter({
      clinic_id, room_id: roomId,
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
      status: { $nin: ['cancelled', 'no_show'] },
    }, { limit: 200 })).map(interval);
  }

  let resourceBookings = [];
  const resourceQuantities = {};
  if (requiredResourceIds.length) {
    const all = items(await serviceEntity('Booking').filter({
      clinic_id,
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
      status: { $nin: ['cancelled', 'no_show'] },
    }, { limit: 300 }));
    for (const b of all) {
      const iv = interval(b);
      for (const rid of parseResources(b.resource_ids)) {
        if (requiredResourceIds.includes(rid)) resourceBookings.push({ resource_id: rid, interval: iv });
      }
    }
    const resources = items(await serviceEntity('Resource').filter({ clinic_id, id: { $in: requiredResourceIds } }, { limit: 50 }));
    for (const r of resources) resourceQuantities[r.id] = Number(r.quantity) || 1;
  }

  const working = schedule.map((s) => ({
    start: zonedToEpoch(date, s.start_time),
    end: zonedToEpoch(date, s.end_time),
  })).filter((x) => x.end > x.start);

  const available = subtract(working, timeOff);
  const now = Date.now();
  const earliest = now + minLeadHours * 3600000;
  const latest = maxLeadDays > 0 ? now + maxLeadDays * 86400000 : Infinity;
  const step = 15 * 60000;
  const durationMs = durationMin * 60000;
  const before = bufferBefore * 60000;
  const after = bufferAfter * 60000;
  const slots = [];

  for (const iv of available) {
    let t = iv.start;
    if (t % step !== 0) t = Math.ceil(t / step) * step;
    for (; t + durationMs <= iv.end; t += step) {
      if (t < earliest || t > latest) continue;
      const block = { start: t - before, end: t + durationMs + after };
      if (staffBookings.some((b) => overlap(block, b))) continue;
      if (roomId && roomBookings.some((b) => overlap(block, b))) continue;
      let ok = true;
      for (const rid of requiredResourceIds) {
        const qty = resourceQuantities[rid] ?? 1;
        const count = resourceBookings.filter((b) => b.resource_id === rid && overlap(block, b.interval)).length;
        if (count >= qty) { ok = false; break; }
      }
      if (ok) slots.push(new Date(t).toISOString());
    }
  }

  return { slots, date, staff_name };
}
