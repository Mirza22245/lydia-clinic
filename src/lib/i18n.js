import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "lydia-language";
export const LANGUAGES = {
  sv: { code: "sv", label: "Svenska", nativeLabel: "Svenska", dir: "ltr" },
  fa: { code: "fa", label: "Persiska", nativeLabel: "فارسی", dir: "rtl" },
};

const fa = {
  "Dashboard":"داشبورد","Bokningar":"رزروها","Kunder":"مشتریان","Behandlingar":"درمان‌ها","Journal":"پرونده پزشکی",
  "Formulär":"فرم‌ها","Hälsodeklarationer":"اظهارنامه‌های سلامت","Kassa":"صندوق","Z-rapport":"گزارش Z","Rapporter":"گزارش‌ها",
  "Personal":"پرسنل","Schema & Resurser":"برنامه و منابع","Ledningssystem":"سیستم مدیریت","Produkter & Lager":"محصولات و انبار",
  "Presentkort":"کارت هدیه","Marknadsföring":"بازاریابی","Recensioner":"نظرات","Meddelanden":"پیام‌ها","Audit-logg":"گزارش حسابرسی",
  "Säkerhet & Compliance":"امنیت و انطباق","Driftregler 1–12":"قوانین عملیاتی ۱–۱۲","Inställningar":"تنظیمات",
  "Logga ut":"خروج","Ny bokning":"رزرو جدید","Ny kund":"مشتری جدید","Översikt över din klinik.":"نمای کلی کلینیک شما.",
  "Klinikdashboard":"داشبورد کلینیک","Administratör":"مدیر","Översikt för":"نمای کلی برای","Dagens bokningar":"رزروهای امروز",
  "Visa alla":"نمایش همه","Inga bokningar idag.":"امروز رزروی وجود ندارد.","Bekräftad":"تأیید شده","Väntar":"در انتظار",
  "bokningar med status väntar":"رزروهای در انتظار اقدام","Hantera bokningar":"مدیریت رزروها","Administration":"مدیریت",
  "Personal & behörigheter":"پرسنل و دسترسی‌ها","Behandling":"درمان","Behandlare":"درمانگر","Tid":"زمان","Uppgifter":"اطلاعات",
  "Bekräftelse":"تأیید","Förmiddag":"صبح","Eftermiddag":"بعدازظهر","Hälsodeklaration":"اظهارنامه سلامت","Samtycke":"رضایت",
  "Behandlingsinformation & risker":"اطلاعات درمان و خطرات","Eftervårdsinformation":"اطلاعات مراقبت پس از درمان",
  "Betalning":"پرداخت","Ålderskontroll":"بررسی سن","Väntetid":"دوره انتظار","Namn":"نام","E-post":"ایمیل","Telefon":"تلفن",
  "Födelsedatum":"تاریخ تولد","Personnummer":"شماره شناسایی سوئدی","Boka ny tid":"رزرو وقت جدید","Patientportal":"پرتال بیمار",
  "Ingen patientprofil hittades":"پروفایل بیمار پیدا نشد","Kontakta kliniken om du tror att detta är fel.":"اگر فکر می‌کنید این مورد اشتباه است با کلینیک تماس بگیرید.",
  "Kommande bokningar":"رزروهای آینده","Journal":"پرونده پزشکی","Formulär":"فرم‌ها","Samtycken":"رضایت‌ها","Arkiv & kvitton":"بایگانی و رسیدها",
  "Behandlingsplan":"برنامه درمان","Dölj detaljer":"پنهان کردن جزئیات","Visa detaljer":"نمایش جزئیات","Anteckningar":"یادداشت‌ها",
  "Observationer":"مشاهدات","Bedömning":"ارزیابی","Utförd behandling":"درمان انجام‌شده","Eftervård":"مراقبت پس از درمان",
  "Rekommendationer":"توصیه‌ها","Signerad":"امضا شده","Utkast":"پیش‌نویس","Något gick fel":"خطایی رخ داد",
  "Kunde inte hämta din data":"دریافت اطلاعات شما ممکن نیست","Kunde inte boka":"رزرو انجام نشد","Kunde inte avboka":"لغو رزرو انجام نشد",
  "Kunde inte signera samtycket":"امضای رضایت‌نامه انجام نشد","Bokning bekräftad!":"رزرو تأیید شد!",
  "Din tid är nu bokad.":"وقت شما اکنون رزرو شده است.","Klar":"تکمیل‌شده","Inställd":"لغوشده","Incheckad":"پذیرش‌شده",
  "Pågår":"در حال انجام","Utebliven":"عدم مراجعه","Utkast":"پیش‌نویس","Genomförda":"انجام‌شده","Intäkt":"درآمد",
  "Kunder":"مشتریان","Bokningar":"رزروها","Visa detaljer":"نمایش جزئیات","Spara":"ذخیره","Avbryt":"لغو","Stäng":"بستن",
  "Bekräfta":"تأیید","Ta bort":"حذف","Redigera":"ویرایش","Lägg till":"افزودن","Sök":"جستجو","Filtrera":"فیلتر",
  "Ladda om":"بارگذاری مجدد","Laddar...":"در حال بارگذاری...","Skicka":"ارسال","Tillbaka":"بازگشت","Nästa":"بعدی",
  "Föregående":"قبلی","Fortsätt":"ادامه","Välj":"انتخاب","Välj behandling":"انتخاب درمان","Välj behandlare":"انتخاب درمانگر",
  "Välj tid":"انتخاب زمان","Bekräfta bokning":"تأیید رزرو","Betala":"پرداخت","Betala nu":"پرداخت اکنون",
  "Pris":"قیمت","Gratis":"رایگان","Ingen":"هیچ","Ja":"بله","Nej":"خیر","Ja, fortsätt":"بله، ادامه دهید",
  "Nej, gå tillbaka":"خیر، بازگردید","Inloggning":"ورود","Logga in":"ورود","Registrera":"ثبت‌نام","Lösenord":"رمز عبور",
  "Glömt lösenord?":"رمز عبور را فراموش کرده‌اید؟","Återställ lösenord":"بازنشانی رمز عبور","E-postadress":"آدرس ایمیل",
  "Skapa konto":"ایجاد حساب","Bekräfta lösenord":"تأیید رمز عبور","Kontakta oss":"تماس با ما","Tryggt":"ایمن","Personligt":"شخصی",
  "Digitalt":"دیجیتال","Naturliga resultat. Trygg behandling.":"نتایج طبیعی. درمان ایمن.",
};

const dictionaries = { sv: {}, fa };
const getInitialLanguage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "fa" || saved === "sv" ? saved : "sv";
  } catch { return "sv"; }
};

const normalize = (value) => value.replace(/\s+/g, " ").trim();
const translateValue = (value, lang) => {
  if (lang === "sv") return value;
  const key = normalize(value);
  if (fa[key]) return value.replace(key, fa[key]);
  return value;
};

function translateDom(lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGUAGES[lang].dir;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT","STYLE","NOSCRIPT"].includes(parent.tagName)) continue;
    const original = node.nodeValue;
    if (!original || !normalize(original)) continue;
    const translated = translateValue(original, lang);
    if (translated !== original) node.nodeValue = translated;
  }
  document.querySelectorAll("input[placeholder], textarea[placeholder], button[aria-label], [title]").forEach((el) => {
    for (const attr of ["placeholder", "aria-label", "title"]) {
      if (el.hasAttribute(attr)) {
        const value = el.getAttribute(attr);
        const next = translateValue(value, lang);
        if (next !== value) el.setAttribute(attr, next);
      }
    }
  });
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);
  const setLanguage = useCallback((next) => {
    const value = next === "fa" ? "fa" : "sv";
    setLanguageState(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }, []);

  useEffect(() => {
    translateDom(language);
    const observer = new MutationObserver(() => translateDom(language));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    isPersian: language === "fa",
    t: (value) => translateValue(String(value), language),
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
