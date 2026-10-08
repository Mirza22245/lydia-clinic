import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Shield, MessageSquare, Calendar, CreditCard, Mail, Plug, CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const statusLabel = (s) => ({ disabled: "Avstängd", test: "Testläge", enabled: "Aktiv" }[s] || "Avstängd");
const statusColor = (s) => ({ disabled: "bg-muted text-muted-foreground", test: "bg-amber-100 text-amber-700", enabled: "bg-emerald-100 text-emerald-700" }[s] || "bg-muted text-muted-foreground");

const integrations = [
  { key:"bankid", icon:Shield, label:"BankID", desc:"Identitetsverifiering för patienter och personal", steps:["Välj test eller produktion och skaffa BankID-avtal/uppgifter.","Lägg BANKID_MODE, BANKID_API_URL och BANKID_CLIENT_SECRET i Secrets.","Kör ett testflöde innan produktion.","Aktivera BankID först när testet är godkänt."] },
  { key:"sms", icon:MessageSquare, label:"SMS", desc:"Bekräftelser, påminnelser och avbokningar via SMS", steps:["Välj Twilio eller 46elks.","Lägg SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET och SMS_SENDER i Secrets.","Skicka ett testsms och kontrollera avsändare.","Aktivera SMS först när testet fungerar."] },
  { key:"google_calendar", icon:Calendar, label:"Google Calendar", desc:"Synka bokningar till personalens Google-kalendrar", steps:["Anslut Google Calendar via Integrations → Connectors.","Godkänn kalenderbehörigheten för rätt klinikkonto.","Skapa en testbokning och kontrollera kalendern.","Aktivera först efter lyckat test."] },
  { key:"woopayments", icon:CreditCard, label:"WooPayments", desc:"Kortbetalning, Klarna, deposition och refunds", steps:["Slutför WooPayments-onboarding och företagsverifiering i WordPress/WooPayments.","Aktivera kort och Klarna i WooPayments.","Koppla betalningsbekräftelsen till Lydia innan onlinebokningen öppnas.","Gör en testbetalning och kontrollera Lydia Payment-status.","Aktivera WooPayments i Lydia först när hela testflödet är godkänt."], link:"https://woocommerce.com/document/woopayments/" },
  { key:"email", icon:Mail, label:"E-post", desc:"Bekräftelser, kvitton, påminnelser och uppföljning", steps:["E-post är aktiv som standard.","Kontrollera SMTP-inställningar om egen SMTP används.","Skicka ett testmeddelande och kontrollera leveransen."] }
];

export default function IntegrationsPanel() {
  const [flags,setFlags]=useState([]); const [loading,setLoading]=useState(true); const [openKey,setOpenKey]=useState(null);
  const load=async()=>{try{const page=await base44.entities.FeatureFlag.filter({}, {limit:100});setFlags(page.items||[]);}catch{setFlags([]);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const getFlag=(key)=>flags.find(f=>f.key===key);
  const advance=async(flag)=>{const order=["disabled","test","enabled"];const next=order[(order.indexOf(flag.status)+1)%order.length];await base44.functions.invoke("updateFeatureFlag",{flag_id:flag.id,status:next,config:flag.config||"{}"});await load();};
  if(loading)return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>;
  return <div className="rounded-xl border border-border bg-card p-6">
    <div className="flex items-center gap-2 border-b border-border pb-3 mb-4"><Plug className="w-4 h-4 text-muted-foreground"/><div><h2 className="font-medium">Integrationer</h2><p className="text-xs text-muted-foreground">Öppna en integration för att följa aktiveringsstegen.</p></div></div>
    <div className="space-y-3">{integrations.map(int=>{const flag=getFlag(int.key);const status=flag?.status||"disabled";const Icon=int.icon;const open=openKey===int.key;return <div key={int.key} className="rounded-lg border border-border p-3">
      <button type="button" className="w-full text-left" onClick={()=>setOpenKey(open?null:int.key)}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="w-4 h-4 text-muted-foreground"/></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="font-medium">{int.label}</p><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",statusColor(status))}>{statusLabel(status)}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{int.desc}</p></div></div></button>
      {open&&<div className="mt-3 border-t border-border pt-3"><ol className="space-y-2 text-sm">{int.steps.map((step,i)=><li key={step} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]">{i+1}</span><span>{step}</span></li>)}</ol>{int.link&&<a href={int.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs underline">Öppna dokumentation <ExternalLink className="h-3 w-3"/></a>}{flag&&<button type="button" onClick={()=>advance(flag)} disabled={status==="enabled"} className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">{status==="disabled"?"Starta testläge":status==="test"?"Aktivera":"Aktiv"}<CheckCircle2 className="h-3.5 w-3.5"/></button>}</div>}
    </div>})}</div>
  </div>;
}