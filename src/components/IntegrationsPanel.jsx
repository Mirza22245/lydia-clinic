import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Shield, MessageSquare, Calendar, CreditCard, Mail, Plug, CheckCircle2, ExternalLink, Link2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const statusLabel = (s) => ({ disabled: "Avstängd", test: "Testläge", enabled: "Aktiv" }[s] || "Avstängd");
const statusColor = (s) => ({ disabled: "bg-muted text-muted-foreground", test: "bg-amber-100 text-amber-700", enabled: "bg-emerald-100 text-emerald-700" }[s] || "bg-muted text-muted-foreground");

const integrations = [
  { key:"bankid", icon:Shield, label:"BankID", desc:"Identitetsverifiering för patienter och personal", steps:["Välj test eller produktion och skaffa BankID-avtal/uppgifter.","Lägg BANKID_MODE, BANKID_API_URL och BANKID_CLIENT_SECRET i Secrets.","Kör ett testflöde innan produktion.","Aktivera BankID först när testet är godkänt."] },
  { key:"sms", icon:MessageSquare, label:"SMS", desc:"Bekräftelser, påminnelser och avbokningar via SMS", steps:["Välj Twilio eller 46elks.","Lägg SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET och SMS_SENDER i Secrets.","Skicka ett testsms och kontrollera avsändare.","Aktivera SMS först när testet fungerar."] },
  { key:"google_calendar", icon:Calendar, label:"Google Calendar", desc:"Synka bokningar till personalens Google-kalendrar", steps:["Klicka Anslut Google och logga in med klinikens Google-konto.","Godkänn kalenderbehörigheten för kontot.","Skapa en testbokning och kontrollera kalendern.","Aktivera Google Calendar i Lydia först efter lyckat test." ] },
  { key:"woopayments", icon:CreditCard, label:"WooPayments", desc:"Kortbetalning, Klarna, deposition och refunds", steps:["Slutför WooPayments-onboarding och företagsverifiering i WordPress/WooPayments.","Aktivera kort och Klarna i WooPayments.","Koppla betalningsbekräftelsen till Lydia innan onlinebokningen öppnas.","Gör en testbetalning och kontrollera Lydia Payment-status.","Aktivera WooPayments i Lydia först när hela testflödet är godkänt."], link:"https://woocommerce.com/document/woopayments/" },
  { key:"email", icon:Mail, label:"E-post", desc:"Bekräftelser, kvitton, påminnelser och uppföljning", steps:["Använd klinikens Gmail: lydiaestetisk@gmail.com.","Skapa ett Google App-lösenord för SMTP (dela aldrig lösenordet i chatten).","Lägg SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS och SMTP_FROM_EMAIL i serverns Secrets/Environment.","Kör Testa e-post och kontrollera inkorgen.","Aktivera e-postflöden först när testmeddelandet kommer fram."] }
];

export default function IntegrationsPanel() {
  const [flags,setFlags]=useState([]);
  const [loading,setLoading]=useState(true);
  const [openKey,setOpenKey]=useState(null);
  const [google,setGoogle]=useState({loading:true,connected:false});
  const [email,setEmail]=useState({loading:true,configured:false,user:null});
  const [emailTesting,setEmailTesting]=useState(false);
  const [message,setMessage]=useState(null);

  const load=async()=>{
    try{const page=await base44.entities.FeatureFlag.filter({}, {limit:100});setFlags(page.items||[]);}
    catch{setFlags([]);}
    finally{setLoading(false);}
  };

  const loadIntegrationStatus=async()=>{
    try{
      const [g,e]=await Promise.all([
        fetch("/api/google/status",{credentials:"include"}).then(r=>r.ok?r.json():Promise.reject()),
        fetch("/api/integrations/email/status",{credentials:"include"}).then(r=>r.ok?r.json():Promise.reject())
      ]);
      setGoogle({loading:false,connected:!!g.connected});
      setEmail({loading:false,configured:!!e.configured,user:e.user||null});
    }catch{
      setGoogle(v=>({...v,loading:false}));
      setEmail(v=>({...v,loading:false}));
    }
  };

  useEffect(()=>{load();loadIntegrationStatus();},[]);

  const getFlag=(key)=>flags.find(f=>f.key===key);

  const setFlagStatus=async(flag,next)=>{
    await base44.functions.invoke("updateFeatureFlag",{flag_id:flag.id,status:next,config:flag.config||"{}"});
    await load();
  };

  const advance=async(flag)=>{
    const order=["disabled","test","enabled"];
    const next=order[(order.indexOf(flag.status)+1)%order.length];
    await setFlagStatus(flag,next);
  };

  const connectGoogle=()=>{
    window.location.href="/api/google/connect?return=/app/settings";
  };

  const activateGoogle=async(flag)=>{
    setMessage(null);
    if(!google.connected){setMessage({type:"error",text:"Anslut Google Calendar först."});return;}
    try{
      await setFlagStatus(flag,"enabled");
      setMessage({type:"success",text:"Google Calendar är aktiverat."});
    }catch(e){
      setMessage({type:"error",text:e?.response?.data?.error||e.message||"Kunde inte aktivera Google Calendar."});
    }
  };

  const testEmail=async()=>{
    setEmailTesting(true);setMessage(null);
    try{
      const r=await fetch("/api/integrations/email/test",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"}});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||"Kunde inte skicka testmeddelandet.");
      setMessage({type:"success",text:"Testmejl skickat till "+data.sent_to+"."});
      setEmail(v=>({...v,configured:true}));
    }catch(e){setMessage({type:"error",text:e.message||"E-posttest misslyckades."});}
    finally{setEmailTesting(false);}
  };

  if(loading)return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>;

  return <div className="rounded-xl border border-border bg-card p-6">
    <div className="flex items-center gap-2 border-b border-border pb-3 mb-4"><Plug className="w-4 h-4 text-muted-foreground"/><div><h2 className="font-medium">Integrationer</h2><p className="text-xs text-muted-foreground">Anslut konto, testa och aktivera först när allt fungerar.</p></div></div>
    {message&&<div className={cn("mb-3 rounded-lg border p-3 text-sm",message.type==="error"?"border-destructive/30 bg-destructive/5 text-destructive":"border-emerald-200 bg-emerald-50 text-emerald-700")}>{message.text}</div>}
    <div className="space-y-3">{integrations.map(int=>{
      const flag=getFlag(int.key);
      const status=flag?.status||"disabled";
      const Icon=int.icon;
      const open=openKey===int.key;
      const isGoogle=int.key==="google_calendar";
      const isEmail=int.key==="email";
      const shownStatus=isGoogle&&google.connected?"enabled":isEmail&&email.configured?"enabled":status;
      return <div key={int.key} className="rounded-lg border border-border p-3">
        <button type="button" className="w-full text-left" onClick={()=>setOpenKey(open?null:int.key)}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="w-4 h-4 text-muted-foreground"/></div>
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="font-medium">{int.label}</p><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",statusColor(shownStatus))}>{isGoogle&&google.connected?"Ansluten":isEmail&&email.configured?"Konfigurerad":statusLabel(status)}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{int.desc}</p></div>
          </div>
        </button>
        {open&&<div className="mt-3 border-t border-border pt-3">
          <ol className="space-y-2 text-sm">{int.steps.map((step,i)=><li key={step} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]">{i+1}</span><span>{step}</span></li>)}</ol>
          {int.link&&<a href={int.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs underline">Öppna dokumentation <ExternalLink className="h-3 w-3"/></a>}
          {isGoogle&&<div className="mt-3 flex flex-wrap gap-2">
            {!google.connected&&<button type="button" onClick={connectGoogle} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"><Link2 className="h-3.5 w-3.5"/>Anslut Google Calendar</button>}
            {google.connected&&flag?.status!=="enabled"&&<button type="button" onClick={()=>activateGoogle(flag)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent"><CheckCircle2 className="h-3.5 w-3.5"/>Aktivera Google Calendar</button>}
            {google.connected&&<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Google-konto anslutet</span>}
          </div>}
          {isEmail&&<div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={testEmail} disabled={emailTesting||!email.configured} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">{emailTesting?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5"/>}Testa e-post</button>
            {email.user&&<span className="text-xs text-muted-foreground">SMTP-konto: {email.user}</span>}
            {!email.configured&&<span className="text-xs text-amber-600">SMTP är inte komplett konfigurerad.</span>}
          </div>}
          {!isGoogle&&!isEmail&&flag&&<button type="button" onClick={()=>advance(flag)} disabled={status==="enabled"} className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">{status==="disabled"?"Starta testläge":status==="test"?"Aktivera":"Aktiv"}<CheckCircle2 className="h-3.5 w-3.5"/></button>}
        </div>}
      </div>
    })}</div>
  </div>;
}
