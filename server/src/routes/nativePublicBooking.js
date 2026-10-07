import { randomUUID, createHash } from 'node:crypto';
import { withTx } from '../db/pool.js';
import { loadUser } from '../auth/session.js';
import { sendMail } from '../lib/email.js';

const TZ = 'Europe/Stockholm';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function clinicDateOf(ms) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

function ageAt(date, birthDate) {
  const birth = new Date(`${birthDate}T00:00:00`);
  if (!Number.isFinite(birth.getTime())) return -1;
  let age = new Date(date).getUTCFullYear() - birth.getUTCFullYear();
  const m = new Date(date).getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && new Date(date).getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function parseArray(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}

function parseAllowed(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map(String) : null;
  } catch { return null; }
}

function normalize(row) {
  return {
    ...(row.data || {}),
    id: row.id,
    clinic_id: row.clinic_id ?? row.data?.clinic_id ?? '',
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

export async function createPublicBookingNative(body = {}, req) {
  const clinicId = String(body.clinic_id || '');
  const treatmentId = String(body.treatment_id || '');
  const staffName = String(body.staff_name || '').trim();
  const start = new Date(body.start_time);
  const customer = body.customer || {};
  const name = String(customer.name || '').trim().slice(0, 150);
  const email = String(customer.email || '').toLowerCase().trim();
  const phone = String(customer.phone || '').trim().slice(0, 50);
  const birthDate = String(customer.birth_date || '').trim();
  const personnummer = String(customer.personnummer || '').trim().slice(0, 30);

  if (!clinicId || !treatmentId || !staffName || !body.start_time || !name || !email) {
    const e = new Error('Alla obligatoriska fält måste fyllas i');
    e.status = 400; throw e;
  }
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
    const e = new Error('Ogiltig e-postadress'); e.status = 400; throw e;
  }
  if (!Number.isFinite(start.getTime())) {
    const e = new Error('Ogiltig starttid'); e.status = 400; throw e;
  }

  const user = await loadUser(req);
  const userEmail = String(user?.email || '').toLowerCase().trim();
  const guestOwnsEmail = !!user && userEmail === email;

  const result = await withTx(async (client) => {
    const clinicQ = await client.query('SELECT id, data, clinic_id FROM e_clinic WHERE id = $1 LIMIT 1', [clinicId]);
    const clinic = clinicQ.rows[0] && normalize(clinicQ.rows[0]);
    if (!clinic) { const e = new Error('Ogiltig klinik'); e.status = 400; throw e; }

    const treatmentQ = await client.query(
      'SELECT id, data, clinic_id FROM e_treatment WHERE id = $1 AND clinic_id = $2 LIMIT 1',
      [treatmentId, clinicId]
    );
    const treatment = treatmentQ.rows[0] && normalize(treatmentQ.rows[0]);
    if (!treatment) { const e = new Error('Ogiltig behandling'); e.status = 400; throw e; }

    const staffQ = await client.query(
      `SELECT id, data, clinic_id FROM e_staff
       WHERE clinic_id = $1 AND data->>'name' = $2
         AND COALESCE((data->>'active')::boolean, true) = true
       LIMIT 1 FOR UPDATE`,
      [clinicId, staffName]
    );
    const staff = staffQ.rows[0] && normalize(staffQ.rows[0]);
    if (!staff) { const e = new Error('Behandlaren finns inte eller är inte aktiv.'); e.status = 400; throw e; }

    const allowed = parseAllowed(staff.allowed_treatment_ids);
    if (allowed !== null && !allowed.includes(treatment.id)) {
      const e = new Error('Den valda behandlaren är inte behörig att utföra den här behandlingen.');
      e.status = 403; throw e;
    }

    if (treatment.guest_booking_allowed === false && !guestOwnsEmail) {
      const e = new Error('Den här behandlingen kräver att du är inloggad med samma e-postadress som bokningen.');
      e.status = 401; throw e;
    }

    const duration = Math.max(1, Number(treatment.duration) || 30);
    const end = new Date(start.getTime() + duration * 60000);
    const dateStr = clinicDateOf(start.getTime());
    const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

    const minLead = Math.max(0, Number(treatment.min_lead_hours) || 0);
    const maxLead = Math.max(0, Number(treatment.max_lead_days) || 0);
    const now = Date.now();
    if (start.getTime() < now + minLead * 3600000) {
      const e = new Error('Tiden ligger för nära inpå. Välj en senare tid.'); e.status = 409; throw e;
    }
    if (maxLead > 0 && start.getTime() > now + maxLead * 86400000) {
      const e = new Error('Tiden ligger för långt fram i tiden.'); e.status = 409; throw e;
    }

    if (Number(treatment.waiting_period_days) > 0 && start.getTime() < now + Number(treatment.waiting_period_days) * 86400000) {
      const e = new Error(`Denna behandling har en väntetid på ${treatment.waiting_period_days} dagar.`);
      e.status = 400; throw e;
    }

    const minAge = treatment.treatment_type === 'injektion'
      ? Math.max(18, Number(treatment.min_age) || 0)
      : Math.max(0, Number(treatment.min_age) || 0);
    if (minAge > 0) {
      if (!birthDate || ageAt(start, birthDate) < minAge) {
        const e = new Error(`Denna behandling kräver att du är minst ${minAge} år.`);
        e.status = 400; throw e;
      }
    }

    const scheduleQ = await client.query(
      `SELECT data FROM e_staff_schedule
       WHERE clinic_id = $1 AND data->>'staff_name' = $2
         AND COALESCE((data->>'day_of_week')::int, -1) = $3`,
      [clinicId, staffName, weekday]
    );
    const schedules = scheduleQ.rows.map(r => normalize(r)).filter(s =>
      s.start_time && s.end_time &&
      (!s.effective_from || dateStr >= s.effective_from) &&
      (!s.effective_until || dateStr <= s.effective_until)
    );

    function zonedToEpoch(date, hhmm) {
      const [y, mo, d] = String(date).split('-').map(Number);
      const [h, mi] = String(hhmm).split(':').map(Number);
      const guess = Date.UTC(y, mo - 1, d, h, mi);
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23', year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit'
      });
      const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
      const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
      const offset = asUtc - Math.floor(guess / 1000) * 1000;
      return guess - offset;
    }

    const withinSchedule = schedules.some(s => {
      const ws = zonedToEpoch(dateStr, s.start_time);
      const we = zonedToEpoch(dateStr, s.end_time);
      return start.getTime() >= ws && end.getTime() <= we;
    });
    if (!withinSchedule) {
      const e = new Error('Tiden ligger utanför behandlarens arbetstid.'); e.status = 409; throw e;
    }

    // Serialisera bokningar som konkurrerar om samma tid/resurser så två samtidiga
    // requests inte båda hinner se en ledig slot innan någon av dem INSERT:ar.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`booking:${clinicId}:${staffName}:${start.toISOString()}`]
    );
    if (treatment.room_id) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`room:${clinicId}:${treatment.room_id}:${start.toISOString()}`]
      );
    }

    const dayStart = new Date(start.getTime() - 24 * 3600000).toISOString();
    const dayEnd = new Date(end.getTime() + 24 * 3600000).toISOString();
    const beforeMs = Math.max(0, Number(treatment.buffer_before) || 0) * 60000;
    const afterMs = Math.max(0, Number(treatment.buffer_after) || 0) * 60000;
    const blockStart = start.getTime() - beforeMs;
    const blockEnd = end.getTime() + afterMs;
    const timeOffQ = await client.query(
      `SELECT data FROM e_staff_time_off
       WHERE clinic_id = $1 AND data->>'staff_name' = $2
         AND COALESCE(data->>'start','') < $4
         AND COALESCE(data->>'end','') > $3`,
      [clinicId, staffName, start.toISOString(), end.toISOString()]
    );
    const timeOff = timeOffQ.rows.map(r => normalize(r));
    if (timeOff.some(o => overlap(blockStart, blockEnd, new Date(o.start).getTime(), new Date(o.end).getTime()))) {
      const e = new Error('Behandlaren är inte tillgänglig på den tiden.'); e.status = 409; throw e;
    }

    const bookingsQ = await client.query(
      `SELECT id, data FROM e_booking
       WHERE clinic_id = $1
         AND data->>'start_time' < $3
         AND COALESCE(data->>'end_time', data->>'start_time') > $2
         AND COALESCE(data->>'status','') NOT IN ('cancelled','no_show')`,
      [clinicId, dayStart, dayEnd]
    );
    const activeBookings = bookingsQ.rows.map(r => normalize(r));

    if (activeBookings.some(b =>
      b.staff_name === staffName &&
      overlap(blockStart, blockEnd, new Date(b.start_time).getTime(), new Date(b.end_time || b.start_time).getTime())
    )) {
      const e = new Error('Tiden är tyvärr inte längre tillgänglig. Välj en annan tid.');
      e.status = 409; throw e;
    }

    if (treatment.room_id && activeBookings.some(b =>
      b.room_id === treatment.room_id &&
      overlap(blockStart, blockEnd, new Date(b.start_time).getTime(), new Date(b.end_time || b.start_time).getTime())
    )) {
      const e = new Error('Rummet är redan bokat på den tiden.'); e.status = 409; throw e;
    }

    const requiredResourceIds = parseArray(treatment.required_resource_ids);
    if (requiredResourceIds.length) {
      const resourceQ = await client.query(
        `SELECT id, data FROM e_resource
         WHERE clinic_id = $1 AND id = ANY($2::text[])`,
        [clinicId, requiredResourceIds]
      );
      const quantities = Object.fromEntries(resourceQ.rows.map(r => {
        const d = normalize(r);
        return [String(d.id), Math.max(1, Number(d.quantity) || 1)];
      }));
      for (const rid of requiredResourceIds) {
        const capacity = quantities[rid] ?? 1;
        const concurrent = activeBookings.filter(b => {
          if (!parseArray(b.resource_ids).includes(rid)) return false;
          return overlap(blockStart, blockEnd, new Date(b.start_time).getTime(), new Date(b.end_time || b.start_time).getTime());
        }).length;
        if (concurrent >= capacity) {
          const e = new Error('En nödvändig resurs är redan bokad på den tiden.'); e.status = 409; throw e;
        }
      }
    }

    const customerQ = await client.query(
      `SELECT id, data, clinic_id FROM e_customer
       WHERE clinic_id = $1 AND lower(data->>'email') = lower($2)
       LIMIT 1 FOR UPDATE`,
      [clinicId, email]
    );
    let cust = customerQ.rows[0] && normalize(customerQ.rows[0]);

    if (cust && !guestOwnsEmail) {
      const e = new Error('Det finns redan en kund med den här e-postadressen. Logga in och boka igen.');
      e.status = 409; throw e;
    }

    if (!cust) {
      const data = {
        clinic_id: clinicId, name, email, phone, birth_date: birthDate,
        personnummer, status: 'lead',
      };
      const ins = await client.query(
        'INSERT INTO e_customer (data, clinic_id) VALUES ($1::jsonb, $2) RETURNING *',
        [JSON.stringify(data), clinicId]
      );
      cust = normalize(ins.rows[0]);
    } else {
      const patch = { ...(cust) };
      if (!patch.phone && phone) patch.phone = phone;
      if (!patch.name && name) patch.name = name;
      if (!patch.birth_date && birthDate) patch.birth_date = birthDate;
      if (!patch.personnummer && personnummer) patch.personnummer = personnummer;
      await client.query(
        'UPDATE e_customer SET data = $1::jsonb, updated_date = NOW() WHERE id = $2',
        [JSON.stringify(Object.fromEntries(Object.entries(patch).filter(([k]) => !['id','created_date','updated_date','clinic_id'].includes(k)))), cust.id]
      );
      cust = { ...cust, ...patch };
    }

    const paymentToken = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    const paymentHash = sha256(paymentToken);
    const resourceIds = treatment.required_resource_ids || '[]';

    const bookingData = {
      clinic_id: clinicId, customer_id: cust.id, customer_name: cust.name || name,
      treatment_id: treatment.id, treatment_name: treatment.name, staff_name: staffName,
      start_time: start.toISOString(), end_time: end.toISOString(), status: 'pending',
      price: Number(treatment.price) || 0, room_id: treatment.room_id || '',
      resource_ids: resourceIds, deposit_amount: Number(treatment.deposit_amount) || 0,
      pay_token_hash: paymentHash,
    };
    const bookingQ = await client.query(
      'INSERT INTO e_booking (data, clinic_id) VALUES ($1::jsonb, $2) RETURNING *',
      [JSON.stringify(bookingData), clinicId]
    );
    const booking = normalize(bookingQ.rows[0]);

    try {
      const journalData = {
        clinic_id: clinicId, customer_id: cust.id, customer_name: cust.name || name,
        treatment_id: treatment.id, treatment_name: treatment.name, booking_id: booking.id,
        provider: staffName, entry_date: start.toISOString(), notes: 'Väntar på behandling',
        is_signed: false, version: 1,
      };
      await client.query('INSERT INTO e_journal_entry (data, clinic_id) VALUES ($1::jsonb, $2)', [JSON.stringify(journalData), clinicId]);
    } catch (e) {
      console.error('[public-booking] journal create:', e.message);
    }

    const requirements = [];
    if (treatment.requires_health_declaration) requirements.push('Hälsodeklaration');
    if (treatment.requires_consent !== false) requirements.push('Samtycke');
    if (treatment.requires_treatment_info) requirements.push('Behandlingsinformation & risker');
    if (treatment.requires_aftercare) requirements.push('Eftervårdsinformation');
    if (treatment.requires_payment) requirements.push('Betalning');
    const formIds = parseArray(treatment.required_form_ids);
    if (formIds.length) requirements.push(`${formIds.length} formulär`);

    return {
      booking: {
        id: booking.id, treatment_name: treatment.name, staff_name: staffName,
        start_time: booking.start_time, end_time: booking.end_time, price: Number(treatment.price) || 0,
      },
      requirements,
      payment_token: treatment.requires_payment && Number(treatment.price) > 0 ? paymentToken : undefined,
      email: email,
      clinic_name: clinic.name || clinic.brand_name || 'Lydia',
      portal_url: (() => { const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https'; const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || process.env.PUBLIC_APP_URL || ''; return host ? `${proto}://${host}/portal` : '/portal'; })(),
      customer_name: cust.name || name,
    };
  }, { bypassRls: true });

  try {
    await sendMail({
      to: result.email,
      template_name: 'BookingConfirmation',
      variables: {
        customer_name: result.customer_name,
        treatment_name: result.booking.treatment_name,
        staff_name: result.booking.staff_name,
        start_time: new Date(result.booking.start_time).toLocaleString('sv-SE', { timeZone: TZ, day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        price: String(result.booking.price || ''),
        portal_url: result.portal_url,
        clinic_name: result.clinic_name,
      },
    });
  } catch (e) {
    console.error('[public-booking] confirmation mail:', e.message);
  }

  return {
    booking: result.booking,
    requirements: result.requirements,
    payment_token: result.payment_token,
  };
}
