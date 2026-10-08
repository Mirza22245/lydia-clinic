import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Image as ImageIcon, FileText, Loader2, Trash2, Eye, Upload, Lock } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { logAudit } from "@/lib/audit";
import { Image } from "@/components/ui/image";

const fmtSize = (n) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function PatientFilesPanel({ customerId, customerName }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [signedUrl, setSignedUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const page = await base44.entities.PatientFile.filter({ customer_id: customerId }, { sort: "-uploaded_at", limit: 100 });
      setFiles(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [customerId]);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const clinic_id = await getClinicId();
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const isImage = file.type.startsWith("image/");
      const created = await base44.entities.PatientFile.create({
        customer_id: customerId,
        customer_name: customerName || "",
        file_name: file.name,
        file_uri,
        file_type: isImage ? "image" : "document",
        mime_type: file.type || "",
        size_bytes: file.size || 0,
        uploaded_by: (await base44.auth.me().catch(() => null))?.full_name || "",
        uploaded_at: new Date().toISOString(),
        clinic_id,
      });
      await logAudit("patient_file_upload", "PatientFile", created.id, `Fil uppladdad för ${customerName || customerId}: ${file.name}`, { customer_id: customerId, file_type: isImage ? "image" : "document" });
      await load();
    } finally {
      setUploading(false);
    }
  };

  const openView = async (f) => {
    setViewing(f);
    setSignedUrl(null);
    setLoadingUrl(true);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: f.file_uri, expires_in: 300 });
      setSignedUrl(signed_url);
    } finally {
      setLoadingUrl(false);
    }
  };

  const remove = async (f) => {
    if (!confirm(`Ta bort filen "${f.file_name}"? Referensen tas bort permanent och loggas.`)) return;
    await base44.entities.PatientFile.delete(f.id);
    await logAudit("patient_file_delete", "PatientFile", f.id, `Fil borttagen för ${customerName || customerId}: ${f.file_name}`, { customer_id: customerId });
    await load();
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-medium"><ImageIcon className="w-4 h-4" />Filer & bilder</h2>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><Lock className="w-3 h-3" />Krypterat</span>
          <Button size="sm" onClick={onPick} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {uploading ? "Laddar upp…" : "Ladda upp"}
          </Button>
          <input ref={inputRef} type="file" className="hidden" accept="image/*,application/pdf,.pdf,.doc,.docx" onChange={onFile} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : files.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga filer uppladdade. Allt material lagras krypterat och åtkomststyrs av appens behörigheter.</div>
      ) : (
        <div className="divide-y divide-border">
          {files.map((f) => {
            const Icon = f.file_type === "image" ? ImageIcon : FileText;
            return (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.file_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {fmtSize(f.size_bytes)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""} · {fmtDate(f.uploaded_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openView(f)}><Eye className="w-4 h-4 mr-1" />Visa</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(f)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-[200px] items-center justify-center">
            {loadingUrl ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : signedUrl ? (
              viewing?.file_type === "image" ? (
                <Image src={signedUrl} alt={viewing.file_name} className="max-h-[60vh] w-auto rounded-lg" fittingType="fit" />
              ) : (
                <iframe src={signedUrl} title={viewing.file_name} className="h-[60vh] w-full rounded-lg border border-border" />
              )
            ) : (
              <p className="text-sm text-muted-foreground">Kunde inte hämta filen.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Stäng</Button>
            {signedUrl && (
              <Button asChild><a href={signedUrl} download={viewing?.file_name}>Ladda ner</a></Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}