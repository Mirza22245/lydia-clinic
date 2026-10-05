import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { FileText } from "lucide-react";
import Panel from "./Panel";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default function UnsignedJournals() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [page, total] = await Promise.all([
          base44.entities.JournalEntry.filter(
            { is_signed: { $ne: true } },
            { sort: "-entry_date", limit: 6 }
          ),
          base44.entities.JournalEntry.count({ is_signed: { $ne: true } }),
        ]);
        setItems(page.items || []);
        setCount(total);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Panel
      title="Obearbetade journalanteckningar"
      icon={FileText}
      action={<Link to="/app/journal" className="text-sm text-muted-foreground hover:text-foreground">Alla</Link>}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inga osignerade journaler. 🎉</div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {items.map((j) => (
              <Link key={j.id} to="/app/journal" className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{j.customer_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {j.treatment_name || "Öppen anteckning"}{j.provider ? ` · ${j.provider}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{fmtDate(j.entry_date)}</span>
              </Link>
            ))}
          </div>
          {count > items.length && (
            <div className="border-t border-border px-5 py-2 text-center text-xs text-muted-foreground">
              + {count - items.length} fler osignerade
            </div>
          )}
        </>
      )}
    </Panel>
  );
}