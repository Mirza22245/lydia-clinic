import React, { useState } from "react";
import { sendPortalMessage } from "@/functions/sendPortalMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (d) => (d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "");

export default function PortalMessages({ messages, onSent }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await sendPortalMessage({ body: text });
      setText("");
      await onSent();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Kunde inte skicka meddelandet");
    } finally {
      setSending(false);
    }
  };

  const ordered = [...messages].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
  return (
    <div className="space-y-3">
      {ordered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-50" />Inga meddelanden än.
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] rounded-xl border border-border p-3 text-sm", m.direction === "inbound" ? "ml-auto bg-secondary" : "bg-card")}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.direction === "inbound" ? "Du" : m.staff_name || "Kliniken"} · {fmt(m.sent_at)}</p>
            </div>
          ))}
        </div>
      )}
      <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv ett meddelande till kliniken…" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end">
        <Button disabled={sending || !text.trim()} onClick={send}>
          {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Skicka
        </Button>
      </div>
    </div>
  );
}