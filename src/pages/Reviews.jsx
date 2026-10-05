import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, Check, Eye, EyeOff, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import FeatureGate from "@/components/FeatureGate";

function Stars({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("w-3.5 h-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

export default function Reviews() {
  return (
    <FeatureGate feature="reviews" moduleName="Recensioner">
      <ReviewsContent />
    </FeatureGate>
  );
}

function ReviewsContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState(null);
  const [response, setResponse] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.entities.Review.filter({}, { sort: "-created_date", limit: 200 });
      setItems(r.items || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (r) => {
    await base44.entities.Review.update(r.id, { published: !r.published });
    await load();
  };

  const startRespond = (r) => { setRespondingId(r.id); setResponse(r.staff_response || ""); };
  const saveResponse = async (r) => {
    await base44.entities.Review.update(r.id, { staff_response: response });
    setRespondingId(null); setResponse(""); await load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const avgRating = items.length > 0 ? (items.reduce((s, r) => s + (r.rating || 0), 0) / items.length).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Recensioner</h1>
        <p className="text-sm text-muted-foreground">Kundrecensioner och betyg. Publicera för att visa på bokningssidan.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold font-heading">{avgRating}</p>
          <p className="text-xs text-muted-foreground">Snittbetyg</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold font-heading">{items.length}</p>
          <p className="text-xs text-muted-foreground">Totalt</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold font-heading">{items.filter((r) => r.published).length}</p>
          <p className="text-xs text-muted-foreground">Publicerade</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Star className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Inga recensioner</p>
          <p className="mt-1 text-sm text-muted-foreground">Kunder kan lämna recensioner efter genomförda behandlingar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    {r.published ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><Eye className="w-3 h-3" />Publicerad</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><EyeOff className="w-3 h-3" />Dold</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{r.customer_name || "Anonym"}{r.treatment_name ? ` — ${r.treatment_name}` : ""}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => togglePublish(r)}>{r.published ? "Dölj" : "Publicera"}</Button>
              </div>
              {r.text && <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>}
              {r.would_recommend != null && (
                <p className="mt-1 text-xs text-muted-foreground">{r.would_recommend ? "Skulle rekommendera" : "Skulle inte rekommendera"}</p>
              )}
              {r.staff_response && respondingId !== r.id && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Svar från kliniken:</p>
                  <p className="mt-1 text-sm">{r.staff_response}</p>
                </div>
              )}
              {respondingId === r.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} placeholder="Skriv svar..." />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveResponse(r)}><Check className="w-3.5 h-3.5 mr-1" />Spara svar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRespondingId(null)}>Avbryt</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => startRespond(r)}><MessageSquare className="w-3 h-3 mr-1" />{r.staff_response ? "Ändra svar" : "Svara"}</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}