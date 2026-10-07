// Delad tillgänglighetsmotor för bokning. Portabel — ingen Base44-import.
// Anroparen (en backend-funktion) hämtar data via SDK/Postgres och skickar in
// färdiga listor; motorn gör ren tidsberäkning och konfliktkontroll över alla
// dimensioner: behandlarens schema, frånvaro, befintliga bokningar, rum,
// resurser, buffertider, minsta framförhållning och max bokningsframförhållning.
//
// Detta är hjärtat i "alla kombinationer måste kontrolleras innan tiden visas
// som ledig". Samma logik används både för att visa lediga tider och för att
// validera en vald tid vid bokning.

export interface Interval { start: number; end: number; } // epoch ms

export interface ScheduleEntry {
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
}

export interface BookingRef {
  start: number;       // epoch ms
  end: number;         // epoch ms
  room_id?: string;
  resource_ids?: string[];
}

export interface SlotInput {
  date: string;            // "YYYY-MM-DD"
  durationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  minLeadHours?: number;
  maxLeadDays?: number;
  stepMin?: number;        // default 15
  schedule: ScheduleEntry[];
  timeOff: Interval[];
  staffBookings: Interval[];
  roomBookings: Interval[];           // för requireRoomId
  resourceBookings: { resource_id: string; interval: Interval }[]; // för requireResourceIds
  resourceQuantities: Record<string, number>;
  requireRoomId?: string;
  requireResourceIds?: string[];
  now?: number;            // default Date.now()
}

// Kliniken arbetar i svensk tid. Servern (Base44-runtime och Docker/Node) kör i UTC,
// så alla "HH:mm"-tider i scheman och dygnsgränser måste tolkas i klinikens tidszon —
// annars hamnar en 09:00-tid på 11:00 för kunden.
export const CLINIC_TZ = 'Europe/Stockholm';

function tzOffsetMs(epoch: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(epoch))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

// "YYYY-MM-DD" + "HH:mm" i klinikens tidszon -> epoch ms.
export function zonedToEpoch(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map((x) => parseInt(x, 10));
  const [h, mi] = hhmm.split(':').map((x) => parseInt(x, 10));
  const guess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
  const off1 = tzOffsetMs(guess);
  let t = guess - off1;
  const off2 = tzOffsetMs(t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

// Klinikens kalenderdatum (YYYY-MM-DD) för ett givet ögonblick.
export function clinicDateOf(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function entityStore(svc: any, name: string): any {
  const store = svc?.entity ? svc.entity(name) : svc?.entities?.[name];
  if (!store?.filter) throw new Error(`${name}-entiteten är inte tillgänglig i runtime`);
  return store;
}

function pageItems<T = any>(page: any): T[] {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.items)) return page.items;
  if (Array.isArray(page?.data)) return page.data;
  return [];
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

function parseHHmmToEpoch(date: string, hhmm: string): number {
  return zonedToEpoch(date, hhmm);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

// Subtraherar timeOff-intervall från working-intervall.
function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  let result = [...base];
  for (const r of remove) {
    const next: Interval[] = [];
    for (const b of result) {
      if (!overlaps(b, r)) { next.push(b); continue; }
      if (r.start > b.start) next.push({ start: b.start, end: r.start });
      if (r.end < b.end) next.push({ start: r.end, end: b.end });
    }
    result = next;
  }
  return result;
}

export function computeAvailableSlots(input: SlotInput): string[] {
  const now = input.now ?? Date.now();
  const stepMin = input.stepMin ?? 15;
  const bufBefore = (input.bufferBeforeMin ?? 0) * 60000;
  const bufAfter = (input.bufferAfterMin ?? 0) * 60000;
  const durMs = input.durationMin * 60000;
  const minLeadMs = (input.minLeadHours ?? 0) * 3600000;
  const maxLeadMs = (input.maxLeadDays ?? 0) * 86400000;
  const requireRoomId = input.requireRoomId || undefined;
  const requireResourceIds = (input.requireResourceIds || []).filter(Boolean);

  // 1. Bygg arbetsintervall för dagen utifrån schemat.
  const working: Interval[] = input.schedule
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: parseHHmmToEpoch(input.date, s.start_time), end: parseHHmmToEpoch(input.date, s.end_time) }))
    .filter((iv) => iv.end > iv.start);

  // 2. Dra bort frånvaro.
  const available = subtractIntervals(working, input.timeOff);

  // 3. Generera kandidatstarttider och kontrollera alla dimensioner.
  const slots: string[] = [];
  const earliestStart = now + minLeadMs;
  const latestStart = maxLeadMs > 0 ? now + maxLeadMs : Infinity;

  for (const iv of available) {
    // Justera start till nästa step efter iv.start.
    let t = iv.start;
    const stepMs = stepMin * 60000;
    if (t % stepMs !== 0) t = Math.ceil(t / stepMs) * stepMs;
    for (; t + durMs <= iv.end; t += stepMs) {
      const slotEnd = t + durMs;
      // Minsta framförhållning / max framförhållning
      if (t < earliestStart) continue;
      if (t > latestStart) continue;

      // Behandlarintervall inklusive buffertar (blockerar schema, inte kunden).
      const blockIv: Interval = { start: t - bufBefore, end: slotEnd + bufAfter };

      // Behandlarkonflikt (befintliga bokningar)
      if (input.staffBookings.some((b) => overlaps(blockIv, b))) continue;

      // Rumskonflikt
      if (requireRoomId && input.roomBookings.some((b) => overlaps(blockIv, b))) continue;

      // Resurskonflikt: räkna överlappande bokningar per resurs, max quantity.
      let resourceOk = true;
      for (const rid of requireResourceIds) {
        const qty = input.resourceQuantities[rid] ?? 1;
        const overlapping = input.resourceBookings.filter(
          (rb) => rb.resource_id === rid && overlaps(blockIv, rb.interval)
        ).length;
        if (overlapping >= qty) { resourceOk = false; break; }
      }
      if (!resourceOk) continue;

      slots.push(new Date(t).toISOString());
    }
  }
  return slots;
}

// Kontrollerar om ett specifikt starttid är ledigt givet samma data. Används
// vid bokning för att validera en vald tid (race-skydd innan create).
export function isSlotFree(input: Omit<SlotInput, 'stepMin'>, candidateStartMs: number): boolean {
  const now = input.now ?? Date.now();
  const bufBefore = (input.bufferBeforeMin ?? 0) * 60000;
  const bufAfter = (input.bufferAfterMin ?? 0) * 60000;
  const durMs = input.durationMin * 60000;
  const minLeadMs = (input.minLeadHours ?? 0) * 3600000;
  const maxLeadMs = (input.maxLeadDays ?? 0) * 86400000;
  const requireRoomId = input.requireRoomId || undefined;
  const requireResourceIds = (input.requireResourceIds || []).filter(Boolean);

  if (candidateStartMs < now + minLeadMs) return false;
  if (maxLeadMs > 0 && candidateStartMs > now + maxLeadMs) return false;

  const slotEnd = candidateStartMs + durMs;
  const blockIv: Interval = { start: candidateStartMs - bufBefore, end: slotEnd + bufAfter };

  // Måste ligga inom ett arbetsintervall (utan frånvaro).
  const working: Interval[] = input.schedule
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({ start: parseHHmmToEpoch(input.date, s.start_time), end: parseHHmmToEpoch(input.date, s.end_time) }))
    .filter((iv) => iv.end > iv.start);
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

// Hämtar all tillgänglighetsdata för en behandlare/dag via ett svc-liknande
// dataaccess-objekt (Base44 SDK nu; kan bytas mot Postgres-klient senare). Håller
// funktionerna DRY: både getAvailableSlots och createPublicBooking använder denna.
export interface AvailabilityData {
  schedule: ScheduleEntry[];
  timeOff: Interval[];
  staffBookings: Interval[];
  roomBookings: Interval[];
  resourceBookings: { resource_id: string; interval: Interval }[];
  resourceQuantities: Record<string, number>;
}

export async function fetchAvailabilityData(
  svc: any,
  params: { clinic_id: string; staff_name: string; date: string; requireRoomId?: string; requireResourceIds?: string[]; excludeBookingId?: string }
): Promise<AvailabilityData> {
  const { clinic_id, staff_name, date } = params;
  const requireResourceIds = (params.requireResourceIds || []).filter(Boolean);
  const dayStart = new Date(zonedToEpoch(date, '00:00'));
  const dayEnd = new Date(zonedToEpoch(nextDate(date), '00:00') - 1);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const notExcluded = (b: any) => !params.excludeBookingId || b.id !== params.excludeBookingId;

  const toIv = (b: any): Interval => ({
    start: new Date(b.start_time).getTime(),
    end: b.end_time ? new Date(b.end_time).getTime() : new Date(b.start_time).getTime() + (b.duration || 30) * 60000,
  });

  const schedPage = await entityStore(svc, 'StaffSchedule').filter(
    { clinic_id, staff_name, day_of_week: weekday },
    { limit: 50 }
  );
  const schedule = pageItems(schedPage).filter((s: any) => {
    if (!s.start_time || !s.end_time) return false;
    if (s.effective_from && date < s.effective_from) return false;
    if (s.effective_until && date > s.effective_until) return false;
    return true;
  });

  const offPage = await entityStore(svc, 'StaffTimeOff').filter(
    { clinic_id, staff_name, start: { $lte: dayEnd.toISOString() }, end: { $gte: dayStart.toISOString() } },
    { limit: 100 }
  );
  const timeOff = pageItems(offPage).map((o: any) => ({
    start: new Date(o.start).getTime(),
    end: new Date(o.end).getTime(),
  }));

  const bookPage = await entityStore(svc, 'Booking').filter(
    {
      clinic_id, staff_name,
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
      status: { $nin: ['cancelled', 'no_show'] },
    },
    { sort: 'start_time', limit: 200 }
  );
  const staffBookings = pageItems(bookPage).filter(notExcluded).map(toIv);

  let roomBookings: Interval[] = [];
  if (params.requireRoomId) {
    const roomPage = await entityStore(svc, 'Booking').filter(
      {
        clinic_id, room_id: params.requireRoomId,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ['cancelled', 'no_show'] },
      },
      { limit: 200 }
    );
    roomBookings = pageItems(roomPage).filter(notExcluded).map(toIv);
  }

  let resourceBookings: { resource_id: string; interval: Interval }[] = [];
  let resourceQuantities: Record<string, number> = {};
  if (requireResourceIds.length > 0) {
    const resPage = await entityStore(svc, 'Booking').filter(
      {
        clinic_id,
        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
        status: { $nin: ['cancelled', 'no_show'] },
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
    const resQtyPage = await entityStore(svc, 'Resource').filter(
      { clinic_id, id: { $in: requireResourceIds } },
      { limit: 50 }
    );
    for (const r of pageItems(resQtyPage)) {
      resourceQuantities[r.id] = r.quantity || 1;
    }
  }

  return { schedule, timeOff, staffBookings, roomBookings, resourceBookings, resourceQuantities };
}

// Hjälp: tolka JSON-array av resurs-ID:n säkert.
export function parseResourceIds(raw: string | undefined | null): string[] {
  try {
    const ids = JSON.parse(raw || '[]');
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}