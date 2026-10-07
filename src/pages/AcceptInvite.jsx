import React, { useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";
import { base44 } from "@/api/base44Client";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Lösenordet måste vara minst 8 tecken.");
    if (password !== confirm) return setError("Lösenorden matchar inte.");
    setLoading(true);
    try {
      await base44.auth.acceptStaffInvite(token, password);
      window.location.href = "/app";
    } catch (e) {
      setError(e.message || "Inbjudan kunde inte aktiveras.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={KeyRound} title="Aktivera ditt Lydia-konto" subtitle="Välj ett lösenord för ditt personalkonto">
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="password">Lösenord</Label><Input id="password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="confirm">Bekräfta lösenord</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
        <Button type="submit" className="w-full h-12" disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aktiverar...</> : "Aktivera konto"}</Button>
      </form>
    </AuthLayout>
  );
}
