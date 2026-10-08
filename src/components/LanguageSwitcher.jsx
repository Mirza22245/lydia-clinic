import React from "react";
import { Languages } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function LanguageSwitcher({ compact = false }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1" aria-label="Språk">
      <Languages className="ml-1 h-4 w-4 text-muted-foreground" />
      {["sv", "fa"].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${language === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
          aria-pressed={language === code}
          title={code === "sv" ? "Svenska" : "فارسی"}
        >
          {compact ? code.toUpperCase() : code === "sv" ? "Svenska" : "فارسی"}
        </button>
      ))}
    </div>
  );
}
