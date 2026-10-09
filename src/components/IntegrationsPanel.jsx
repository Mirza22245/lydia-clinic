import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Shield, MessageSquare, Calendar, CreditCard, Mail, Plug, CheckCircle2, ExternalLink, Link2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const statusLabel = (s) => ({ disabled: "Avstängd", test: "Testläge", enabled: "Aktiv" }[s] || "Avstängd");
const statusColor = (s) => ({ disabled: "bg-muted text-muted-foreground", test: "bg-amber-100 text-amber-700", enabled: "bg-emerald-100 text-emerald-700" }[s] || "bg-muted text-muted-foreground");

const integrations = [
  { key:"bankid", icon:Shield, label:"BankID", desc:"Identitetsverifiering för patienter och personal", steps:["Välj test eller produktion och skaffa BankID-avtal/uppgifter.","Lägg BANKID_MODE, BANKID_API_URL och BANKID_CLIENT_SECRET i Secrets.","Kör ett testflöde innan produktion.","Aktivera BankID först när testet är godkänt."] },
  { key:"sms", icon:MessageSquare, label:"SMS", desc:"Bekräftelser, påminnelser och avbokningar via SMS", steps:["Välj Twilio eller 46elks.","Lägg SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET och SMS_SENDER i Secrets.","Skicka ett testsms och kontrollera avsändare.","Aktivera SMS först när testet fungerar."] },
  { key:"google_calendar", icon:Calendar, label:"Google + Gmail", desc:"Anslut eget konto för kalender, inkommande e-post och utskick", steps:["Klicka Anslut Google och logga in med klinikens Google-konto.","Godkänn Gmail- och kalenderbehörigheterna.","Testa inkorgen och skicka ett testmejl.","Google-kontot kopplas bara till det inloggade personalkontot." ] },
  { key:"woopayments", icon:CreditCard, label:"WooPayments", desc:"Kortbetalning, Klarna, deposition och refunds", steps:["Slutför WooPayments-onboarding och företagsverifiering i WordPress/WooPayments.","Aktivera kort och Klarna i WooPayments.","Koppla betalningsbekräftelsen till Lydia innan onlinebokningen öppnas.","Gör en testbetalning och kontrollera Lydia Payment-status.","Aktivera WooPayments i Lydia först när hela testflödet är godkänt."], link:"https://woocommerce.com/document/woopayments/" },
  { key:"email", icon:Mail, label:"E-post", desc:"Bekräftelser, kvitton, påminnelser och uppföljning", steps:["Använd klinikens Gmail: lydiaestetisk@gmail.com.","Skapa ett Google App-lösenord för SMTP (dela aldrig lösenordet i chatten).","Lägg SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS och SMTP_FROM_EMAIL i serverns Secrets/Environment.","Kör Testa e-post och kontrollera inkorgen.","Aktivera e-postflöden först när testmeddelandet kommer fram."] }
];

export default function IntegrationsPanel() {
  const [flags,setFlags]=useState([]);
  const [loading,setLoading]=useState(true);
  const [openKey,setOpenKey]=useState(null);
  const [google,setGoogle]=useState({loading:true,connected:false,email:null});
  const [gmailMessages,setGmailMessages]=useState([]);
  const [gmailLoading,setGmailLoading]=useState(false);
  const [gmailError,setGmailError]=useState("");
  const [gmailTo,setGmailTo]=useState("");
  const [gmailSubject,setGmailSubject]=useState("");
  const [gmailText,setGmailText]=useState("");
  const [gmailBusy,setGmailBusy]=useState(false);
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
      setGoogle({loading:false,connected:!!g.connected,email:g.email||null});
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

  const loadGmail=async()=>{
    setGmailLoading(true);setGmailError("");
    try{const r=await fetch("/api/google/gmail/messages?maxResults=15",{credentials:"include"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte läsa Gmail.");setGmailMessages(d.messages||[]);}
    catch(e){setGmailError(e.message||"Kunde inte läsa Gmail.");}
    finally{setGmailLoading(false);}
  };

  const sendGmail=async(e)=>{
    e.preventDefault();setGmailBusy(true);setGmailError("");
    try{const r=await fetch("/api/google/gmail/send",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:gmailTo,subject:gmailSubject,text:gmailText})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte skicka e-post.");setMessage({type:"success",text:"E-post skickad från "+(google.email||"anslutet Gmail-konto")+"."});setGmailTo("");setGmailSubject("");setGmailText("");}
    catch(err){setGmailError(err.message||"Kunde inte skicka e-post.");}
    finally{setGmailBusy(false);}
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
            {google.connected&&<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Ansluten: {google.email||"Google-konto"}</span>}
          </div>
          {google.connected&&<div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Gmail-inkorg</p><button type="button" onClick={loadGmail} disabled={gmailLoading} className="rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50">{gmailLoading?"Hämtar…":"Hämta senaste mejl"}</button></div>
            {gmailError&&<p role="alert" className="text-xs text-destructive">{gmailError}</p>}
            {gmailMessages.map((m)=><div key={m.id} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{m.from} · {m.date}</p><p className="mt-1 text-sm font-medium">{m.subject}</p><p className="mt-1 text-xs text-muted-foreground">{m.snippet}</p><button type="button" onClick={async()=>{try{const r=await fetch("/api/google/gmail/messages/"+encodeURIComponent(m.id),{credentials:"include"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte öppna mejlet.");setMessage({type:"success",text:"Mejl från "+d.from+" — "+d.subject+": "+(d.body||d.snippet).slice(0,1200)});}catch(err){setGmailError(err.message||"Kunde inte öppna mejlet.");}}} className="mt-2 text-xs underline">Visa meddelande</button></div>)}
            <form onSubmit={sendGmail} className="space-y-2 rounded-lg border p-3"><p className="text-sm font-medium">Skicka e-post från {google.email||"Gmail"}</p><input type="email" required maxLength={320} value={gmailTo} onChange={e=>setGmailTo(e.target.value)} placeholder="Mottagarens e-post" className="w-full rounded-md border bg-background px-3 py-2 text-sm"/><input required maxLength={200} value={gmailSubject} onChange={e=>setGmailSubject(e.target.value)} placeholder="Ämne" className="w-full rounded-md border bg-background px-3 py-2 text-sm"/><textarea required maxLength={20000} rows={3} value={gmailText} onChange={e=>setGmailText(e.target.value)} placeholder="Meddelande" className="w-full rounded-md border bg-background px-3 py-2 text-sm"/><button type="submit" disabled={gmailBusy} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{gmailBusy?"Skickar…":"Skicka e-post"}</button></form>
            <button type="button" onClick={async()=>{try{const r=await fetch("/api/google/disconnect",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"});if(!r.ok)throw new Error("Kunde inte koppla från Google.");setGoogle({loading:false,connected:false,email:null});setGmailMessages([]);setMessage({type:"success",text:"Google-kontot har kopplats från."});}catch(err){setGmailError(err.message);}}} className="text-xs text-destructive underline">Koppla från Google-kontot</button>
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
