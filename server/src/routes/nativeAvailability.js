import { withTx } from '../db/pool.js';

const TZ = 'Europe/Stockholm';

function tzOffsetMs(epoch) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of dtf.formatToParts(new Date(epoch))) parts[part.type] = part.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

function zonedToEpoch(date, hhmm) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const [h, mi] = String(hhmm).split(':').map(Number);
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

function overlap(a, b) {
  return a.start < b.end && a.end > b.start;
}

function interval(row) {
  const start = new Date(row.start_time).getTime();
  return {
    start,
    end: row.end_time
      ? new Date(row.end_time).getTime()
      : start + (Number(row.duration) || 30) * 60000,
  };
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function parseAllowedTreatments(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : null;
  } catch {
    return null;
  }
}

function bookingIsActive(row) {
  return !['cancelled', 'no_show'].includes(String(row.status || '').toLowerCase());
}

function normalizeRow(row) {
  return {
    ...(row.data || {}),
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by_id: row.created_by_id,
    clinic_id: row.clinic_id ?? row.data?.clinic_id ?? '',
  };
}

export async function getAvailableSlotsNative({
  clinic_id,
  staff_name,
  date,
  duration,
  treatment_id,
} = {}) {
  if (!clinic_id || !staff_name || !date) {
    const e = new Error('clinic_id, staff_name och date krävs');
    e.status = 400;
    throw e;
  }

  const dayStartMs = zonedToEpoch(date, '00:00');
  const dayEndMs = zonedToEpoch(nextDate(date), '00:00') - 1;
  const dayStartIso = new Date(dayStartMs).toISOString();
  const dayEndIso = new Date(dayEndMs).toISOString();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const result = await withTx(async (client) => {
    // Public availability is deliberately service-side and read-only. It bypasses
    // entity proxies/RLS because the endpoint is already constrained to the supplied
    // clinic/staff/treatment identifiers and returns only availability metadata.
    const staffResult = await client.query(
      `SELECT id, data, clinic_id
         FROM e_staff
        WHERE clinic_id = $1
          AND data->>'name' = $2
          AND COALESCE((data->>'active')::boolean, true) = true
        LIMIT 5`,
      [String(clinic_id), String(staff_name)]
    );

    const staffRow = staffResult.rows[0];
    if (!staffRow) {
      const e = new Error('Behandlaren finns inte eller är inte aktiv.');
      e.status = 400;
      throw e;
    }

    const staff = normalizeRow(staffRow);
    const allowed = parseAllowedTreatments(staff.allowed_treatment_ids);
    if (treatment_id && allowed !== null && !allowed.includes(String(treatment_id))) {
      const e = new Error('Den valda behandlaren är inte behörig att utföra den här behandlingen.');
      e.status = 403;
      throw e;
    }

    let durationMin = Number(duration) || 30;
    let bufferBefore = 0;
    let bufferAfter = 0;
    let minLeadHours = 0;
    let maxLeadDays = 0;
    let roomId;
    let requiredResourceIds = [];

    if (treatment_id) {
      const treatmentResult = await client.query(
        `SELECT id, data, clinic_id
           FROM e_treatment
          WHERE id = $1
            AND clinic_id = $2
          LIMIT 1`,
        [String(treatment_id), String(clinic_id)]
      );
      const treatmentRow = treatmentResult.rows[0];
      if (treatmentRow) {
        const treatment = normalizeRow(treatmentRow);
        durationMin = Number(treatment.duration) || durationMin;
        bufferBefore = Number(treatment.buffer_before) || 0;
        bufferAfter = Number(treatment.buffer_after) || 0;
        minLeadHours = Number(treatment.min_lead_hours) || 0;
        maxLeadDays = Number(treatment.max_lead_days) || 0;
        roomId = treatment.room_id || undefined;
        requiredResourceIds = parseJsonArray(treatment.required_resource_ids);
      }
    }

    const [scheduleResult, timeOffResult, bookingResult] = await Promise.all([
      client.query(
        `SELECT id, data, clinic_id
           FROM e_staff_schedule
          WHERE clinic_id = $1
            AND data->>'staff_name' = $2
            AND COALESCE((data->>'day_of_week')::int, -1) = $3
          ORDER BY COALESCE(data->>'start_time', ''), id
          LIMIT 100`,
        [String(clinic_id), String(staff_name), weekday]
      ),
      client.query(
        `SELECT id, data, clinic_id
           FROM e_staff_time_off
          WHERE clinic_id = $1
            AND data->>'staff_name' = $2
            AND COALESCE(data->>'start', '') <= $3
            AND COALESCE(data->>'end', '') >= $4
          ORDER BY data->>'start'
          LIMIT 500`,
        [String(clinic_id), String(staff_name), dayEndIso, dayStartIso]
      ),
      client.query(
        `SELECT id, data, clinic_id
           FROM e_booking
          WHERE clinic_id = $1
            AND COALESCE(data->>'start_time', '') <= $3
            AND COALESCE(data->>'end_time', data->>'start_time', '') >= $2
            AND COALESCE(data->>'status', '') NOT IN ('cancelled', 'no_show')
          ORDER BY data->>'start_time'
          LIMIT 1000`,
        [String(clinic_id), dayStartIso, dayEndIso]
      ),
    ]);

    const schedules = scheduleResult.rows
      .map(normalizeRow)
      .filter((s) =>
        s.start_time &&
        s.end_time &&
        (!s.effective_from || date >= s.effective_from) &&
        (!s.effective_until || date <= s.effective_until)
      );

    const timeOff = timeOffResult.rows
      .map(normalizeRow)
      .map((o) => ({
        start: new Date(o.start).getTime(),
        end: new Date(o.end).getTime(),
      }))
      .filter((o) => Number.isFinite(o.start) && Number.isFinite(o.end) && o.end > o.start);

    const allBookings = bookingResult.rows
      .map(normalizeRow)
      .filter(bookingIsActive)
      .map((b) => ({ row: b, interval: interval(b) }))
      .filter(({ interval: iv }) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start);

    const staffBookings = allBookings
      .filter(({ row }) => row.staff_name === String(staff_name))
      .map(({ interval: iv }) => iv);

    // Treatment room is the primary room constraint, matching the existing
    // availability contract. If a schedule explicitly assigns a room and the
    // treatment has no fixed room, use that room for that schedule interval.
    const working = schedules
      .map((s) => ({
        start: zonedToEpoch(date, s.start_time),
        end: zonedToEpoch(date, s.end_time),
        roomId: roomId || s.room_id || undefined,
      }))
      .filter((x) => x.end > x.start);

    const slots = [];
    const now = Date.now();
    const earliest = now + minLeadHours * 3600000;
    const latest = maxLeadDays > 0 ? now + maxLeadDays * 86400000 : Infinity;
    const step = 15 * 60000;
    const durationMs = durationMin * 60000;
    const before = bufferBefore * 60000;
    const after = bufferAfter * 60000;

    const resourceQuantities = {};
    if (requiredResourceIds.length) {
      const resourcesResult = await client.query(
        `SELECT id, data, clinic_id
           FROM e_resource
          WHERE clinic_id = $1
            AND id = ANY($2::text[])
          LIMIT 100`,
        [String(clinic_id), requiredResourceIds]
      );
      for (const row of resourcesResult.rows) {
        const resource = normalizeRow(row);
        resourceQuantities[String(resource.id)] = Math.max(1, Number(resource.quantity) || 1);
      }
    }

    const resourceBookings = [];
    if (requiredResourceIds.length) {
      for (const { row, interval: iv } of allBookings) {
        for (const rid of parseJsonArray(row.resource_ids)) {
          if (requiredResourceIds.includes(rid)) {
            resourceBookings.push({ resource_id: rid, interval: iv });
          }
        }
      }
    }

    const timeOffByInterval = timeOff;

    for (const work of working) {
      let t = work.start;
      if (t % step !== 0) t = Math.ceil(t / step) * step;

      for (; t + durationMs <= work.end; t += step) {
        if (t < earliest || t > latest) continue;

        const block = {
          start: t - before,
          end: t + durationMs + after,
        };

        if (staffBookings.some((b) => overlap(block, b))) continue;

        const slotRoomId = work.roomId;
        if (slotRoomId) {
          const roomConflict = allBookings.some(({ row, interval: b }) =>
            row.room_id === slotRoomId && overlap(block, b)
          );
          if (roomConflict) continue;
        }

        if (timeOffByInterval.some((o) => overlap(block, o))) continue;

        let resourcesOk = true;
        for (const rid of requiredResourceIds) {
          const quantity = resourceQuantities[rid] ?? 1;
          const concurrent = resourceBookings.filter(
            (b) => b.resource_id === rid && overlap(block, b.interval)
          ).length;
          if (concurrent >= quantity) {
            resourcesOk = false;
            break;
          }
        }
        if (!resourcesOk) continue;

        slots.push(new Date(t).toISOString());
      }
    }

    return slots;
  }, { bypassRls: true });

  return { slots: result, date, staff_name };
}
