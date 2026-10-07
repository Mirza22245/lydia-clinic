#!/usr/bin/env node
// Skapar/uppdaterar databasschemat (tabeller, index, FORCE RLS-policyer).
// Körs med ägar-/admin-rollen — aldrig med appens DML-roll lydia_app.
//   MIGRATE_DATABASE_URL=postgresql://lydia:<pw>@host:5432/lydia npm run migrate
import pg from 'pg';
import { ensureSchema } from '../src/db/schema.js';

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Sätt MIGRATE_DATABASE_URL (ägar-/admin-roll, inte lydia_app).');
  process.exit(1);
}
const db = new pg.Pool({ connectionString: url, max: 1 });
try {
  await ensureSchema(db);

  // Bootstrap the public clinic record so a fresh Hostinger/Supabase deployment
  // can render the booking page before an admin has seeded clinic data.
  await db.query(`
    INSERT INTO e_clinic (id, data, clinic_id)
    VALUES (
      'lydia-estetisk',
      '{"name":"Lydia Estetisk","brand_name":"Lydia Estetisk","clinic_id":"lydia-estetisk","description":"","opening_hours":""}'::jsonb,
      'lydia-estetisk'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO e_feature_flag (id, data, clinic_id)
    VALUES
      ('flag-messages-lydia', '{"key":"messages","label":"Patientmeddelanden","module":"communication","status":"disabled","requires_external":false,"required_secrets":"[]","description":"Meddelanden mellan patient och klinik.","activation_instructions":"Aktivera när meddelandeflödet ska öppnas för patienter.","clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('flag-treatment-plans-lydia', '{"key":"treatment_plans","label":"Behandlingsplaner","module":"clinical","status":"disabled","requires_external":false,"required_secrets":"[]","description":"Behandlingsplaner i patientportalen.","activation_instructions":"Aktivera när behandlingsplaner ska visas i patientportalen.","clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('flag-sms-lydia', '{"key":"sms","label":"SMS","module":"communication","status":"disabled","requires_external":true,"required_secrets":"[\"SMS_PROVIDER\",\"SMS_API_KEY\",\"SMS_API_SECRET\",\"SMS_SENDER\"]","description":"SMS-bekräftelser, påminnelser och verifiering.","activation_instructions":"Konfigurera SMS-provider och secrets innan aktivering.","clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('flag-bankid-lydia', '{"key":"bankid","label":"BankID","module":"integration","status":"disabled","requires_external":true,"required_secrets":"[\"BANKID_MODE\",\"BANKID_API_URL\",\"BANKID_CLIENT_SECRET\",\"BANKID_PFX_B64\",\"BANKID_PFX_PASSPHRASE\"]","description":"BankID-verifiering för patienter och personal.","activation_instructions":"Konfigurera BankID-certifikat och API innan aktivering.","clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('flag-google-calendar-lydia', '{"key":"google_calendar","label":"Google Calendar","module":"integration","status":"disabled","requires_external":true,"required_secrets":"[\"GOOGLE_CLIENT_ID\",\"GOOGLE_CLIENT_SECRET\"]","description":"Kalendersynk för personalens bokningar.","activation_instructions":"Konfigurera Google OAuth innan aktivering.","clinic_id":"lydia-estetisk'),
      ('flag-stripe-lydia', '{"key":"stripe","label":"Stripe","module":"commerce","status":"disabled","requires_external":true,"required_secrets":"[\"STRIPE_SECRET_KEY\",\"STRIPE_PUBLISHABLE_KEY\",\"STRIPE_WEBHOOK_SECRET\"]","description":"Kortbetalning och betalningsflöden.","activation_instructions":"Konfigurera Stripe-nycklar och webhook innan aktivering.","clinic_id":"lydia-estetisk'})
    ON CONFLICT (id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO e_treatment (id, data, clinic_id)
    VALUES
      ('demo-consultation', '{"name":"Konsultation","description":"Inledande konsultation","duration":30,"price":0,"category":"Konsultation","treatment_type":"annan","guest_booking_allowed":true,"requires_consent":true,"cancellation_hours":24,"clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('demo-hudvard', '{"name":"Avancerad hudvård","description":"Hudvårdsbehandling","duration":60,"price":1200,"category":"Hudvård","treatment_type":"hud","guest_booking_allowed":true,"requires_consent":true,"cancellation_hours":24,"clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk'),
      ('demo-injektion', '{"name":"Injektionskonsultation","description":"Konsultation inför injektionsbehandling","duration":30,"price":0,"category":"Injektion","treatment_type":"injektion","min_age":18,"guest_booking_allowed":true,"requires_health_declaration":true,"requires_consent":true,"requires_treatment_info":true,"betanketid_hours":48,"cancellation_hours":24,"clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO e_staff (id, data, clinic_id)
    VALUES
      ('demo-staff', '{"name":"Lydia behandlare","title":"Behandlare","role":"behandlare","active":true,"allowed_treatment_ids":["demo-consultation","demo-hudvard","demo-injektion"],"clinic_id":"lydia-estetisk"}'::jsonb, 'lydia-estetisk')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO e_staff_schedule (id, data, clinic_id)
    VALUES
      ('demo-staff-sun','{"staff_name":"Lydia behandlare","day_of_week":0,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-mon','{"staff_name":"Lydia behandlare","day_of_week":1,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-tue','{"staff_name":"Lydia behandlare","day_of_week":2,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-wed','{"staff_name":"Lydia behandlare","day_of_week":3,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-thu','{"staff_name":"Lydia behandlare","day_of_week":4,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-fri','{"staff_name":"Lydia behandlare","day_of_week":5,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk'),
      ('demo-staff-sat','{"staff_name":"Lydia behandlare","day_of_week":6,"start_time":"09:00","end_time":"17:00","clinic_id":"lydia-estetisk"}'::jsonb,'lydia-estetisk')
    ON CONFLICT (id) DO NOTHING;
  `);
} finally {
  await db.end();
}