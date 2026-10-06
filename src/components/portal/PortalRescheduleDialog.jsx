import React, { useState } from "react";
import { getAvailableSlots } from "@/functions/getAvailableSlots";
import { rescheduleBooking } from "@/functions/rescheduleBooking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarClock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TZ = "Europe/Stockholm";
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

// Ombokning i kundportalen: kunden väljer bland verkligt lediga tider (samma motor som onlinebokningen).
export default function PortalRescheduleDialog({ booking, onDone }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadSlots = async (d) => {
    setDate(d);
    setSlot(null);
    setSlots(null);
    setError(null);
    try {
      const res = await getAvailableSlots({
        clinic_id: booking.clinic_id, staff_name: booking.staff_name, date: d, treatment_id: booking.treatment_id,
      });
      setSlots(res.data.slots || []);
    } catch (e) {
      setSlots([]);
      setError(e?.response?.data?.error || "Kunde inte hämta lediga tider");
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await rescheduleBooking({ booking_id: booking.id, new_start_time: slot });
      setOpen(false);
      await onDone();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Kunde inte omboka");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadSlots(date); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><CalendarClock className="mr-1 h-3.5 w-3.5" />Omboka</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Omboka {booking.treatment_name}</DialogTitle></DialogHeader>
        <Input type="date" value={date} min={todayStr()} onChange={(e) => loadSlots(e.target.value)} className="max-w-[200px]" />
        {slots === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga lediga tider denna dag.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button key={s} type="button" onClick={() => setSlot(s)} className={cn("rounded-lg border px-2 py-1.5 text-sm hover:border-primary", slot === s && "border-primary bg-primary text-primary-foreground")}>{fmtTime(s)}</button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button disabled={!slot || busy} onClick={confirm}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Bekräfta ny tid</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}