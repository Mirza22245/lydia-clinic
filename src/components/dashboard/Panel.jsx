import React from "react";
import { cn } from "@/lib/utils";

export default function Panel({ title, icon: Icon, action, children, className }) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <h2 className="font-medium">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}