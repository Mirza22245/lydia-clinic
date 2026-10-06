import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Globe, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const parseFaq = (raw) => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map((x) => ({ q: x.q || "", a: x.a || "" })) : [];
  } catch {
    return [];
  }
};

export default function PublicSiteCard({ clinic, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    brand_name: clinic.brand_name || "",
    description: clinic.description || "",
    opening_hours: clinic.opening_hours || "",
    logo_url: clinic.logo_url || "",
  });
  const [faq, setFaq] = useState(parseFaq(clinic.faq));
  const [saving, setSaving] = useState(false);

  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));
  const setFaqItem = (i, key, val) => setFaq((l) => l.map((x, idx) => (idx === i ? { ...x, [key]: val } : x)));

  const save = async () => {
    setSaving(true);
    try {
      const cleanFaq = faq.filter((x) => x.q.trim() && x.a.trim());
      const updated = await base44.entities.Clinic.update(clinic.id, { ...form, faq: JSON.stringify(cleanFaq) });
      onSaved(updated);
      setFaq(cleanFaq);
      toast({ title: "Sparat", description: "Webbplatsens innehåll har uppdaterats." });
    } catch (err) {
      toast({ variant: "destructive", title: "Kunde inte spara", description: err?.message || "Försök igen." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Webbplats och bokningssida</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="brand_name">Namn på webbplatsen</Label><Input id="brand_name" value={form.brand_name} onChange={set("brand_name")} /></div>
        <div className="space-y-2"><Label htmlFor="logo_url">Logotyp (URL)</Label><Input id="logo_url" value={form.logo_url} onChange={set("logo_url")} placeholder="https://..." /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="description">Presentationstext</Label><Textarea id="description" rows={3} value={form.description} onChange={set("description")} /></div>
      <div className="space-y-2">
        <Label htmlFor="opening_hours">Öppettider (en rad per rad)</Label>
        <Textarea id="opening_hours" rows={4} value={form.opening_hours} onChange={set("opening_hours")} placeholder={"Mån–Fre: 09:00–18:00\nLör: 10:00–15:00"} />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Vanliga frågor</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => setFaq((l) => [...l, { q: "", a: "" }])}><Plus className="mr-1 h-4 w-4" />Lägg till</Button>
        </div>
        {faq.map((f, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex gap-2">
              <Input value={f.q} onChange={(e) => setFaqItem(i, "q", e.target.value)} placeholder="Fråga" />
              <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => setFaq((l) => l.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Textarea rows={2} value={f.a} onChange={(e) => setFaqItem(i, "a", e.target.value)} placeholder="Svar" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Spara webbplats
        </Button>
      </div>
    </div>
  );
}