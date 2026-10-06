import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, ClipboardCheck, Eye, Trash, X } from "lucide-react";
import { getClinicId } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

const typeLabels = { health_declaration: "Hälsodeklaration", consent: "Samtycke", custom: "Annat" };
const typeColors = {
  health_declaration: "bg-rose-100 text-rose-700",
  consent: "bg-violet-100 text-violet-700",
  custom: "bg-slate-100 text-slate-600",
};
const qTypes = [
  { key: "text", label: "Text" },
  { key: "textarea", label: "Fritext" },
  { key: "checkbox", label: "Kryssruta" },
];
const emptyTemplate = { name: "", type: "health_declaration", description: "", questions: [{ label: "", type: "text" }] };

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const parseQuestions = (str) => {
  try {
    const arr = JSON.parse(str || "[]");
    return Array.isArray(arr) && arr.length ? arr : [{ label: "", type: "text" }];
  } catch {
    return [{ label: "", type: "text" }];
  }
};
const parseAnswers = (str) => {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
};
const userName = async () => {
  try { const me = await base44.auth.me(); return me?.full_name || me?.email || ""; } catch { return ""; }
};

export default function Forms() {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tplOpen, setTplOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);
  const [tplForm, setTplForm] = useState(emptyTemplate);
  const [savingTpl, setSavingTpl] = useState(false);

  const [fillOpen, setFillOpen] = useState(false);
  const [fillTpl, setFillTpl] = useState(null);
  const [fillForm, setFillForm] = useState({ customer_id: "", booking_id: "", answers: {} });
  const [customers, setCustomers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [savingFill, setSavingFill] = useState(false);

  const [viewSub, setViewSub] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        base44.entities.FormTemplate.filter({}, { sort: "-created_date", limit: 100 }),
        base44.entities.FormSubmission.filter({}, { sort: "-submitted_at", limit: 100 }),
      ]);
      setTemplates(t.items || []);
      setSubmissions(s.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fetchOptions = async () => {
    const [c, b] = await Promise.all([
      base44.entities.Customer.filter({}, { limit: 200 }),
      base44.entities.Booking.filter({}, { limit: 200, sort: "-start_time" }),
    ]);
    setCustomers(c.items || []);
    setBookings(b.items || []);
  };

  // ---- Template builder ----
  const openCreateTpl = () => { setEditingTpl(null); setTplForm(emptyTemplate); setTplOpen(true); };
  const openEditTpl = (t) => {
    setEditingTpl(t);
    setTplForm({
      name: t.name || "",
      type: t.type || "health_declaration",
      description: t.description || "",
      questions: parseQuestions(t.questions),
    });
    setTplOpen(true);
  };
  const setTpl = (f) => (e) => setTplForm((s) => ({ ...s, [f]: e.target.value }));
  const setQ = (i, field, value) => setTplForm((s) => {
    const qs = s.questions.map((q, idx) => (idx === i ? { ...q, [field]: value } : q));
    return { ...s, questions: qs };
  });
  const addQ = () => setTplForm((s) => ({ ...s, questions: [...s.questions, { label: "", type: "text" }] }));
  const removeQ = (i) => setTplForm((s) => ({ ...s, questions: s.questions.filter((_, idx) => idx !== i) }));

  const saveTpl = async (e) => {
    e.preventDefault();
    if (!tplForm.name) return;
    setSavingTpl(true);
    try {
      const clinic_id = await getClinicId();
      const data = {
        clinic_id,
        name: tplForm.name,
        type: tplForm.type,
        description: tplForm.description || undefined,
        questions: JSON.stringify(tplForm.questions.filter((q) => q.label)),
      };
      if (editingTpl) await base44.entities.FormTemplate.update(editingTpl.id, { ...data, version: (editingTpl.version || 1) + 1 });
      else await base44.entities.FormTemplate.create(data);
      setTplOpen(false);
      setEditingTpl(null);
      await load();
    } finally {
      setSavingTpl(false);
    }
  };

  const removeTpl = async (t) => {
    if (confirm(`Ta bort mallen "${t.name}"?`)) {
      await base44.entities.FormTemplate.delete(t.id);
      await load();
    }
  };

  // ---- Fill form ----
  const openFill = async (t) => {
    setFillTpl({ ...t, questions: parseQuestions(t.questions) });
    setFillForm({ customer_id: "", booking_id: "", answers: {} });
    await fetchOptions();
    setFillOpen(true);
  };
  const setFill = (f) => (e) => setFillForm((s) => ({ ...s, [f]: e.target.value }));
  const setAnswer = (i, value) => setFillForm((s) => ({ ...s, answers: { ...s.answers, [i]: value } }));

  const saveFill = async (e) => {
    e.preventDefault();
    if (!fillForm.customer_id) return;
    setSavingFill(true);
    try {
      const clinic_id = await getClinicId();
      const cust = customers.find((c) => c.id === fillForm.customer_id);
      const name = await userName();
      await base44.entities.FormSubmission.create({
        clinic_id,
        template_id: fillTpl.id,
        template_name: fillTpl.name,
        template_version: fillTpl.version || 1,
        questions_snapshot: JSON.stringify(fillTpl.questions || []),
        customer_id: fillForm.customer_id,
        customer_name: cust?.name || "",
        booking_id: fillForm.booking_id || undefined,
        answers: JSON.stringify(fillForm.answers),
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: name || "Okänd",
      });
      setFillOpen(false);
      setFillTpl(null);
      await load();
    } finally {
      setSavingFill(false);
    }
  };

  const removeSub = async (s) => {
    if (confirm("Ta bort inlämningen?")) {
      await base44.entities.FormSubmission.delete(s.id);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Formulär</h1>
          <p className="text-sm text-muted-foreground">Skapa hälsodeklarationer och samtyckesformulär som fylls i inför behandling.</p>
        </div>
        <Button size="sm" onClick={openCreateTpl}><Plus className="w-4 h-4 mr-1" />Ny mall</Button>
      </div>

      <div className="flex gap-1.5">
        {[
          { key: "templates", label: "Mallar" },
          { key: "submissions", label: "Inlämningar" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "templates" ? (
        templates.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center">
            <p className="font-medium">Inga formulärmallar</p>
            <p className="mt-1 text-sm text-muted-foreground">Skapa din första mall för hälsodeklaration eller samtycke.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => {
              const qs = parseQuestions(t.questions);
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{t.name}</p>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", typeColors[t.type] || typeColors.custom)}>{typeLabels[t.type] || t.type}</span>
                      </div>
                      {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{qs.length} frågor · v{t.version || 1}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => openFill(t)}><ClipboardCheck className="w-4 h-4 mr-1" />Fyll i</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditTpl(t)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeTpl(t)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <p className="font-medium">Inga inlämningar</p>
          <p className="mt-1 text-sm text-muted-foreground">Fyll i ett formulär från mallarna för att se det här.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.template_name} · {s.customer_name}</p>
                <p className="truncate text-sm text-muted-foreground">{fmtDateTime(s.submitted_at)}{s.submitted_by ? ` · ${s.submitted_by}` : ""}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Inlämnad</span>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewSub(s)}><Eye className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeSub(s)}><Trash className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}

      {/* Mallbyggare */}
      <Dialog open={tplOpen} onOpenChange={(o) => { setTplOpen(o); if (!o) setEditingTpl(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTpl ? "Redigera mall" : "Ny formulärmall"}</DialogTitle>
            <DialogDescription>Bygg frågorna som patienten fyller i inför behandlingen.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTpl} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="name">Namn</Label>
              <Input id="name" value={tplForm.name} onChange={setTpl("name")} required placeholder="t.ex. Hälsodeklaration Botox" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <select id="type" value={tplForm.type} onChange={setTpl("type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="health_declaration">Hälsodeklaration</option>
                <option value="consent">Samtycke</option>
                <option value="custom">Annat</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea id="description" value={tplForm.description} onChange={setTpl("description")} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Frågor</Label>
              <div className="space-y-2">
                {tplForm.questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={q.label}
                      onChange={(e) => setQ(i, "label", e.target.value)}
                      placeholder={`Fråga ${i + 1}`}
                      className="flex-1"
                    />
                    <select value={q.type} onChange={(e) => setQ(i, "type", e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm">
                      {qTypes.map((qt) => <option key={qt.key} value={qt.key}>{qt.label}</option>)}
                    </select>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeQ(i)}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addQ}><Plus className="w-4 h-4 mr-1" />Lägg till fråga</Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setTplOpen(false); setEditingTpl(null); }}>Avbryt</Button>
              <Button type="submit" disabled={savingTpl || !tplForm.name}>{savingTpl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editingTpl ? "Spara" : "Skapa"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fyll i formulär */}
      <Dialog open={fillOpen} onOpenChange={(o) => { setFillOpen(o); if (!o) setFillTpl(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{fillTpl?.name}</DialogTitle>
            <DialogDescription>Fyll i formuläret på uppdrag av kunden inför behandlingen.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveFill} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Kund</Label>
                <select id="customer_id" value={fillForm.customer_id} onChange={setFill("customer_id")} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Välj kund…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking_id">Bokning (valfritt)</Label>
                <select id="booking_id" value={fillForm.booking_id} onChange={setFill("booking_id")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Ingen bokning</option>
                  {bookings.filter((b) => !fillForm.customer_id || b.customer_id === fillForm.customer_id).map((b) => (
                    <option key={b.id} value={b.id}>{b.treatment_name} · {fmtDateTime(b.start_time)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3 border-t border-border pt-3">
              {fillTpl?.questions?.filter((q) => q.label).map((q, i) => (
                <div key={i} className="space-y-1.5">
                  <Label>{q.label}</Label>
                  {q.type === "textarea" ? (
                    <Textarea value={fillForm.answers[i] || ""} onChange={(e) => setAnswer(i, e.target.value)} rows={2} />
                  ) : q.type === "checkbox" ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox id={`q-${i}`} checked={!!fillForm.answers[i]} onCheckedChange={(v) => setAnswer(i, v)} />
                      <Label htmlFor={`q-${i}`} className="text-sm font-normal text-muted-foreground">Ja</Label>
                    </div>
                  ) : (
                    <Input value={fillForm.answers[i] || ""} onChange={(e) => setAnswer(i, e.target.value)} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setFillOpen(false); setFillTpl(null); }}>Avbryt</Button>
              <Button type="submit" disabled={savingFill || !fillForm.customer_id}>{savingFill && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Skicka in</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visa inlämning */}
      <Dialog open={!!viewSub} onOpenChange={(o) => { if (!o) setViewSub(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewSub?.template_name}</DialogTitle>
            <DialogDescription>{viewSub?.customer_name} · {fmtDateTime(viewSub?.submitted_at)}{viewSub?.submitted_by ? ` · ${viewSub.submitted_by}` : ""} · v{viewSub?.template_version || 1}</DialogDescription>
          </DialogHeader>
          {(() => {
            if (!viewSub) return null;
            const tpl = templates.find((t) => t.id === viewSub.template_id);
            const qs = viewSub.questions_snapshot ? parseQuestions(viewSub.questions_snapshot) : (tpl ? parseQuestions(tpl.questions) : []);
            const ans = parseAnswers(viewSub.answers);
            return (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {qs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga frågor hittades för mallen.</p>
                ) : qs.map((q, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">{q.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {q.type === "checkbox" ? (ans[i] ? "Ja" : "Nej") : (ans[i] || "—")}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}