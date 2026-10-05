import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { computeAvailableSlots, fetchAvailabilityData, parseResourceIds } from '../../shared/availability.ts';

// Returnerar lediga starttider för en behandlare en viss dag. Tar hänsyn till
// personalens arbetsschema, semester/sjuk/blockerade tider, befintliga bokningar,
// behandlingens buffertider, minsta/max framförhållning, samt rum- och
// resurskonflikter. All konfliktlogik ligger i base44/shared/availability.ts.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { clinic_id, staff_name, date, duration, treatment_id } = body;
    if (!date || !staff_name) {
      return Response.json({ error: 'staff_name och date krävs' }, { status: 400 });
    }

    let durationMin = duration || 30;
    let bufferBefore = 0, bufferAfter = 0, minLeadHours = 0, maxLeadDays = 0;
    let requireRoomId: string | undefined;
    let requireResourceIds: string[] = [];
    if (treatment_id) {
      const treatment = await svc.entities.Treatment.get(treatment_id).catch(() => null);
      if (treatment && treatment.clinic_id === clinic_id) {
        durationMin = treatment.duration || durationMin;
        bufferBefore = treatment.buffer_before || 0;
        bufferAfter = treatment.buffer_after || 0;
        minLeadHours = treatment.min_lead_hours || 0;
        maxLeadDays = treatment.max_lead_days || 0;
        requireRoomId = treatment.room_id || undefined;
        requireResourceIds = parseResourceIds(treatment.required_resource_ids);
      }
    }

    const data = await fetchAvailabilityData(svc, { clinic_id, staff_name, date, requireRoomId, requireResourceIds });

    const slots = computeAvailableSlots({
      date,
      durationMin,
      bufferBeforeMin: bufferBefore,
      bufferAfterMin: bufferAfter,
      minLeadHours,
      maxLeadDays,
      stepMin: 15,
      schedule: data.schedule,
      timeOff: data.timeOff,
      staffBookings: data.staffBookings,
      roomBookings: data.roomBookings,
      resourceBookings: data.resourceBookings,
      resourceQuantities: data.resourceQuantities,
      requireRoomId,
      requireResourceIds,
    });

    return Response.json({ slots, date, staff_name });
  } catch (error) {
    console.error('getAvailableSlots:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}