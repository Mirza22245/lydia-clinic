#!/usr/bin/env node
// Säkerhetstest: klinikisolering (RLS), personalbehörighet och de känsliga funktionerna.
// Körs mot den RIKTIGA databasen som appens roll (lydia_app) — samma väg som produktion:
//   docker compose --profile tools run --rm security-test
// Skapar två tillfälliga kliniker (zzt-a-*, zzt-b-*) med testdata och raderar ALLT efteråt.
// Anropar aldrig Stripe på riktigt (fetch mot api.stripe.com ersätts) och skickar ingen e-post
// som når kunder (testadresser på example.test). Avslutar med kod 1 om något test fallerar.
import { randomUUID, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withTx, pool } from '../src/db/pool.js';
import { entities } from '../src/entities/registry.js';
import { makeStore } from '../src/entities/store.js';
import { bindContext } from '../src/runtime/sdk-shim.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FN_DIR = process.env.COMPILED_FUNCTIONS_DIR || join(__dirname, '../.compiled-functions');
const RUN = randomUUID().slice(0, 8);
const A = `zzt-a-${RUN}`;
const B = `zzt-b-${RUN}`;
const DAY = 86400000;

let pass = 0;
const fails = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  fails.push(name);
  console.log(`  FEL  ${name} ${detail}`);
}
async function thrown(p) { try { await p; return null; } catch (e) { return e; } }
const denied = (e) => !!e && [401, 403, 404].includes(e.status);

// --- Stripe får aldrig anropas på riktigt i testet ---
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_test_dummy';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.stripe.com/')) {
    return new Response(JSON.stringify({ id: 'pi_test', client_secret: 'pi_test_secret' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};

const mkUser = ({ key, clinic = '', staff = '', role = 'user' }) => ({
  id: randomUUID(), role, email: `${key}-${RUN}@example.test`, full_name: key,
  clinic_id: clinic, staff_role: staff, email_verified: true, data: { clinic_id: clinic, staff_role: staff },
});
const as = (user, name) => makeStore(name, { user, bypass: false });
const svc = (name) => makeStore(name, { bypass: true });

async function call(name, user, body = {}, { headers = {}, raw } = {}) {
  const mod = await import(pathToFileURL(join(FN_DIR, `${name}.mjs`)).href);
  const req = new Request(`http://localhost/api/functions/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body),
  });
  bindContext(req, user, '127.0.0.1');
  const res = await mod.default(req);
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* ej JSON */ }
  return { status: res.status, data };
}

async function cleanup() {
  await withTx(async (c) => {
    for (const e of entities.values()) await c.query(`DELETE FROM ${e.table} WHERE clinic_id = ANY($1)`, [[A, B]]);
  }, { bypassRls: true });
}

async function main() {
  // ---------- Testdata ----------
  for (const [id, name] of [[A, 'Testklinik A'], [B, 'Testklinik B']]) {
    await withTx((c) => c.query('INSERT INTO e_clinic (id, data, clinic_id) VALUES ($1, $2::jsonb, $1)', [id, JSON.stringify({ name })]), { bypassRls: true });
  }
  const seed = {};
  for (const [k, cid] of [['a', A], ['b', B]]) {
    const base = { clinic_id: cid };
    const cust = await svc('Customer').create({ ...base, name: `ZZ Kund ${k}`, email: `kund-${k}-${RUN}@example.test`, birth_date: '1985-05-05', status: 'active' });
    const link = { ...base, customer_id: cust.id, customer_name: cust.name };
    seed[k] = {
      cust,
      jr: await svc('JournalEntry').create({ ...link, entry_date: new Date().toISOString(), notes: `hemlig-${k}`, is_signed: false }),
      signed: await svc('JournalEntry').create({ ...link, entry_date: new Date().toISOString(), notes: `last-${k}`, is_signed: true }),
      hd: await svc('HealthDeclaration').create({ ...link }),
      co: await svc('Consent').create({ ...link, type: 'treatment' }),
      bk: await svc('Booking').create({ ...link, treatment_name: 'T', start_time: new Date(Date.now() + 3 * DAY).toISOString(), status: 'pending', price: 100 }),
      aud: await svc('AuditLog').create({ ...base, event_type: 'x', entity_type: 'y', description: `audit-${k}` }),
    };
    seed[k].pay = await svc('Payment').create({ ...link, booking_id: seed[k].bk.id, amount: k === 'a' ? 100 : 900, status: 'paid', method: 'cash' });
  }
  await svc('Customer').create({ clinic_id: A, name: 'ZZ Extra 1' });
  await svc('Customer').create({ clinic_id: A, name: 'ZZ Extra 2' });

  const adminA = mkUser({ key: 'adminA', clinic: A, staff: 'administratör', role: 'admin' });
  const adminB = mkUser({ key: 'adminB', clinic: B, staff: 'administratör', role: 'admin' });
  const therapistA = mkUser({ key: 'therapistA', clinic: A, staff: 'behandlare' });
  const receptionA = mkUser({ key: 'receptionA', clinic: A, staff: 'reception' });
  const orphan = mkUser({ key: 'orphan', staff: 'behandlare' }); // personalroll men ingen klinik
  const patientA = { ...mkUser({ key: 'patientA' }), email: seed.a.cust.email };
  const patientB = { ...mkUser({ key: 'patientB' }), email: seed.b.cust.email };

  // ---------- 1. Klinikisolering på entitetsnivå ----------
  console.log('1. Klinikisolering (entiteter)');
  const cA = as(adminA, 'Customer');
  let r = await cA.filter({}, {});
  check('admin A ser bara klinik A:s kunder', r.items.length === 3 && r.items.every((x) => x.clinic_id === A), `fick ${r.items.length}`);
  check('admin A kan inte läsa kund i klinik B (get)', denied(await thrown(cA.get(seed.b.cust.id))));
  check('admin A kan inte ändra kund i klinik B', denied(await thrown(cA.update(seed.b.cust.id, { name: 'HACK' }))));
  check('admin A kan inte radera kund i klinik B', denied(await thrown(cA.delete(seed.b.cust.id))));
  const bAfter = await svc('Customer').get(seed.b.cust.id);
  check('klinik B:s kund är oförändrad och finns kvar', bAfter.name === 'ZZ Kund b');
  const made = await cA.create({ name: 'ZZ Injektion', clinic_id: B });
  check('clinic_id i begäran ignoreras vid skapande (stämplas som A)', made.clinic_id === A);
  const moved = await cA.update(made.id, { clinic_id: B, name: 'ZZ Flytt' });
  check('post kan inte flyttas till annan klinik', moved.clinic_id === A && (await svc('Customer').get(made.id)).clinic_id === A);
  r = await cA.filter({ clinic_id: B });
  check('explicit filter på klinik B ger inget', r.items.length === 0);
  r = await cA.filter({ $or: [{ clinic_id: B }, { name: { $regex: 'kund b', $options: 'i' } }] });
  check('$or-trick mot klinik B ger inget', r.items.length === 0);
  check('count räknar bara egen klinik', (await cA.count({})) === 4);

  console.log('2. Frågemotorn (alla operatorer mot riktig databas)');
  r = await cA.filter({ email: seed.a.cust.email });
  check('textfält-likhet (email)', r.items.length === 1 && r.items[0].id === seed.a.cust.id);
  r = await cA.filter({ name: { $regex: '^zz kund', $options: 'i' } });
  check('$regex', r.items.length === 1);
  const bA = as(adminA, 'Booking');
  r = await bA.filter({ status: { $in: ['pending'] } });
  check('$in', r.items.length === 1);
  r = await bA.filter({ status: { $nin: ['cancelled', 'no_show'] }, start_time: { $gte: new Date(Date.now() - DAY).toISOString(), $lt: new Date(Date.now() + 30 * DAY).toISOString() } });
  check('$nin + datumintervall', r.items.length === 1);
  r = await bA.filter({ price: { $gt: 50 } }, { sort: '-start_time', limit: 5 });
  check('numerisk jämförelse + sortering', r.items.length === 1);
  r = await bA.filter({ notes: { $exists: false } });
  check('$exists:false', r.items.length === 1);
  r = await cA.filter({ status: { $ne: 'inactive' } });
  check('$ne', r.items.length === 4);
  check('count med textfilter', (await cA.count({ status: 'active' })) === 1);
  const agg = await as(adminA, 'Payment').aggregate({ groupBy: 'status', sum: ['amount'] });
  check('aggregate summerar bara egen klinik', agg.rows.length === 1 && Number(agg.rows[0].sum_amount) === 100, JSON.stringify(agg.rows));
  const p1 = await cA.filter({}, { limit: 2, sort: 'name' });
  const p2 = await cA.filter({}, { limit: 2, sort: 'name', cursor: p1.next_cursor });
  const ids = new Set([...p1.items, ...p2.items].map((x) => x.id));
  check('sidnavigering (cursor) ger nya poster', p1.has_more && p2.items.length === 2 && ids.size === 4);
  check('fältnamns-injektion nekas', (await thrown(cA.filter({ "name' OR '1'='1": 'x' })))?.status === 400);
  check('sorterings-injektion nekas', (await thrown(cA.filter({}, { sort: 'name; DROP TABLE e_customer' })))?.status === 400);
  check('okänt fält nekas', (await thrown(cA.filter({ finns_inte: 1 })))?.status === 400);

  console.log('3. Behörighet per roll');
  for (const ent of ['Customer', 'JournalEntry', 'HealthDeclaration', 'Consent', 'AuditLog', 'Payment', 'Booking']) {
    check(`kund utan personalroll nekas ${ent}`, denied(await thrown(as(patientA, ent).filter({}))));
  }
  r = await as(orphan, 'Customer').filter({}).catch((e) => ({ items: [], e }));
  check('personal utan klinik ser inga kunder', r.items.length === 0);
  check('personal utan klinik kan inte skapa poster', denied(await thrown(as(orphan, 'Customer').create({ name: 'ZZ X' }))));
  for (const ent of ['JournalEntry', 'HealthDeclaration', 'Consent', 'AuditLog', 'Payment']) {
    check(`reception nekas ${ent}`, denied(await thrown(as(receptionA, ent).filter({}))));
  }
  check('reception ser kunder i egen klinik', (await as(receptionA, 'Customer').filter({})).items.length === 4);
  const jT = as(therapistA, 'JournalEntry');
  r = await jT.filter({});
  check('behandlare ser journaler i egen klinik, aldrig B:s', r.items.length === 2 && r.items.every((x) => x.clinic_id === A));
  check('behandlare nekas revisionsloggen', denied(await thrown(as(therapistA, 'AuditLog').filter({}))));
  r = await as(therapistA, 'Staff').filter({}).catch(() => ({ items: [] }));
  check('behandlare ser inte personallistan', r.items.length === 0);
  const fake = await jT.create({ customer_name: 'ZZ Kund a', customer_id: seed.a.cust.id, entry_date: new Date().toISOString(), is_signed: true, signed_by: 'fejk', signature_hash: 'fejk' });
  check('journal kan inte skapas som förhandssignerad', fake.is_signed !== true && !fake.signed_by);
  check('signerad journal kan inte ändras', denied(await thrown(jT.update(seed.a.signed.id, { notes: 'ändrad' }))));
  check('signerad journal kan inte raderas', denied(await thrown(jT.delete(seed.a.signed.id))));
  check('audit-post kan inte ändras', denied(await thrown(as(adminA, 'AuditLog').update(seed.a.aud.id, { description: 'förfalskad' }))));
  check('audit-post kan inte raderas', denied(await thrown(as(adminA, 'AuditLog').delete(seed.a.aud.id))));
  await as(adminA, 'Booking').update(seed.a.bk.id, { status: 'completed', notes: 'ok' });
  const bk = await svc('Booking').get(seed.a.bk.id);
  check('bokningsstatus kan inte sättas direkt (endast via kravkontroll)', bk.status === 'pending' && bk.notes === 'ok');
  const pay = await as(adminA, 'Payment').create({ customer_id: seed.a.cust.id, amount: 5, status: 'paid', receipt_number: 'R-TEST-1', method: 'cash', stripe_payment_intent_id: 'pi_forged' });
  check('kassabetalning behåller status/kvittonummer men inte Stripe-id', pay.status === 'paid' && pay.receipt_number === 'R-TEST-1' && !pay.stripe_payment_intent_id);

  // ---------- 4. Databasnivå (FORCE RLS) ----------
  console.log('4. PostgreSQL FORCE RLS (utan applikationslagret)');
  const role = (await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
  check('appens databasroll är varken superuser eller BYPASSRLS', role && !role.rolsuper && !role.rolbypassrls, JSON.stringify(role));
  const rls = (await pool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relname LIKE 'e\\_%' AND c.relkind = 'r' AND NOT c.relforcerowsecurity")).rows[0].n;
  check('alla entitetstabeller har FORCE ROW LEVEL SECURITY', rls === 0, `${rls} saknar`);
  const noCtx = await withTx((c) => c.query('SELECT count(*)::int AS n FROM e_customer'), {});
  check('fråga utan klinikkontext ser 0 rader (fail-closed)', noCtx.rows[0].n === 0);
  const ctxA = await withTx((c) => c.query('SELECT DISTINCT clinic_id FROM e_customer WHERE clinic_id LIKE $1', ['zzt-%']), { clinicId: A });
  check('klinikkontext A ser bara A:s rader', ctxA.rows.length === 1 && ctxA.rows[0].clinic_id === A);
  const upd = await withTx((c) => c.query('UPDATE e_customer SET data = data WHERE clinic_id = $1', [B]), { clinicId: A });
  check('UPDATE mot klinik B från kontext A träffar 0 rader', upd.rowCount === 0);
  const del = await withTx((c) => c.query('DELETE FROM e_customer WHERE clinic_id = $1', [B]), { clinicId: A });
  check('DELETE mot klinik B från kontext A träffar 0 rader', del.rowCount === 0);
  const ins = await thrown(withTx((c) => c.query("INSERT INTO e_customer (data, clinic_id) VALUES ('{}'::jsonb, $1)", [B]), { clinicId: A }));
  check('INSERT i klinik B från kontext A avvisas av databasen', !!ins);
  const insEmpty = await thrown(withTx((c) => c.query("INSERT INTO e_customer (data, clinic_id) VALUES ('{}'::jsonb, '')"), { clinicId: '' }));
  check('INSERT utan klinik avvisas av databasen', !!insEmpty);
  const forged = await thrown(withTx((c) => c.query('SELECT count(*) FROM e_customer WHERE clinic_id = $1', [B]).then((x) => { if (Number(x.rows[0].count) > 0) throw new Error('LÄCKA'); }), { clinicId: A }));
  check('direkt SELECT på klinik B från kontext A ger inget', !forged);

  // ---------- 5. Funktioner ----------
  console.log('5. Backend-funktioner (patient/personal/annan klinik)');
  if (!existsSync(FN_DIR)) {
    check('kompilerade funktioner finns (kör npm run build:functions)', false, FN_DIR);
    return;
  }
  const none = (res) => res.status === 401 || res.status === 403;
  let x = await call('exportPatientData', patientA, { customer_id: seed.a.cust.id });
  check('kund kan inte exportera patientdata (ens sin egen)', none(x), String(x.status));
  x = await call('exportPatientData', patientA, { customer_id: seed.b.cust.id });
  check('kund A kan inte exportera kund B:s data', none(x), String(x.status));
  x = await call('exportPatientData', null, { customer_id: seed.a.cust.id });
  check('oinloggad kan inte exportera patientdata', none(x), String(x.status));
  x = await call('exportPatientData', adminB, { customer_id: seed.a.cust.id });
  check('admin i klinik B kan inte exportera klinik A:s patient', none(x), String(x.status));
  x = await call('exportPatientData', receptionA, { customer_id: seed.a.cust.id });
  check('reception kan inte exportera journaldata', none(x), String(x.status));
  x = await call('exportPatientData', adminA, { customer_id: seed.a.cust.id });
  check('admin A kan exportera egen patient — utan klinik B:s data', x.status === 200 && !JSON.stringify(x.data).includes(`kund-b-${RUN}`) && JSON.stringify(x.data).includes('hemlig-a'), String(x.status));

  x = await call('signJournalEntry', patientA, { journal_id: seed.a.jr.id });
  check('kund kan inte signera journal', none(x), String(x.status));
  x = await call('signJournalEntry', adminB, { journal_id: seed.a.signed.id });
  check('annan klinik får varken signera eller läsa (även redan signerad)', none(x) && !JSON.stringify(x.data).includes('last-a'), String(x.status));
  x = await call('signJournalEntry', therapistA, { journal_id: seed.a.jr.id });
  const signedNow = await svc('JournalEntry').get(seed.a.jr.id);
  check('behandlare i klinik A kan signera', x.status === 200 && signedNow.is_signed === true && !!signedNow.signature_hash, String(x.status));
  check('klinik B:s journal påverkades inte', (await svc('JournalEntry').get(seed.b.jr.id)).is_signed === false);

  x = await call('revokeConsent', patientA, { consent_id: seed.a.co.id });
  check('kund kan inte återkalla samtycke via personalfunktion', none(x), String(x.status));
  x = await call('revokeConsent', adminB, { consent_id: seed.a.co.id });
  check('annan klinik kan inte återkalla samtycke', none(x), String(x.status));
  x = await call('sendReceiptEmail', patientA, { payment_id: seed.a.pay.id });
  check('kund kan inte trigga kvittomejl', none(x), String(x.status));
  x = await call('sendReceiptEmail', adminB, { payment_id: seed.a.pay.id });
  check('annan klinik kan inte trigga kvittomejl', none(x), String(x.status));
  x = await call('sendBookingConfirmation', patientA, { booking_id: seed.a.bk.id });
  check('kund kan inte trigga bokningsmejl', none(x), String(x.status));
  x = await call('recordAuditEvent', patientA, { event_type: 'fejk', entity_type: 'X' });
  check('kund kan inte skriva i revisionsloggen', none(x), String(x.status));
  x = await call('updateBookingStatus', patientA, { booking_id: seed.a.bk.id, status: 'cancelled' });
  check('kund kan inte ändra bokningsstatus via personalfunktion', none(x), String(x.status));
  x = await call('updateBookingStatus', adminB, { booking_id: seed.a.bk.id, status: 'cancelled' });
  check('annan klinik kan inte ändra bokningsstatus', none(x), String(x.status));
  x = await call('updateBookingStatus', orphan, { booking_id: seed.a.bk.id, status: 'cancelled' });
  check('personal utan klinik kan inte ändra bokningsstatus', none(x), String(x.status));
  x = await call('getBookingRequirements', patientB, { booking_id: seed.a.bk.id });
  check('kund B kan inte läsa kund A:s bokningskrav', none(x), String(x.status));
  x = await call('getBookingRequirements', patientA, { booking_id: seed.a.bk.id });
  check('kund A kan läsa sina egna bokningskrav', x.status === 200, String(x.status));
  x = await call('getPatientPortalData', patientA, {});
  const portal = JSON.stringify(x.data);
  check('kundportalen innehåller bara egen data', x.status === 200 && portal.includes(seed.a.cust.id) && !portal.includes(seed.b.cust.id) && !portal.includes('hemlig-b'), String(x.status));
  x = await call('cancelPatientBooking', patientB, { booking_id: seed.a.bk.id });
  check('kund B kan inte avboka kund A:s bokning', none(x), String(x.status));

  console.log('6. Gästbokning och betalning');
  const trt = await svc('Treatment').create({
    clinic_id: A, name: 'ZZ Injektion', duration: 30, price: 1000, treatment_type: 'injektion', min_age: 18,
    requires_health_declaration: true, requires_consent: true, requires_payment: true, guest_booking_allowed: true,
  });
  await svc('Staff').create({ clinic_id: A, name: 'ZZ Behandlare', role: 'behandlare', active: true });
  for (let d = 0; d < 7; d++) await svc('StaffSchedule').create({ clinic_id: A, staff_name: 'ZZ Behandlare', day_of_week: d, start_time: '06:00', end_time: '20:00' });
  const slot = (h) => { const d = new Date(Date.now() + 10 * DAY); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
  const book = (user, email, h, extra = {}) => call('createPublicBooking', user, {
    clinic_id: A, treatment_id: trt.id, staff_name: 'ZZ Behandlare', start_time: slot(h),
    customer: { name: 'ZZ Gäst', email, birth_date: '1990-01-01', ...extra },
  });

  const guestEmail = `gast-${RUN}@example.test`;
  x = await book(null, guestEmail, 8);
  const g1 = x.data;
  check('ny gäst kan boka och får betalningstoken', x.status === 200 && !!g1?.payment_token && !!g1?.booking?.id, `${x.status} ${JSON.stringify(x.data).slice(0, 160)}`);
  const stored = g1?.booking?.id ? await svc('Booking').get(g1.booking.id) : {};
  check('endast token-hash sparas, aldrig token i klartext', !!stored.pay_token_hash && stored.pay_token_hash !== g1?.payment_token);

  const phoneBefore = (await svc('Customer').get(seed.a.cust.id)).phone;
  const bookingsBefore = (await svc('Booking').filter({ customer_id: seed.a.cust.id })).items.length;
  x = await book(null, seed.a.cust.email, 9, { phone: '0700000000', name: 'ZZ Kapad' });
  check('gäst kan inte koppla bokning till befintlig kund (e-post)', x.status === 409 && x.data?.code === 'account_exists', `${x.status}`);
  const custAfter = await svc('Customer').get(seed.a.cust.id);
  const bookingsAfter = (await svc('Booking').filter({ customer_id: seed.a.cust.id })).items.length;
  check('befintlig kunds uppgifter och bokningar är orörda', custAfter.phone === phoneBefore && custAfter.name === 'ZZ Kund a' && bookingsAfter === bookingsBefore);
  x = await book(patientB, seed.a.cust.email, 9);
  check('inloggad kund B kan inte boka åt kund A:s e-post', x.status === 409, `${x.status}`);
  x = await book(null, `barn-${RUN}@example.test`, 9, { birth_date: '2015-01-01' });
  check('ålderskontroll 18 år för injektion nekar minderårig', x.status === 400 && x.data?.code === 'under_age', `${x.status}`);
  x = await book(null, `utandatum-${RUN}@example.test`, 9, { birth_date: undefined });
  check('födelsedatum krävs för injektion', x.status === 400 && x.data?.code === 'age_required', `${x.status}`);
  x = await book(null, `dubbel-${RUN}@example.test`, 8);
  check('dubbelbokning av samma tid nekas', x.status === 409, `${x.status}`);
  x = await book(patientA, seed.a.cust.email, 9);
  const own = x.data;
  check('inloggad kund kan boka på sin egen e-post', x.status === 200 && !!own?.booking?.id, `${x.status} ${JSON.stringify(x.data).slice(0, 120)}`);

  const pi = (user, id, token) => call('createPaymentIntent', user, { booking_id: id, payment_token: token });
  x = await pi(null, g1.booking.id);
  check('betalning utan token/inloggning nekas', x.status === 403, `${x.status}`);
  x = await pi(null, g1.booking.id, 'fel-token');
  check('betalning med fel token nekas', x.status === 403, `${x.status}`);
  x = await pi(null, own.booking.id, g1.payment_token);
  check('gästens token fungerar inte på någon annans bokning', x.status === 403, `${x.status}`);
  x = await pi(patientB, own.booking.id);
  check('annan inloggad kund kan inte betala kund A:s bokning', x.status === 403, `${x.status}`);
  x = await pi(adminB, g1.booking.id);
  check('personal i annan klinik kan inte skapa betalning', x.status === 403, `${x.status}`);
  x = await pi(null, g1.booking.id, g1.payment_token);
  check('rätt token ger betalning', x.status === 200 && !!x.data?.client_secret, `${x.status} ${JSON.stringify(x.data).slice(0, 100)}`);
  x = await pi(patientA, own.booking.id);
  check('bokningens ägare kan betala utan token', x.status === 200, `${x.status}`);
  x = await pi(adminA, g1.booking.id);
  check('personal i samma klinik kan skapa betalning', x.status === 200, `${x.status}`);

  // Webhook: betalning får inte förbigå hälsodeklaration/samtycke.
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const hook = (payload, sigOverride) => {
    const raw = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = sigOverride ?? `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
    return call('stripeWebhook', null, {}, { raw, headers: { 'stripe-signature': sig } });
  };
  const evt = { type: 'payment_intent.succeeded', data: { object: { amount: 100000, amount_received: 100000, metadata: { booking_id: g1.booking.id, clinic_id: A, customer_name: 'ZZ Gäst' } } } };
  x = await hook(evt, 't=1,v1=00');
  check('webhook med falsk signatur nekas', x.status === 400, `${x.status}`);
  x = await hook(evt);
  const paid = (await svc('Payment').filter({ booking_id: g1.booking.id, status: 'paid' })).items;
  const afterHook = await svc('Booking').get(g1.booking.id);
  check('webhook registrerar betalningen', x.status === 200 && paid.length === 1, `${x.status}`);
  check('betalning ensam bekräftar INTE bokningen när hälsodeklaration/samtycke saknas', afterHook.status === 'pending', afterHook.status);
  await hook(evt);
  check('webhook är idempotent (ingen dubbel registrering)', (await svc('Payment').filter({ booking_id: g1.booking.id, status: 'paid' })).items.length === 1);
  x = await pi(null, g1.booking.id, g1.payment_token);
  check('redan betald bokning kan inte betalas igen', x.status === 409, `${x.status}`);
  x = await call('updateBookingStatus', adminA, { booking_id: g1.booking.id, status: 'confirmed' });
  check('personal kan inte bekräfta bokning med ouppfyllda krav', x.status === 409 && x.data?.code === 'requirements_incomplete', `${x.status}`);
}

try {
  await main();
} catch (e) {
  fails.push(`OVÄNTAT FEL: ${e.stack || e.message}`);
  console.log(e);
} finally {
  try {
    await cleanup();
    const left = await withTx(async (c) => {
      let n = 0;
      for (const e of entities.values()) n += (await c.query(`SELECT count(*)::int AS n FROM ${e.table} WHERE clinic_id = ANY($1)`, [[A, B]])).rows[0].n;
      return n;
    }, { bypassRls: true });
    if (left) fails.push(`städning lämnade ${left} testposter`);
  } catch (e) { fails.push(`städning misslyckades: ${e.message}`); }
  await pool.end();
}

console.log(`\n${pass} godkända, ${fails.length} fel`);
if (fails.length) { console.log('MISSLYCKADE:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('SÄKERHETSTEST GODKÄNT');