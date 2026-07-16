BEGIN;

SELECT set_config('app.integration_sync_bypass_triggers', 'on', true);

CREATE SCHEMA IF NOT EXISTS metrics_v2_phase1a;

CREATE OR REPLACE FUNCTION metrics_v2_phase1a.uuid_for(p_key text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  h text := md5('metrics-v2-phase1a:' || p_key);
  variant_byte text;
BEGIN
  variant_byte := lpad(to_hex((get_byte(decode(substr(h, 17, 2), 'hex'), 0) & 63) | 128), 2, '0');
  RETURN (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-4' ||
    substr(h, 14, 3) || '-' ||
    variant_byte ||
    substr(h, 19, 2) || '-' ||
    substr(h, 21, 12)
  )::uuid;
END;
$$;

CREATE TABLE IF NOT EXISTS metrics_v2_phase1a.run_samples (
  id bigserial PRIMARY KEY,
  sample_label text NOT NULL,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

DELETE FROM metrics_v2_phase1a.run_samples;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  phone,
  phone_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  metrics_v2_phase1a.uuid_for('seller-admin'),
  'authenticated',
  'authenticated',
  'metrics-phase1a@test.local',
  crypt('Phase1A!Welcome123', gen_salt('bf')),
  now(),
  '9490744841',
  now(),
  now(),
  now(),
  '',
  '',
  '',
  '',
  jsonb_build_object('provider', 'phone', 'providers', jsonb_build_array('email', 'phone')),
  jsonb_build_object('name', 'Phase 1A Seller Admin', 'phone', '9490744841')
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  phone_confirmed_at = EXCLUDED.phone_confirmed_at,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  instance_id = EXCLUDED.instance_id,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
(
  gen_random_uuid(),
  'metrics-phase1a@test.local',
  metrics_v2_phase1a.uuid_for('seller-admin'),
  'email',
  jsonb_build_object(
    'sub', metrics_v2_phase1a.uuid_for('seller-admin')::text,
    'email', 'metrics-phase1a@test.local',
    'email_verified', true,
    'phone_verified', true
  ),
  now(),
  now(),
  now()
),
(
  gen_random_uuid(),
  '9490744841',
  metrics_v2_phase1a.uuid_for('seller-admin'),
  'phone',
  jsonb_build_object(
    'sub', metrics_v2_phase1a.uuid_for('seller-admin')::text,
    'phone', '9490744841',
    'phone_verified', true,
    'email_verified', true
  ),
  now(),
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  updated_at = now(),
  last_sign_in_at = now();

INSERT INTO app.tenants (
  id,
  slug,
  business_name,
  gstin,
  primary_state,
  subdomain,
  plan,
  settings,
  created_at,
  updated_at
)
VALUES (
  metrics_v2_phase1a.uuid_for('tenant'),
  'metrics-phase1a',
  'Metrics Phase 1A Validation Distributor',
  '29ABCDE1234F1Z5',
  'Karnataka',
  'metrics-phase1a',
  'scale',
  '{}'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.tenant_users (
  id,
  tenant_id,
  user_id,
  role,
  is_active,
  joined_at,
  created_at,
  updated_at
)
VALUES (
  metrics_v2_phase1a.uuid_for('tenant-user:seller-admin'),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  'seller_admin',
  true,
  now(),
  now(),
  now()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = true,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO catalog.brands (id, name, slug, is_public, external_ref, created_at, updated_at)
SELECT
  metrics_v2_phase1a.uuid_for('brand:' || gs::text),
  'Phase1A Brand ' || gs::text,
  'phase1a-brand-' || gs::text,
  true,
  'phase1a-brand-' || gs::text,
  now(),
  now()
FROM generate_series(1, 25) AS gs
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO catalog.categories (id, name, slug, is_public, external_ref, created_at, updated_at)
SELECT
  metrics_v2_phase1a.uuid_for('category:' || gs::text),
  'Phase1A Category ' || gs::text,
  'phase1a-category-' || gs::text,
  true,
  'phase1a-category-' || gs::text,
  now(),
  now()
FROM generate_series(1, 25) AS gs
ON CONFLICT (parent_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO catalog.products (
  id,
  brand_id,
  category_id,
  master_sku,
  name,
  default_uom,
  pack_size,
  hsn_code,
  gst_rate,
  is_public,
  external_ref,
  created_at,
  updated_at
)
SELECT
  metrics_v2_phase1a.uuid_for('master-product:' || gs::text),
  metrics_v2_phase1a.uuid_for('brand:' || (((gs - 1) % 25) + 1)::text),
  metrics_v2_phase1a.uuid_for('category:' || (((gs - 1) % 25) + 1)::text),
  'P1A-MSKU-' || lpad(gs::text, 4, '0'),
  'Phase1A Product ' || gs::text,
  'pcs',
  1,
  '8525',
  18,
  true,
  'phase1a-product-' || gs::text,
  now(),
  now()
FROM generate_series(1, 500) AS gs
ON CONFLICT (brand_id, master_sku) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.tenant_brands (
  id,
  tenant_id,
  master_brand_id,
  display_name_override,
  is_active,
  external_ref,
  created_at,
  updated_at
)
SELECT
  metrics_v2_phase1a.uuid_for('tenant-brand:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('brand:' || gs::text),
  'Phase1A Tenant Brand ' || gs::text,
  true,
  'phase1a-tenant-brand-' || gs::text,
  now(),
  now()
FROM generate_series(1, 25) AS gs
ON CONFLICT (tenant_id, master_brand_id) DO UPDATE SET
  display_name_override = EXCLUDED.display_name_override,
  is_active = true,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.locations (id, tenant_id, name, address, is_default, created_at, updated_at)
SELECT
  metrics_v2_phase1a.uuid_for('location:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  'Phase1A Location ' || gs::text,
  jsonb_build_object('city', 'Bengaluru', 'state', 'Karnataka', 'pincode', lpad((560000 + gs)::text, 6, '0')),
  gs = 1,
  now(),
  now()
FROM generate_series(1, 9) AS gs
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_default = EXCLUDED.is_default,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.warehouses (id, tenant_id, location_id, name, external_ref, status, is_default, created_at, updated_at)
SELECT
  metrics_v2_phase1a.uuid_for('warehouse:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('location:' || gs::text),
  'Phase1A Warehouse ' || gs::text,
  'phase1a-warehouse-' || gs::text,
  'active',
  gs = 1,
  now(),
  now()
FROM generate_series(1, 9) AS gs
ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
  name = EXCLUDED.name,
  status = 'active',
  is_default = EXCLUDED.is_default,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.tenant_products (
  id,
  tenant_id,
  tenant_brand_id,
  master_product_id,
  internal_sku,
  name_override,
  mrp,
  base_selling_price,
  cost_price,
  default_uom,
  pack_size,
  is_active,
  external_ref,
  created_at,
  updated_at
)
SELECT
  metrics_v2_phase1a.uuid_for('tenant-product:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('tenant-brand:' || (((gs - 1) % 25) + 1)::text),
  metrics_v2_phase1a.uuid_for('master-product:' || gs::text),
  'P1A-SKU-' || lpad(gs::text, 4, '0'),
  'Phase1A Product ' || gs::text,
  1000 + gs,
  800 + gs,
  600 + gs,
  'pcs',
  1,
  true,
  'phase1a-tenant-product-' || gs::text,
  now(),
  now()
FROM generate_series(1, 500) AS gs
ON CONFLICT (tenant_id, internal_sku) DO UPDATE SET
  name_override = EXCLUDED.name_override,
  is_active = true,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.tenant_inventory (
  id,
  tenant_product_id,
  warehouse_id,
  qty_available,
  qty_reserved,
  reorder_point,
  updated_at,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('inventory:' || p::text || ':' || w::text),
  metrics_v2_phase1a.uuid_for('tenant-product:' || p::text),
  metrics_v2_phase1a.uuid_for('warehouse:' || w::text),
  100 + ((p * w) % 900),
  (p + w) % 25,
  25,
  now(),
  NULL
FROM generate_series(1, 500) AS p
CROSS JOIN generate_series(1, 9) AS w
ON CONFLICT (tenant_product_id, warehouse_id) DO UPDATE SET
  qty_available = EXCLUDED.qty_available,
  qty_reserved = EXCLUDED.qty_reserved,
  reorder_point = EXCLUDED.reorder_point,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.buyers (
  id,
  tenant_id,
  business_name,
  contact_name,
  phone,
  email,
  geography,
  credit_limit,
  payment_terms_days,
  tier,
  external_ref,
  is_active,
  buyer_app_enabled,
  created_at,
  updated_at
)
SELECT
  metrics_v2_phase1a.uuid_for('buyer:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  'Phase1A Buyer ' || gs::text,
  'Buyer Contact ' || gs::text,
  lpad((7000000000::bigint + gs)::text, 10, '0'),
  'phase1a-buyer-' || gs::text || '@example.test',
  jsonb_build_object('city', 'Bengaluru', 'state', 'Karnataka', 'zone', 'P1A-' || ((gs % 9) + 1)::text),
  100000 + gs,
  30,
  CASE WHEN gs % 3 = 0 THEN 'A' WHEN gs % 3 = 1 THEN 'B' ELSE 'C' END,
  'phase1a-buyer-' || gs::text,
  true,
  true,
  now() - ((gs % 180)::text || ' days')::interval,
  now()
FROM generate_series(1, 10000) AS gs
ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  is_active = true,
  buyer_app_enabled = true,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.orders (
  id,
  tenant_id,
  buyer_id,
  placed_by,
  order_number,
  status,
  source,
  subtotal,
  tax_amount,
  total_amount,
  currency,
  placed_at,
  order_date,
  location_id,
  is_buyer_app_order,
  external_ref,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('order:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('buyer:' || (((gs - 1) % 10000) + 1)::text),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  'P1A-SO-' || lpad(gs::text, 6, '0'),
  CASE WHEN gs % 11 = 0 THEN 'cancelled' WHEN gs % 5 = 0 THEN 'delivered' WHEN gs % 3 = 0 THEN 'confirmed' ELSE 'received' END,
  CASE WHEN gs % 2 = 0 THEN 'buyer_app' ELSE 'cockpit_manual' END,
  1000 + (gs % 500),
  (1000 + (gs % 500)) * 0.18,
  (1000 + (gs % 500)) * 1.18,
  'INR',
  now() - ((gs % 120)::text || ' days')::interval,
  (current_date - ((gs % 120)::int)),
  metrics_v2_phase1a.uuid_for('location:' || (((gs - 1) % 9) + 1)::text),
  gs % 2 = 0,
  'phase1a-order-' || gs::text,
  now() - ((gs % 120)::text || ' days')::interval,
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 40000) AS gs
ON CONFLICT (tenant_id, order_number) DO UPDATE SET
  buyer_id = EXCLUDED.buyer_id,
  status = EXCLUDED.status,
  subtotal = EXCLUDED.subtotal,
  tax_amount = EXCLUDED.tax_amount,
  total_amount = EXCLUDED.total_amount,
  location_id = EXCLUDED.location_id,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.estimates (
  id,
  tenant_id,
  buyer_id,
  estimate_number,
  status,
  source,
  subtotal,
  tax_amount,
  total_amount,
  currency,
  estimate_date,
  location_id,
  is_buyer_app_estimate,
  external_ref,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('estimate:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('buyer:' || (((gs - 1) % 10000) + 1)::text),
  'P1A-EST-' || lpad(gs::text, 6, '0'),
  CASE WHEN gs % 7 = 0 THEN 'converted' WHEN gs % 5 = 0 THEN 'expired' WHEN gs % 3 = 0 THEN 'sent' ELSE 'draft' END,
  CASE WHEN gs % 2 = 0 THEN 'buyer_app' ELSE 'seller' END,
  800 + (gs % 400),
  (800 + (gs % 400)) * 0.18,
  (800 + (gs % 400)) * 1.18,
  'INR',
  (current_date - ((gs % 120)::int)),
  metrics_v2_phase1a.uuid_for('location:' || (((gs - 1) % 9) + 1)::text),
  gs % 2 = 0,
  'phase1a-estimate-' || gs::text,
  now() - ((gs % 120)::text || ' days')::interval,
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 30000) AS gs
ON CONFLICT (tenant_id, external_ref) WHERE external_ref IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
  buyer_id = EXCLUDED.buyer_id,
  status = EXCLUDED.status,
  subtotal = EXCLUDED.subtotal,
  tax_amount = EXCLUDED.tax_amount,
  total_amount = EXCLUDED.total_amount,
  location_id = EXCLUDED.location_id,
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.invoices (
  id,
  tenant_id,
  buyer_id,
  order_id,
  invoice_number,
  invoice_date,
  status,
  subtotal,
  tax_amount,
  total_amount,
  outstanding_balance,
  amount_paid,
  due_date,
  location_id,
  is_buyer_app_invoice,
  external_ref,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('invoice:' || gs::text),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('buyer:' || (((gs - 1) % 10000) + 1)::text),
  metrics_v2_phase1a.uuid_for('order:' || (((gs - 1) % 40000) + 1)::text),
  'P1A-INV-' || lpad(gs::text, 6, '0'),
  (current_date - ((gs % 120)::int)),
  CASE WHEN gs % 11 = 0 THEN 'void' WHEN gs % 5 = 0 THEN 'paid' WHEN gs % 3 = 0 THEN 'partially_paid' ELSE 'sent' END,
  1200 + (gs % 600),
  (1200 + (gs % 600)) * 0.18,
  (1200 + (gs % 600)) * 1.18,
  CASE WHEN gs % 5 = 0 OR gs % 11 = 0 THEN 0 ELSE (1200 + (gs % 600)) * 1.18 END,
  CASE WHEN gs % 5 = 0 THEN (1200 + (gs % 600)) * 1.18 ELSE 0 END,
  now() - ((gs % 90)::text || ' days')::interval,
  metrics_v2_phase1a.uuid_for('location:' || (((gs - 1) % 9) + 1)::text),
  gs % 2 = 0,
  'phase1a-invoice-' || gs::text,
  now() - ((gs % 120)::text || ' days')::interval,
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 30000) AS gs
ON CONFLICT (tenant_id, invoice_number) DO UPDATE SET
  buyer_id = EXCLUDED.buyer_id,
  status = EXCLUDED.status,
  subtotal = EXCLUDED.subtotal,
  tax_amount = EXCLUDED.tax_amount,
  total_amount = EXCLUDED.total_amount,
  outstanding_balance = EXCLUDED.outstanding_balance,
  amount_paid = EXCLUDED.amount_paid,
  location_id = EXCLUDED.location_id,
  updated_at = now(),
  deleted_at = NULL;

DELETE FROM app.order_items
WHERE order_id IN (
  SELECT id FROM app.orders WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant') AND external_ref LIKE 'phase1a-order-%'
);

INSERT INTO app.order_items (
  id,
  order_id,
  tenant_product_id,
  qty,
  unit_price,
  tax_rate,
  tax_pct,
  disc_pct,
  line_total,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('order-line:' || gs::text),
  metrics_v2_phase1a.uuid_for('order:' || (((gs - 1) % 40000) + 1)::text),
  metrics_v2_phase1a.uuid_for('tenant-product:' || (((gs - 1) % 500) + 1)::text),
  1 + (gs % 5),
  800 + (gs % 500),
  18,
  18,
  0,
  (1 + (gs % 5)) * (800 + (gs % 500)),
  now(),
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 100000) AS gs;

DELETE FROM app.estimate_items
WHERE estimate_id IN (
  SELECT id FROM app.estimates WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant') AND external_ref LIKE 'phase1a-estimate-%'
);

INSERT INTO app.estimate_items (
  id,
  estimate_id,
  tenant_product_id,
  qty,
  unit_price,
  tax_rate,
  tax_pct,
  disc_pct,
  line_total,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('estimate-line:' || gs::text),
  metrics_v2_phase1a.uuid_for('estimate:' || (((gs - 1) % 30000) + 1)::text),
  metrics_v2_phase1a.uuid_for('tenant-product:' || (((gs - 1) % 500) + 1)::text),
  1 + (gs % 4),
  700 + (gs % 400),
  18,
  18,
  0,
  (1 + (gs % 4)) * (700 + (gs % 400)),
  now(),
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 75000) AS gs;

DELETE FROM app.invoice_items
WHERE invoice_id IN (
  SELECT id FROM app.invoices WHERE tenant_id = metrics_v2_phase1a.uuid_for('tenant') AND external_ref LIKE 'phase1a-invoice-%'
);

INSERT INTO app.invoice_items (
  id,
  invoice_id,
  tenant_product_id,
  qty,
  unit_price,
  tax_rate,
  tax_pct,
  disc_pct,
  line_total,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  metrics_v2_phase1a.uuid_for('invoice-line:' || gs::text),
  metrics_v2_phase1a.uuid_for('invoice:' || (((gs - 1) % 30000) + 1)::text),
  metrics_v2_phase1a.uuid_for('tenant-product:' || (((gs - 1) % 500) + 1)::text),
  1 + (gs % 4),
  900 + (gs % 600),
  18,
  18,
  0,
  (1 + (gs % 4)) * (900 + (gs % 600)),
  now(),
  now(),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  metrics_v2_phase1a.uuid_for('seller-admin'),
  NULL
FROM generate_series(1, 75000) AS gs;

INSERT INTO catalog.integration_types (
  id,
  display_name,
  description,
  auth_schema,
  capabilities,
  connectivity_mode,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'zoho_books',
  'Zoho Books',
  'Phase 1A validation integration type.',
  '{}'::jsonb,
  '{}'::jsonb,
  'cloud',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = true,
  updated_at = now();

INSERT INTO app.tenant_integrations (
  id,
  tenant_id,
  integration_type_id,
  status,
  config,
  external_ref,
  connected_at,
  created_at,
  updated_at
)
VALUES (
  metrics_v2_phase1a.uuid_for('tenant-integration:zoho'),
  metrics_v2_phase1a.uuid_for('tenant'),
  'zoho_books',
  'connected',
  '{}'::jsonb,
  'phase1a-zoho',
  now(),
  now(),
  now()
)
ON CONFLICT (tenant_id, integration_type_id) DO UPDATE SET
  status = 'connected',
  updated_at = now(),
  deleted_at = NULL;

INSERT INTO app.integration_sync_jobs (
  id,
  tenant_id,
  tenant_integration_id,
  job_type,
  status,
  progress,
  summary,
  external_ref,
  started_at,
  completed_at,
  created_at,
  updated_at,
  deleted_at
)
VALUES (
  metrics_v2_phase1a.uuid_for('sync-job:checkpoint'),
  metrics_v2_phase1a.uuid_for('tenant'),
  metrics_v2_phase1a.uuid_for('tenant-integration:zoho'),
  'incremental',
  'completed',
  jsonb_build_object('phase1a_seed_lines', 250000),
  jsonb_build_object('phase1a_seed_hash', 'see harness doctor output'),
  'phase1a-checkpoint',
  now() - interval '10 minutes',
  now(),
  now(),
  now(),
  NULL
)
ON CONFLICT (tenant_id, external_ref) WHERE external_ref IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
  status = 'completed',
  progress = EXCLUDED.progress,
  summary = EXCLUDED.summary,
  updated_at = now(),
  deleted_at = NULL;

SELECT set_config('app.integration_sync_bypass_triggers', 'off', true);

SELECT app.refresh_buyers_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_buyer_current_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_buyer_app_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_products_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_brands_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_categories_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_locations_snapshot(metrics_v2_phase1a.uuid_for('tenant'));
SELECT app.refresh_warehouses_snapshot(metrics_v2_phase1a.uuid_for('tenant'));

COMMIT;
