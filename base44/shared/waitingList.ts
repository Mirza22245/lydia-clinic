// Delad logik för väntelista. Portabel — tar ett svc-liknande dataaccess-objekt.
// Används vid avbokning/frigörning av en tid för att automatiskt erbjuda plats
// till matchande väntelistekunder.

// Hittar aktiva väntelisteposter som matchar en frigjord bokning (samma behandling,
// valfritt samma behandlare, inom önskat datumfönster) och markerar dem som
// "offered" + skickar ett e-posterbjudande. Returnerar antal som erbjudits.
export async function notifyWaitingListOnCancellation(svc: any, cancelledBooking: any) {
  if (!cancelledBooking || !cancelledBooking.clinic_id) return 0;
  const clinicId = cancelledBooking.clinic_id;
  const treatmentId = cancelledBooking.treatment_id || '';
  const staffName = cancelledBooking.staff_name || '';
  const slotStart = cancelledBooking.start_time;

  // Hämta aktiva väntelisteposter för kliniken + behandling.
  const query: any = { clinic_id: clinicId, status: 'active' };
  if (treatmentId) query.treatment_id = treatmentId;
  const page = await svc.entities.WaitingList.filter(query, { limit: 100, sort: 'created_date' });
  const entries = page.items || [];

  let notified = 0;
  for (const entry of entries) {
    // Behandlarpreferens: om väntelisteposten anger en önskad behandlare måste
    // den matcha den frigjorda tidens behandlare.
    if (entry.staff_name && staffName && entry.staff_name !== staffName) continue;
    // Datumfönster: den frigjorda tiden ska ligga inom önskat fönster om angivet.
    const slotDate = slotStart ? slotStart.slice(0, 10) : '';
    if (entry.desired_from && slotDate && slotDate < entry.desired_from) continue;
    if (entry.desired_until && slotDate && slotDate > entry.desired_until) continue;

    try {
      await svc.entities.WaitingList.update(entry.id, {
        status: 'offered',
        notified_at: new Date().toISOString(),
      });
    } catch { /* fortsätt med nästa */ }

    // E-posterbjudande — får inte blockera. Enkel plain-text med länk till bokningen.
    if (entry.customer_email) {
      try {
        const fmtTime = (d: string) => new Date(d).toLocaleString('sv-SE', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
        const clinic = await svc.entities.Clinic.get(clinicId).catch(() => null);
        const clinicName = clinic?.name || 'Klinik';
        await svc.integrations.Core.SendEmail({
          to: entry.customer_email,
          subject: `En tid har blivit ledig — ${entry.treatment_name}`,
          body: [
            `Hej ${entry.customer_name || ''},`,
            ``,
            `En tid för ${entry.treatment_name} har blivit ledig${staffName ? ` hos ${staffName}` : ''}.`,
            `Tid: ${fmtTime(slotStart)}`,
            ``,
            `Gå till bokningen för att reservera tiden innan någon annan gör det:`,
            ``,
            `Vänliga hälsningar,`,
            clinicName,
          ].join('\n'),
        });
      } catch { /* swallow */ }
    }
    notified += 1;
  }
  return notified;
}