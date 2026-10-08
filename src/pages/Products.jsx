import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Pencil, Trash2, Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClinicId } from "@/lib/currentUser";
import FeatureGate from "@/components/FeatureGate";

const unitLabels = { st: "st", ml: "ml", mg: "mg", ie: "IE", pack: "förp" };
const empty = { name: "", sku: "", category: "", description: "", unit: "st", stock_quantity: 0, min_stock: 0, supplier: "", cost_price: 0, sell_price: 0, active: true };

export default function Products() {
  return (
    <FeatureGate feature="inventory" moduleName="Produkter & Lager">
      <ProductsContent />
    </FeatureGate>
  );
}

function ProductsContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);\n  const [stockOpen, setStockOpen] = useState(false);\n  const [stockProduct, setStockProduct] = useState(null);\n  const [stockType, setStockType] = useState("purchase");\n  const [stockQty, setStockQty] = useState(1);\n  const [stockNote, setStockNote] = useState("");\n  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.Product.filter({}, { sort: "name", limit: 200 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...empty, ...p }); setOpen(true); };
  const set = (f) => (e) => setForm((s) => ({ ...s, [f]: ["stock_quantity", "min_stock", "cost_price", "sell_price"].includes(f) ? Number(e.target.value) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const clinic_id = await getClinicId();
      const data = { ...form, clinic_id };
      if (editing) await base44.entities.Product.update(editing.id, data);
      else await base44.entities.Product.create(data);
      setOpen(false); setEditing(null); await load();
    } finally { setSaving(false); }
  };

  const remove = async (p) => { if (confirm(`Ta bort "${p.name}"?`)) { await base44.entities.Product.delete(p.id); await load(); } };

  const lowStock = items.filter((p) => p.min_stock > 0 && p.stock_quantity <= p.min_stock);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">Produkter & Lager</h1>
          <p className="text-sm text-muted-foreground">Hantera produkter, lagersaldo och lagervarningar.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Ny produkt</Button>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><AlertTriangle className="w-4 h-4" />{lowStock.length} produkt(er) under minsta lager</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lowStock.map((p) => <span key={p.id} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{p.name}: {p.stock_quantity} {unitLabels[p.unit] || "st"}</span>)}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Package className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Inga produkter</p>
          <p className="mt-1 text-sm text-muted-foreground">Skapa din första produkt för att börja spåra lager.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                  {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Lager" onClick={() => openStock(p)}><History className="w-3.5 h-3.5" /></Button>\n                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", p.min_stock > 0 && p.stock_quantity <= p.min_stock && "text-amber-600")}>{p.stock_quantity} {unitLabels[p.unit] || "st"}</p>
                  <p className="text-xs text-muted-foreground">i lager</p>
                </div>
                {p.sell_price > 0 && <p className="text-sm font-medium">{p.sell_price.toLocaleString("sv-SE")} kr</p>}
              </div>
              {p.supplier && <p className="mt-2 text-xs text-muted-foreground">Leverantör: {p.supplier}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Redigera produkt" : "Ny produkt"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="name">Namn</Label><Input id="name" value={form.name} onChange={set("name")} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">SKU/Artikelnr</Label><Input value={form.sku} onChange={set("sku")} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Kategori</Label><Input value={form.category} onChange={set("category")} placeholder="t.ex. Toxin, Filler" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Enhet</Label><select value={form.unit} onChange={set("unit")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(unitLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1.5"><Label className="text-xs">Lagersaldo</Label><Input type="number" value={form.stock_quantity} onChange={set("stock_quantity")} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Min. lager</Label><Input type="number" value={form.min_stock} onChange={set("min_stock")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Inköpspris (kr)</Label><Input type="number" value={form.cost_price} onChange={set("cost_price")} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Försäljningspris (kr)</Label><Input type="number" value={form.sell_price} onChange={set("sell_price")} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Leverantör</Label><Input value={form.supplier} onChange={set("supplier")} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Beskrivning</Label><Textarea value={form.description} onChange={set("description")} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Avbryt</Button><Button type="submit" disabled={saving || !form.name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Spara" : "Skapa"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Lagerhändelse {stockProduct ? stockProduct.name : ""}</DialogTitle></DialogHeader>
          <form onSubmit={saveStock} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant={stockType === "purchase" ? "default" : "outline"} onClick={() => setStockType("purchase")}><ArrowDownToLine className="w-4 h-4 mr-1" />Inköp</Button>
              <Button type="button" variant={stockType === "consumption" ? "default" : "outline"} onClick={() => setStockType("consumption")}><ArrowUpFromLine className="w-4 h-4 mr-1" />Förbrukning</Button>
              <Button type="button" variant={stockType === "waste" ? "default" : "outline"} onClick={() => setStockType("waste")}><Trash2 className="w-4 h-4 mr-1" />Kassation</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Antal</Label><Input type="number" min="0" step="0.01" value={stockQty} onChange={e => setStockQty(Number(e.target.value))} required /></div>
              <div className="rounded-lg bg-secondary/60 p-3 text-sm"><span className="text-muted-foreground">Nuvarande saldo</span><div className="font-semibold">{stockProduct?.stock_quantity || 0} {unitLabels[stockProduct?.unit] || "st"}</div></div>
            </div>
            <div className="space-y-1.5"><Label>Anteckning</Label><Input value={stockNote} onChange={e => setStockNote(e.target.value)} placeholder="t.ex. leverans, svinn eller behandling" /></div>
            {history.length > 0 && <div><Label className="text-xs">Senaste händelser</Label><div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">{history.map(h => <div key={h.id} className="flex justify-between border-b border-border py-1"><span>{h.type} · {h.note || "—"}</span><span className="font-medium">{h.quantity > 0 ? "+" : ""}{h.quantity}</span></div>)}</div></div>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setStockOpen(false)}>Avbryt</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Registrera</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}