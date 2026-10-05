import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarClock, Loader2 } from "lucide-react";
import { rescheduleBooking } from "@/functions/rescheduleBooking";

// Ombokningsdialog för kundportalen och personalvyn.
// Låter användaren välja ny datum/tid och anropar rescheduleBooking.
export default function RescheduleDialog({ bookingId, children, onDone }) {
  const [open, setOpen] = useState(false);
  const [newStartTime, setNewStartTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!newStartTime) return;
    setSaving(true);
    setError(null);
    try {
      // Konvertera lokal datetime till ISO
      const iso = new Date(newStartTime).toISOString();
      await rescheduleBooking({ booking_id: bookingId, new_start_time: iso });
      setOpen(false);
      setNewStartTime("");
      if (onDone) onDone();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Kunde inte omboka");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        {children || <Button variant="outline" size="sm"><CalendarClock className="w-4 h-4 mr-1" />Omboka</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Omboka tid</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-time">Ny datum och tid</Label>
            <Input id="new-time" type="datetime-local" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} required />
          </div>
          <p className="text-sm text-muted-foreground">Befintliga formulär, samtycken och betalningar behålls. Du får en ny bekräftelse via e-post.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="submit" disabled={saving || !newStartTime}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Omboka</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}