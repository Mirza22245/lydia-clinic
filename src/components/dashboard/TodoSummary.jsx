import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { ListTodo, Check } from "lucide-react";
import Panel from "./Panel";

const priorityDot = { high: "bg-rose-500", medium: "bg-amber-500", low: "bg-slate-300" };
const priorityLabel = { high: "Hög", medium: "Medel", low: "Låg" };
const fmtDue = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : "");

export default function TodoSummary() {
  const [items, setItems] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [page, count] = await Promise.all([
        base44.entities.Task.filter({ status: { $ne: "done" } }, { sort: "due_date", limit: 6 }),
        base44.entities.Task.count({ status: { $ne: "done" } }),
      ]);
      setItems(page.items || []);
      setOpenCount(count);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (t) => {
    try {
      await base44.entities.Task.update(t.id, { status: "done" });
      load();
    } catch {
      // ignore
    }
  };

  return (
    <Panel
      title="Att-göra-lista"
      icon={ListTodo}
      action={<span className="text-sm text-muted-foreground">{loading ? "–" : `${openCount} öppna`}</span>}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Inget att göra just nu. 🎉</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3">
              <button
                onClick={() => complete(t)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-transparent hover:border-primary hover:text-primary"
                aria-label="Markera klar"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.due_date ? `Förfaller ${fmtDue(t.due_date)}` : "Inget datum"}
                  {t.priority ? ` · ${priorityLabel[t.priority] || t.priority}` : ""}
                </p>
              </div>
              {t.priority && <span className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot[t.priority] || "bg-slate-300")} />}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}