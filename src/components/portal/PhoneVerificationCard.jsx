import React, { useState } from "react";
import { verifyPhone } from "@/functions/verifyPhone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";

// Telefonverifiering med SMS-kod. Visas bara när SMS-modulen är aktiverad.
export default function PhoneVerificationCard({ customer, onVerified }) {
  const [phone, setPhone] = useState(customer.phone || "");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (customer.phone_verified) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700">
        <ShieldCheck className="h-4 w-4" />Telefonnumret är verifierat
      </p>
    );
  }

  const run = async (payload, onOk) => {
    setBusy(true);
    setError(null);
    try {
      await verifyPhone(payload);
      onOk();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Något gick fel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" />Verifiera ditt telefonnummer</p>
      {!codeSent ? (
        <div className="flex gap-2">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="070-123 45 67" />
          <Button disabled={busy || !phone.trim()} onClick={() => run({ action: "send", phone }, () => setCodeSent(true))}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Skicka kod
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-siffrig kod" inputMode="numeric" maxLength={6} />
          <Button disabled={busy || code.length !== 6} onClick={() => run({ action: "confirm", code }, onVerified)}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Verifiera
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}