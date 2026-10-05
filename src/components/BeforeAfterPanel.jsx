import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon, Plus, Loader2, Upload, Camera } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";

// Före/efter-bildsystem för behandlingar. Bilderna lagras privat via
// UploadPrivateFile och kan visas med en signerad URL.
export default function BeforeAfterPanel({ customerId, customerName, bookingId, treatmentId, treatmentName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ media_type: "before", treatment_area: "", taken_by: "" });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = bookingId ? { customer_id: customerId, booking_id: bookingId } : { customer_id: customerId };
      const r = await base44.entities.TreatmentMedia.filter(q, { sort: "-taken_at", limit: 100 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, [customerId, bookingId]);

  useEffect(() => { load(); }, [load]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setPreviewUrl(URL.createObjectURL(f)); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await base44.entities.TreatmentMedia.create({
        customer_id: customerId, customer_name: customerName,
        treatment_id: treatmentId || "", treatment_name: treatmentName || "",
        booking_id: bookingId || "",
        media_type: form.media_type, file_uri, file_name: file.name,
        treatment_area: form.treatment_area,
        taken_at: new Date().toISOString(),
        taken_by: form.taken_by,
        consent_given: true, internal_only: true,
        clinic_id,
      });
      setOpen(false);
      setFile(null);
      setPreviewUrl(null);
      setForm({ media_type: "before", treatment_area: "", taken_by: "" });
      await load();
    } finally { setSaving(false); }
  };

  const getSignedUrl = async (uri) => {
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      return signed_url;
    } catch { return null; }
  };

  const [signedUrls, setSignedUrls] = useState({});
  useEffect(() => {
    items.forEach(async (m) => {
      if (!signedUrls[m.file_uri]) {
        const url = await getSignedUrl(m.file_uri);
        if (url) setSignedUrls((s) => ({ ...s, [m.file_uri]: url }));
      }
    });
  }, [items]);

  const beforeItems = items.filter((m) => m.media_type === "before");
  const afterItems = items.filter((m) => m.media_type === "after");

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Laddar bilder...</div>;

  const renderGrid = (list, label) => list.length > 0 && (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {list.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="aspect-square bg-muted">
              {signedUrls[m.file_uri] ? (
                <img src={signedUrls[m.file_uri]} alt={m.file_name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium">{m.treatment_area || m.file_name}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(m.taken_at).toLocaleDateString("sv-SE")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Camera className="w-4 h-4" />Före/efter-bilder</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Lägg till bild</Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga bilder registrerade. Bilderna lagras privat.</p>
      ) : (
        <div className="space-y-4">
          {renderGrid(beforeItems, "Före")}
          {renderGrid(afterItems, "Efter")}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ny bild</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Typ</Label><select value={form.media_type} onChange={(e) => setForm((s) => ({ ...s, media_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="before">Före</option><option value="after">Efter</option><option value="during">Under</option></select></div>
            <div className="space-y-1"><Label className="text-xs">Behandlingsområde</Label><Input value={form.treatment_area} onChange={(e) => setForm((s) => ({ ...s, treatment_area: e.target.value }))} placeholder="t.ex. Panna" /></div>
            <div className="space-y-1"><Label className="text-xs">Fotograf/behandlare</Label><Input value={form.taken_by} onChange={(e) => setForm((s) => ({ ...s, taken_by: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Bild</Label>
              <div className="rounded-lg border-2 border-dashed border-border p-4 text-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="preview" className="mx-auto max-h-40 rounded" />
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground">
                    <Upload className="w-6 h-6" /><span className="text-sm">Välj bild</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Bilderna lagras privat — ingen publik URL, åtkomst följer appens behörigheter.</p>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving || !file}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Spara</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}