import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const priorityStyles = {
  high: "bg-rose-50 text-rose-700 ring-rose-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-sky-50 text-sky-700 ring-sky-200",
};

const priorityLabel = { high: "Hög", medium: "Medel", low: "Låg" };

function formatDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
}

export default function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40",
        done && "opacity-60"
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(task)}
        className="mt-1"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("font-medium text-sm", done && "line-through")}>{task.title}</p>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              priorityStyles[task.priority] || priorityStyles.medium
            )}
          >
            {priorityLabel[task.priority] || task.priority}
          </span>
          {task.due_date && (
            <span className="text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
          )}
        </div>
        {task.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(task)}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(task)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}