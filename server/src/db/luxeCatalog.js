const TZ = 'Europe/Stockholm';

export const LUXE_SOURCE_URL = 'https://www.bokadirekt.se/places/luxe-estetisk-klinik-132136';

const rows = [
  ['EMscolpt 2handtag',30,1990,'Emsculpt'],['EMscolpt 4 handtag',30,2990,'Emsculpt'],
  ['Fettfrysning 2 handtag',20,1990,'Fettreducering'],['Fettfrysning 4 handtag',40,3890,'Fettreducering'],['Cavitation',15,1099,'Fettreducering'],['Ta bort fett med Babyface 5ml',20,1490,'Fettreducering'],
  ['Hifu 12d hela ansiktet, hals och dubbelhaka',40,3980,'HIFU & RF'],['Hifu 12d hela ansiktet',30,3480,'HIFU & RF'],['Hifu 12d dubbelhaka',15,1390,'HIFU & RF'],['Hifu 12d hals och dubbelhaka',15,2390,'HIFU & RF'],['Hifu 12d mage,kärlekshandtag',30,3490,'HIFU & RF'],['Hifu 12d runt ögonen',15,1790,'HIFU & RF'],
  ['RF , hals och dubbelhaka',25,990,'HIFU & RF'],['RF, ansiktet, hals , dubbelhaka',35,2590,'HIFU & RF'],['RF, hela ansiktet',35,1690,'HIFU & RF'],['RF, hela ansiktet + hals+dubbelhaka',30,1190,'HIFU & RF'],['RF, hudbristningar',30,990,'HIFU & RF'],
  ['Massage koppning 30min',30,499,'Massage'],['Tens massage',40,1890,'Massage'],['Massage [ansiktet] 30min',30,599,'Massage'],['Massage [axlarna]',25,599,'Massage'],['Massage [höfterna och nedre ryggen]',25,599,'Massage'],['Massage [gravid]',30,799,'Massage'],['Massage [Aromaterapimassage]',35,799,'Massage'],['Massage[Fibromassage]',30,790,'Massage'],['Massage [lymfmassag]',30,790,'Massage'],['Massage [Andningsmassage]',40,890,'Massage'],['Avslappning massage',40,790,'Massage'],['Friskvård',60,1000,'Massage'],['Massage koppning (60min)',60,990,'Massage'],['Hejama',25,599,'Massage'],
  ['Ögonbrynstatuering',90,2490,'Tatuering'],['Eyeliner Tatuering',90,2290,'Tatuering'],['Lip Liner Tatuering',90,2290,'Tatuering'],['Läppfyllning',90,2490,'Tatuering'],['Microblading ( Hashor)',90,2390,'Tatuering'],['Ta bort Tatuering upp till 4×4cm',15,990,'Tatuering'],['Ta bort Tatuering upp till 8×8cm',15,1590,'Tatuering'],['Ta bort Tatuering upp till 15×15cm',20,1890,'Tatuering'],['Ta bort Tatuering upp till 20×20cm',30,2390,'Tatuering'],
  ['Tandblekning',60,2990,'Tandblekning'],
  ['Hela ben',20,1790,'Hårborttagning'],['Under ben',15,990,'Hårborttagning'],['Över ben',15,990,'Hårborttagning'],['Intim, bikinilinjen',20,1290,'Hårborttagning'],['Intim,bikinilinjen,rumpa',20,1790,'Hårborttagning'],['Hela armar',15,1099,'Hårborttagning'],['Bröst,mag ( dam)',20,1049,'Hårborttagning'],['Rygg(dam)',15,990,'Hårborttagning'],['Armhålorna',20,1190,'Hårborttagning'],['Hela Ansikte',15,999,'Hårborttagning'],['Hela ansiktet och hals',18,1490,'Hårborttagning'],['Hela kroppen',90,3990,'Hårborttagning'],['Rygg (herr)',20,1190,'Hårborttagning'],['Bröst & mage,( herr)',20,1290,'Hårborttagning'],
  ['Kemisk peeling & PRX hela ansiktet',45,1990,'Ansiktsbehandling'],['Hydrafacial',40,1890,'Ansiktsbehandling'],['Nicole behanlare',15,999,'Ansiktsbehandling'],['Ta bort pigmentation med q.switchad laser',15,1290,'Ansiktsbehandling'],['Chemical Peeling Jalupro',45,1890,'Ansiktsbehandling'],['brow lift',45,990,'Ansiktsbehandling'],['RRS 75 Pro microneedling',45,1890,'Ansiktsbehandling'],['Cellucare C Line [ Microneedling ]',46,1890,'Ansiktsbehandling'],['CYTOCARE 715 C Line',45,1890,'Ansiktsbehandling'],['Microneedling',45,1690,'Ansiktsbehandling'],['Vitalinjektor 2 ( Vitaminterapi)',60,3990,'Ansiktsbehandling'],['Hydrofacial med kollagen mask och vitamin mask',50,2290,'Ansiktsbehandling'],['Special Hydrofcial',60,2590,'Ansiktsbehandling'],['Vitaminterapi',45,1890,'Ansiktsbehandling'],['Acne behandling',30,990,'Ansiktsbehandling'],['Carbon Laser peeling',40,1990,'Ansiktsbehandling'],['Klassisk ansiktsbehandling',30,1490,'Ansiktsbehandling'],['Kemisk peeling ( BioRePeelCI3)',40,1990,'Ansiktsbehandling'],['Ta bort pigmentfläckar med (meso white)',45,1990,'Ansiktsbehandling'],
  ['Co2 Fraktionerad Laser [ vaginal tightening ]',60,3990,'Intimvård'],['CO₂ Fraktionerad Laser för Vaginal Bleking',60,3490,'Intimvård'],
  ['Överläpp',20,990,'CO₂ fraktionerad laser'],['Runt munnen och haka',20,1190,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad Laser [ Kinder ]',30,1490,'CO₂ fraktionerad laser'],['Co2 fraktionerad laser [Hela ansiktet ]',60,5990,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad laser [Mindre ärr,rynkor,pigmentfläckar 3×3]',20,1490,'CO₂ fraktionerad laser'],['under & över ögonen',40,3990,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad Laserbristningar',25,2490,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad Laser [ hela magen ]',60,5990,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad Laser [dekolletage ]',60,3990,'CO₂ fraktionerad laser'],['Rygg',30,2990,'CO₂ fraktionerad laser'],['Co2 fraktioneral laser [Hals och dubbelhaka]',40,3990,'CO₂ fraktionerad laser'],['CO₂ Fraktionerad Laser [Hals]',30,3490,'CO₂ fraktionerad laser'],
  ['Piercing Öra',15,990,'Piercing'],['Piercing Navel',15,1290,'Piercing'],['Piercing Tunga',15,1290,'Piercing'],['Piercing näsa',15,990,'Piercing'],
  ['Psoriasisbehandlin med laser 308nm',25,990,'Vitiligo/Eksem/Psoriasis'],['Vitiligo behandling med laser 308nm',25,1990,'Vitiligo/Eksem/Psoriasis'],['Eksembehandling med laser 308nm',25,1990,'Vitiligo/Eksem/Psoriasis'],
  ['konsultation',15,0,'Konsultation'],['produkt',15,2000,'Klippning'],
  ['Hårmesoterapi med Meso-Gun',30,1490,'Hårmesoterapi'],['Hair fillers dr.cyj med meso gun',30,2490,'Hårmesoterapi'],['Håranalys',15,699,'Hårmesoterapi']
];

const invasive = /meso|injekt|filler|tatuering|piercing|vaginal|psoriasis|vitiligo|eksem|co2|laser 308/i;
const payment = /injektion|filler|meso|tatuering|piercing|vaginal/i;

function slug(s) {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
}

export const LUXE_CATALOG = rows.map(([name,duration,price,category]) => {
  const isInvasive = invasive.test(name);
  return {
    id: 'luxe-' + slug(name),
    name, duration, price, category,
    treatment_type: isInvasive ? 'injektion' : 'annan',
    description: 'Luxe Estetisk Klinik – ' + name,
    guest_booking_allowed: !isInvasive,
    requires_health_declaration: isInvasive,
    requires_consent: true,
    requires_treatment_info: isInvasive,
    requires_aftercare: isInvasive,
    requires_payment: payment.test(name),
    min_age: isInvasive ? 18 : 0,
    cancellation_hours: 24,
    clinic_id: 'lydia-estetisk',
    source: LUXE_SOURCE_URL,
  };
});

export async function seedLuxeCatalog(db) {
  await db.query("UPDATE e_treatment SET data = data || '{\"active\":false}'::jsonb WHERE clinic_id = 'lydia-estetisk' AND id IN ('demo-consultation','demo-hudvard','demo-injektion')");
  for (const t of LUXE_CATALOG) {
    await db.query(
      "INSERT INTO e_treatment (id, data, clinic_id) VALUES ($1,$2::jsonb,$3) ON CONFLICT (id) DO UPDATE SET data = e_treatment.data || EXCLUDED.data, clinic_id = EXCLUDED.clinic_id, updated_date = NOW()",
      [t.id, JSON.stringify({ ...t, active: true }), 'lydia-estetisk']
    );
  }
  await db.query(
    "UPDATE e_clinic SET data = data || $1::jsonb, updated_date = NOW() WHERE id = 'lydia-estetisk'",
    [JSON.stringify({
      address: 'Södra Allégatan 1, 413 01 Göteborg',
      opening_hours: 'Måndag–fredag 10:30–19:00\\nLördag–söndag 12:00–17:00',
      source_url: LUXE_SOURCE_URL,
      website: 'https://luxeestetiskklinik.se/',
      source_name: 'Bokadirekt',
    })]
  );
  return LUXE_CATALOG.length;
}
