import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Returnerar lediga starttider för en behandlare en viss dag, givet behandlingens
// längd och kliniken öppettider (09:00–17:00). Befintliga bokningar utesluts.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { clinic_id, staff_name, date, duration } = body;
    if (!date || !duration || !staff_name) {
      return Response.json({ error: 'staff_name, date och duration krävs' }, { status: 400 });
    }

    const dayStart = new Date(`${date}T09:00:00`);
    const dayEnd = new Date(`${date}T17:00:00`);
    const dayMax = new Date(`${date}T23:59:59`);

    const bookings = await svc.entities.Booking.filter(
      {
        clinic_id, staff_name,
        start_time: { $gte: dayStart.toISOString(), $lte: dayMax.toISOString() },
        status: { $nin: ['cancelled', 'no_show'] },
      },
      { sort: 'start_time', limit: 200 }
    );
    const busy = (bookings.items || []).map((b) => ({
      start: new Date(b.start_time),
      end: b.end_time ? new Date(b.end_time) : new Date(new Date(b.start_time).getTime() + (b.duration || 30) * 60000),
    }));

    const slots = [];
    const stepMin = 30;
    const durMs = duration * 60000;
    for (let t = new Date(dayStart); t.getTime() + durMs <= dayEnd.getTime(); t = new Date(t.getTime() + stepMin * 60000)) {
      const slotEnd = new Date(t.getTime() + durMs);
      const conflict = busy.some((b) => t < b.end && slotEnd > b.start);
      if (!conflict) slots.push(t.toISOString());
    }
    return Response.json({ slots });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}