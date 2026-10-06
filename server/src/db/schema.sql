-- Lydia — PostgreSQL Schema (portabel, Base44-oberoende)
-- Mappar alla 35 Base44-entiteter till SQL-tabeller med clinic_id tenant-isolering.
-- Kör: psql -U postgres -d lydia -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Hjälpfunktion för updated_date
CREATE OR REPLACE FUNCTION update_updated_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- KERNTABELLER
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  clinic_id TEXT,
  staff_role TEXT,
  data JSONB DEFAULT '{}',
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER set_updated_date_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT,
  org_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  industry TEXT,
  settings JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER set_updated_date_clinics BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  role TEXT DEFAULT 'behandlare',
  permissions TEXT,
  active BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staff_clinic ON staff(clinic_id);
CREATE TRIGGER set_updated_date_staff BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  birth_date DATE,
  personnummer TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  tags TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customers_clinic ON customers(clinic_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE TRIGGER set_updated_date_customers BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_date();

-- ============================================================
-- BEHANDLING & BOKNING
-- ============================================================

CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  duration NUMERIC,
  price NUMERIC,
  category TEXT,
  vat NUMERIC DEFAULT 25,
  treatment_type TEXT DEFAULT 'annan',
  betanketid_hours NUMERIC DEFAULT 0,
  information_version TEXT,
  repeat_treatment_months NUMERIC DEFAULT 0,
  requires_identity_verification BOOLEAN DEFAULT FALSE,
  requires_ordination BOOLEAN DEFAULT FALSE,
  requires_health_declaration BOOLEAN DEFAULT FALSE,
  requires_consent BOOLEAN DEFAULT TRUE,
  requires_treatment_info BOOLEAN DEFAULT FALSE,
  requires_aftercare BOOLEAN DEFAULT FALSE,
  requires_payment BOOLEAN DEFAULT FALSE,
  guest_booking_allowed BOOLEAN DEFAULT TRUE,
  min_age NUMERIC DEFAULT 0,
  waiting_period_days NUMERIC DEFAULT 0,
  cancellation_hours NUMERIC DEFAULT 24,
  no_show_fee NUMERIC DEFAULT 0,
  required_form_ids TEXT,
  buffer_before NUMERIC DEFAULT 0,
  buffer_after NUMERIC DEFAULT 0,
  min_lead_hours NUMERIC DEFAULT 0,
  max_lead_days NUMERIC DEFAULT 0,
  room_id TEXT,
  required_resource_ids TEXT,
  deposit_amount NUMERIC DEFAULT 0,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_treatments_clinic ON treatments(clinic_id);
CREATE TRIGGER set_updated_date_treatments BEFORE UPDATE ON treatments FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  treatment_id TEXT,
  treatment_name TEXT NOT NULL,
  staff_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  price NUMERIC,
  notes TEXT,
  room_id TEXT,
  resource_ids TEXT,
  deposit_amount NUMERIC DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT FALSE,
  calendar_event_id TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bookings_clinic ON bookings(clinic_id);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_start ON bookings(start_time);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE TRIGGER set_updated_date_bookings BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  capacity NUMERIC DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rooms_clinic ON rooms(clinic_id);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_resources_clinic ON resources(clinic_id);

CREATE TABLE IF NOT EXISTS staff_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id TEXT,
  staff_name TEXT,
  day_of_week NUMERIC,
  start_time TEXT,
  end_time TEXT,
  effective_from DATE,
  effective_until DATE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staff_schedules_clinic ON staff_schedules(clinic_id);

CREATE TABLE IF NOT EXISTS staff_time_off (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id TEXT,
  staff_name TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  reason TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staff_time_off_clinic ON staff_time_off(clinic_id);

CREATE TABLE IF NOT EXISTS waiting_list (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  treatment_id TEXT,
  treatment_name TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  status TEXT DEFAULT 'waiting',
  notified BOOLEAN DEFAULT FALSE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_waiting_list_clinic ON waiting_list(clinic_id);

-- ============================================================
-- JOURNAL & KLINISK DOKUMENTATION
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  treatment_id TEXT,
  treatment_name TEXT,
  booking_id TEXT,
  provider TEXT,
  entry_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  observations TEXT,
  assessment TEXT,
  treatment_performed TEXT,
  aftercare TEXT,
  recommendations TEXT,
  is_signed BOOLEAN DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  signed_by TEXT,
  signature_hash TEXT,
  version NUMERIC DEFAULT 1,
  parent_id TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_journal_clinic ON journal_entries(clinic_id);
CREATE INDEX idx_journal_customer ON journal_entries(customer_id);
CREATE TRIGGER set_updated_date_journal BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE TABLE IF NOT EXISTS clinical_treatment_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  treatment_id TEXT,
  treatment_name TEXT,
  booking_id TEXT,
  provider TEXT,
  record_date TIMESTAMPTZ NOT NULL,
  treatment_area TEXT,
  product TEXT,
  substance TEXT,
  manufacturer TEXT,
  batch_lot TEXT,
  expiry_date DATE,
  dose TEXT,
  units TEXT,
  injection_sites TEXT,
  technique TEXT,
  needle_cannula TEXT,
  ordination_prescriber TEXT,
  ordination_date DATE,
  ordination_reference TEXT,
  aftercare_instructions TEXT,
  next_recommended_visit DATE,
  notes TEXT,
  is_signed BOOLEAN DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  signed_by TEXT,
  signature_hash TEXT,
  version NUMERIC DEFAULT 1,
  parent_id TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clinical_clinic ON clinical_treatment_records(clinic_id);
CREATE INDEX idx_clinical_customer ON clinical_treatment_records(customer_id);

CREATE TABLE IF NOT EXISTS treatment_media (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  treatment_id TEXT,
  treatment_name TEXT,
  booking_id TEXT,
  clinical_record_id TEXT,
  media_type TEXT DEFAULT 'before',
  file_uri TEXT NOT NULL,
  file_name TEXT NOT NULL,
  treatment_area TEXT,
  taken_at TIMESTAMPTZ,
  taken_by TEXT,
  consent_given BOOLEAN DEFAULT FALSE,
  internal_only BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_media_clinic ON treatment_media(clinic_id);
CREATE INDEX idx_media_customer ON treatment_media(customer_id);

CREATE TABLE IF NOT EXISTS complications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  clinical_record_id TEXT,
  treatment_id TEXT,
  treatment_name TEXT,
  booking_id TEXT,
  complication_type TEXT DEFAULT 'komplikation',
  "date" TIMESTAMPTZ NOT NULL,
  severity TEXT DEFAULT 'lindrig',
  description TEXT,
  action_taken TEXT,
  responsible_person TEXT,
  follow_up_date DATE,
  outcome TEXT,
  reporting_status TEXT DEFAULT 'ej_rapporterad',
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_complications_clinic ON complications(clinic_id);
CREATE INDEX idx_complications_customer ON complications(customer_id);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  treatment_name TEXT NOT NULL,
  recommended_interval_days NUMERIC DEFAULT 90,
  next_recommended_date DATE,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_by TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_plans_clinic ON treatment_plans(clinic_id);

CREATE TABLE IF NOT EXISTS treatment_compliance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  treatment_id TEXT NOT NULL,
  treatment_name TEXT,
  treatment_type TEXT,
  booking_id TEXT,
  information_given_at TIMESTAMPTZ,
  information_version TEXT,
  information_given_by TEXT,
  betanketid_hours NUMERIC,
  betanketid_ends_at TIMESTAMPTZ,
  consent_eligible_at TIMESTAMPTZ,
  consent_signed_at TIMESTAMPTZ,
  age_verified BOOLEAN DEFAULT FALSE,
  age_verified_at TIMESTAMPTZ,
  previous_treatment_checked BOOLEAN DEFAULT FALSE,
  previous_treatment_checked_at TIMESTAMPTZ,
  previous_treatment_found BOOLEAN DEFAULT FALSE,
  previous_treatment_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  block_reason TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_compliance_clinic ON treatment_compliance(clinic_id);

-- ============================================================
-- FORMULÄR, SAMTYCKEN & HÄLSODEKLARATIONER
-- ============================================================

CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'health_declaration',
  description TEXT,
  questions TEXT,
  version NUMERIC DEFAULT 1,
  status TEXT DEFAULT 'active',
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_form_templates_clinic ON form_templates(clinic_id);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id TEXT,
  template_name TEXT NOT NULL,
  template_version NUMERIC DEFAULT 1,
  questions_snapshot TEXT,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  booking_id TEXT,
  answers TEXT,
  status TEXT DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_form_submissions_clinic ON form_submissions(clinic_id);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  type TEXT NOT NULL,
  version NUMERIC DEFAULT 1,
  text TEXT,
  granted BOOLEAN DEFAULT FALSE,
  granted_at TIMESTAMPTZ,
  granted_by TEXT,
  signed_text TEXT,
  document_version NUMERIC,
  ip_address TEXT,
  device_info TEXT,
  signature_hash TEXT,
  revoked_at TIMESTAMPTZ,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_consents_clinic ON consents(clinic_id);
CREATE INDEX idx_consents_customer ON consents(customer_id);

CREATE TABLE IF NOT EXISTS health_declarations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  booking_id TEXT,
  treatment_id TEXT,
  treatment_name TEXT,
  answers TEXT,
  signed_text TEXT,
  signature_hash TEXT,
  ip_address TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_health_decl_clinic ON health_declarations(clinic_id);

-- ============================================================
-- BETALNING & COMMERCE
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  booking_id TEXT,
  treatment_name TEXT,
  amount NUMERIC,
  vat NUMERIC,
  vat_rate NUMERIC DEFAULT 25,
  method TEXT DEFAULT 'card',
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  receipt_number TEXT,
  stripe_payment_intent_id TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payments_clinic ON payments(clinic_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  description TEXT,
  unit TEXT DEFAULT 'st',
  stock_quantity NUMERIC DEFAULT 0,
  min_stock NUMERIC DEFAULT 0,
  supplier TEXT,
  cost_price NUMERIC DEFAULT 0,
  sell_price NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_clinic ON products(clinic_id);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL,
  product_name TEXT,
  type TEXT DEFAULT 'consumption',
  quantity NUMERIC NOT NULL,
  batch_lot TEXT,
  expiry_date DATE,
  supplier TEXT,
  related_booking_id TEXT,
  note TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inventory_clinic ON inventory_transactions(clinic_id);

CREATE TABLE IF NOT EXISTS gift_cards (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL,
  type TEXT DEFAULT 'giftcard',
  name TEXT,
  initial_balance NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  initial_clips NUMERIC DEFAULT 0,
  remaining_clips NUMERIC DEFAULT 0,
  treatment_ids TEXT,
  customer_id TEXT,
  customer_name TEXT,
  valid_from DATE,
  valid_until DATE,
  status TEXT DEFAULT 'active',
  purchased_at TIMESTAMPTZ,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gift_cards_clinic ON gift_cards(clinic_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'discount',
  discount_type TEXT DEFAULT 'percent',
  discount_value NUMERIC DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  status TEXT DEFAULT 'draft',
  description TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_campaigns_clinic ON campaigns(clinic_id);

CREATE TABLE IF NOT EXISTS discount_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code TEXT NOT NULL,
  campaign_id TEXT,
  discount_type TEXT DEFAULT 'percent',
  discount_value NUMERIC DEFAULT 0,
  max_uses NUMERIC DEFAULT 0,
  used_count NUMERIC DEFAULT 0,
  valid_until DATE,
  active BOOLEAN DEFAULT TRUE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_discount_codes_clinic ON discount_codes(clinic_id);

-- ============================================================
-- KOMMUNIKATION & MARKNADSFÖRING
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  direction TEXT DEFAULT 'inbound',
  subject TEXT,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  staff_name TEXT,
  related_booking_id TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_clinic ON messages(clinic_id);

CREATE TABLE IF NOT EXISTS communication_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  channel TEXT,
  direction TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comm_logs_clinic ON communication_logs(clinic_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT,
  customer_name TEXT,
  booking_id TEXT,
  treatment_name TEXT,
  rating NUMERIC DEFAULT 5,
  text TEXT,
  would_recommend BOOLEAN DEFAULT TRUE,
  published BOOLEAN DEFAULT FALSE,
  staff_response TEXT,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_reviews_clinic ON reviews(clinic_id);

-- ============================================================
-- ADMIN, AUDIT & SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  user_id TEXT,
  user_name TEXT,
  metadata TEXT,
  clinic_id TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_clinic ON audit_logs(clinic_id);
CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS patient_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  file_name TEXT NOT NULL,
  file_uri TEXT NOT NULL,
  file_type TEXT DEFAULT 'document',
  mime_type TEXT,
  size_bytes NUMERIC,
  description TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_patient_files_clinic ON patient_files(clinic_id);

CREATE TABLE IF NOT EXISTS management_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'rutin',
  category TEXT,
  content TEXT,
  responsible_person TEXT,
  version NUMERIC DEFAULT 1,
  status TEXT DEFAULT 'draft',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  valid_from DATE,
  valid_until DATE,
  annual_review_date DATE,
  clinic_id TEXT NOT NULL,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mgmt_docs_clinic ON management_documents(clinic_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL,
  label TEXT,
  module TEXT DEFAULT 'core',
  status TEXT DEFAULT 'disabled',
  requires_external BOOLEAN DEFAULT FALSE,
  required_secrets TEXT,
  description TEXT,
  activation_instructions TEXT,
  clinic_id TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_feature_flags_clinic ON feature_flags(clinic_id);
CREATE INDEX idx_feature_flags_key ON feature_flags(key);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  assigned_to TEXT,
  clinic_id TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_clinic ON tasks(clinic_id);

-- ============================================================
-- RLS-POLICIES (PostgreSQL Row-Level Security)
// Ersätter Base44 RLS med Postgres inbyggda RLS.
// ============================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_treatment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: användare kan bara se data från sin egen klinik
CREATE POLICY clinic_isolation ON customers FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON bookings FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON journal_entries FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON clinical_treatment_records FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON consents FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON health_declarations FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON treatments FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON staff FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));
CREATE POLICY clinic_isolation ON payments FOR ALL USING (clinic_id = current_setting('app.clinic_id', true));

-- Signerade journaler kan ej ändras (ersätter Base44 RLS is_signed != true regel)
CREATE POLICY no_edit_signed ON journal_entries FOR UPDATE USING (is_signed = FALSE);
CREATE POLICY no_edit_signed ON clinical_treatment_records FOR UPDATE USING (is_signed = FALSE);