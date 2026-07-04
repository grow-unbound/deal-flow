-- ============================================================
-- yukti Seed — Electronics & Mobiles Distributor
--
-- Idempotent: safe to re-run. Truncates all app + catalog data
-- and resets the two test auth users on every run.
--
-- Test accounts:
--   Seller → santosh.phani@gmail.com  / Welcome@123  (seller_admin)
--   Buyer  → ksssp.iiith@gmail.com    / Welcome@123  (buyer_admin)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. TRUNCATE — clear all data in dependency-safe order.
--    Listing every table in one TRUNCATE statement lets Postgres
--    resolve FK ordering automatically.
--    catalog.integration_types is excluded (migration-owned reference data).
-- ──────────────────────────────────────────────────────────────

UPDATE app.tenant_brands SET default_cohort_id = NULL WHERE default_cohort_id IS NOT NULL;
UPDATE app.buyers SET default_cohort_id = NULL WHERE default_cohort_id IS NOT NULL;

TRUNCATE
  app.integration_webhook_event_changes,
  app.integration_webhook_events,
  app.integration_webhook_errors,
  app.integration_webhook_echo_guards,
  app.integration_data_flows,
  app.integration_webhooks,
  app.integration_entity_map,
  app.integration_sync_jobs,
  app.integration_oauth_states,
  app.tenant_integrations,
  app.kpi_buyer_app_daily,
  app.kpi_location_daily,
  app.kpi_category_daily,
  app.kpi_brand_daily,
  app.kpi_product_daily,
  app.kpi_tenant_daily,
  app.buyer_app_snapshot,
  app.locations_snapshot,
  app.estimates_snapshot,
  app.invoices_snapshot,
  app.customers_snapshot,
  app.products_snapshot,
  app.categories_snapshot,
  app.brands_snapshot,
  app.reco_bundle_slots,
  app.reco_bundles,
  app.reco_bundle_suggestions,
  app.reco_buyer_profiles,
  app.reco_category_associations,
  app.reco_category_profiles,
  app.reco_product_associations,
  app.reco_product_popularity,
  app.audit_log,
  app.payments,
  app.credit_notes,
  app.catalog_views,
  app.invoice_items,
  app.invoices,
  app.estimate_items,
  app.estimates,
  app.order_items,
  app.orders,
  app.tenant_inventory,
  app.warehouses,
  app.campaign_items,
  app.campaigns,
  app.price_list_assignments,
  app.price_list_items,
  app.price_lists,
  app.cohort_members,
  app.cohorts,
  app.buyer_users,
  app.buyers,
  app.tenant_category_images,
  app.tenant_categories,
  app.tenant_products,
  app.tenant_brands,
  app.tenant_settings,
  app.user_profiles,
  app.tenant_users,
  app.locations,
  app.tenants,
  catalog.embedding_queue,
  catalog.product_images,
  catalog.brand_images,
  catalog.category_images,
  catalog.product_aliases,
  catalog.products,
  catalog.brands,
  catalog.categories,
  catalog.integration_types
RESTART IDENTITY CASCADE;

-- Remove only the two test auth users (leave Supabase system users intact)
DELETE FROM auth.identities
  WHERE user_id IN (
    '550e8400-e29b-41d4-a716-446655440701'::uuid,
    '550e8400-e29b-41d4-a716-446655440702'::uuid
  );

DELETE FROM auth.users
  WHERE id IN (
    '550e8400-e29b-41d4-a716-446655440701'::uuid,
    '550e8400-e29b-41d4-a716-446655440702'::uuid
  );

-- ──────────────────────────────────────────────────────────────
-- 1. Auth users — email + password login
--
--    Three things SQL-inserted auth users need to work with GoTrue:
--      a) encrypted_password = crypt(...) → valid bcrypt hash
--      b) auth.identities row with provider='email' → GoTrue email lookup
--      c) instance_id = '00000000-...' → GoTrue filters by this; NULL = invisible
-- ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  instance_id,
  id, aud, role,
  email, encrypted_password, email_confirmed_at,
  phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
-- Seller: Phani Seller
(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'authenticated', 'authenticated',
  'santosh.phani@gmail.com',
  crypt('Welcome@123', gen_salt('bf')),
  now(),
  '9490744841', now(),
  '{"provider":"email","providers":["email","phone"]}',
  '{"name":"Phani Seller"}',
  now(), now(), '', '', '', ''
),
-- Buyer: Phani Buyer
(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'authenticated', 'authenticated',
  'ksssp.iiith@gmail.com',
  crypt('Welcome@123', gen_salt('bf')),
  now(),
  '8985987350', now(),
  '{"provider":"email","providers":["email","phone"]}',
  '{"name":"Phani Buyer"}',
  now(), now(), '', '', '', ''
);

-- Identity rows — required by GoTrue to resolve email+password login.
-- provider_id = email address for the 'email' provider.
-- identity_data.sub must match the auth.users.id.
INSERT INTO auth.identities (
  id, provider_id, user_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES
(
  gen_random_uuid(),
  'santosh.phani@gmail.com',
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'email',
  jsonb_build_object(
    'sub',            '550e8400-e29b-41d4-a716-446655440701',
    'email',          'santosh.phani@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
),
(
  gen_random_uuid(),
  'ksssp.iiith@gmail.com',
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'email',
  jsonb_build_object(
    'sub',            '550e8400-e29b-41d4-a716-446655440702',
    'email',          'ksssp.iiith@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. Master Catalog — Categories
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.categories (id, name, parent_id, slug, is_public) VALUES
('550e8400-e29b-41d4-a716-446655440001'::uuid, 'Smartphones', NULL, 'smartphones', true),
('550e8400-e29b-41d4-a716-446655440002'::uuid, 'Tablets',     NULL, 'tablets',     true),
('550e8400-e29b-41d4-a716-446655440003'::uuid, 'Accessories', NULL, 'accessories', true),
('550e8400-e29b-41d4-a716-446655440004'::uuid, 'Wearables',   NULL, 'wearables',   true),
('550e8400-e29b-41d4-a716-446655440005'::uuid, 'Audio',       NULL, 'audio',       true);

-- ──────────────────────────────────────────────────────────────
-- 3. Master Catalog — Brands
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.brands (id, name, slug, logo_url, is_public) VALUES
('550e8400-e29b-41d4-a716-446655440101'::uuid, 'Apple',   'apple',   'https://example.com/apple-logo.png',   true),
('550e8400-e29b-41d4-a716-446655440102'::uuid, 'Samsung', 'samsung', 'https://example.com/samsung-logo.png', true),
('550e8400-e29b-41d4-a716-446655440103'::uuid, 'OnePlus', 'oneplus', 'https://example.com/oneplus-logo.png', true),
('550e8400-e29b-41d4-a716-446655440104'::uuid, 'Xiaomi',  'xiaomi',  'https://example.com/xiaomi-logo.png',  true),
('550e8400-e29b-41d4-a716-446655440105'::uuid, 'Google',  'google',  'https://example.com/google-logo.png',  true),
('550e8400-e29b-41d4-a716-446655440106'::uuid, 'Realme',  'realme',  'https://example.com/realme-logo.png',  true);

INSERT INTO catalog.brand_images (brand_id, image_type, r2_medium_key, status, created_by, updated_by)
SELECT
  b.id,
  'logo',
  b.logo_url,
  'approved',
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid
FROM catalog.brands b
WHERE b.is_public = true
  AND b.logo_url IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 4. Master Catalog — Products
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.products (
  id, brand_id, category_id, name, description, master_sku,
  default_uom, gst_rate, is_public
) VALUES
('550e8400-e29b-41d4-a716-446655440201'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'iPhone 15 Pro Max',    'Apple iPhone 15 Pro Max 256GB',     'APL-IP15PM-256', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440202'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'iPhone 15',            'Apple iPhone 15 128GB',             'APL-IP15-128',   'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440203'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'iPad Air 11',          'Apple iPad Air 11-inch',            'APL-IPAD-AIR11', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440204'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Galaxy S24 Ultra',     'Samsung Galaxy S24 Ultra 512GB',    'SAM-S24U-512',   'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440205'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Galaxy A54',           'Samsung Galaxy A54 128GB',          'SAM-A54-128',    'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440206'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'Galaxy Tab S9',        'Samsung Galaxy Tab S9 128GB',       'SAM-TAB-S9',     'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440207'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'OnePlus 12',           'OnePlus 12 256GB',                  'OP-12-256',      'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440208'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'OnePlus 12R',          'OnePlus 12R 128GB',                 'OP-12R-128',     'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440209'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Xiaomi 14 Ultra',      'Xiaomi 14 Ultra 512GB',             'XMI-14U-512',    'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440210'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Xiaomi Redmi Note 13', 'Xiaomi Redmi Note 13 128GB',        'XMI-RN13-128',   'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440211'::uuid, '550e8400-e29b-41d4-a716-446655440105'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Pixel 9 Pro',          'Google Pixel 9 Pro 256GB',          'GOO-P9P-256',    'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440212'::uuid, '550e8400-e29b-41d4-a716-446655440106'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Realme 12 Pro',        'Realme 12 Pro 256GB',               'REA-12P-256',    'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440213'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440003'::uuid, 'iPhone USB-C Cable',   'Apple USB-C to USB-C Cable',        'APL-USB-C',      'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440214'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440003'::uuid, 'Samsung Type-C Cable', 'Samsung Type-C Cable',              'SAM-USB-C',      'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440215'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid, 'Apple Watch Series 9', 'Apple Watch Series 9 45mm',         'APL-WATCH-S9',   'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440216'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid, 'Galaxy Watch6 Classic','Samsung Galaxy Watch6 Classic',     'SAM-GW6C',       'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440217'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440005'::uuid, 'AirPods Pro',          'Apple AirPods Pro (2nd gen)',       'APL-AP-PRO',     'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440218'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440005'::uuid, 'Galaxy Buds3',         'Samsung Galaxy Buds3',              'SAM-GB3',        'unit', 18, true);

-- ──────────────────────────────────────────────────────────────
-- 4a. Master Catalog — Integration Types (Zoho, Tally, Busy)
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.integration_types (
  id,
  display_name,
  description,
  logo_url,
  auth_schema,
  capabilities,
  connectivity_mode,
  is_active
) VALUES
  (
    'zoho_books',
    'Zoho Books',
    'Sync products, customers, orders, estimates, and invoices with Zoho Books.',
    NULL,
    jsonb_build_object(
      'oauth', true,
      'authorize_url', 'https://accounts.zoho.in/oauth/v2/auth',
      'token_url', 'https://accounts.zoho.in/oauth/v2/token',
      'scopes', jsonb_build_array(
        'ZohoBooks.contacts.ALL',
        'ZohoBooks.items.ALL',
        'ZohoBooks.salesorders.ALL',
        'ZohoBooks.invoices.ALL',
        'ZohoBooks.estimates.ALL',
        'ZohoBooks.settings.ALL'
      ),
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'org_id',
          'label', 'Organization ID',
          'type', 'text',
          'required', true,
          'placeholder', 'e.g., 1234567890',
          'help', 'Found in Zoho Books Settings → Organization.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('locations', 'products', 'customers', 'pricelists'),
      'inbound_transactional', jsonb_build_array('estimates', 'orders', 'invoices'),
      'outbound_transactional', jsonb_build_array('orders', 'estimates'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'zoho_inventory',
    'Zoho Inventory',
    'Sync warehouses, products, orders, and shipments with Zoho Inventory.',
    NULL,
    jsonb_build_object(
      'oauth', true,
      'authorize_url', 'https://accounts.zoho.in/oauth/v2/auth',
      'token_url', 'https://accounts.zoho.in/oauth/v2/token',
      'scopes', jsonb_build_array('ZohoInventory.fullaccess.all', 'ZohoInventory.settings.READ'),
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'org_id',
          'label', 'Organization ID',
          'type', 'text',
          'required', true,
          'placeholder', 'e.g., 1234567890',
          'help', 'Found in Zoho Inventory Settings → Organization.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('locations', 'products', 'customers'),
      'inbound_transactional', jsonb_build_array('orders'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'tally_prime',
    'Tally Prime',
    'Sync products and orders with Tally Prime via the Tally Data Service.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'api_key',
          'label', 'API Key',
          'type', 'password',
          'required', true,
          'help', 'Obtain from Tally Data Service portal.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('products'),
      'inbound_transactional', jsonb_build_array('orders'),
      'outbound_transactional', jsonb_build_array('invoices')
    ),
    'local',
    false
  ),
  (
    'busy',
    'Busy',
    'Sync products and orders with Busy ERP.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'api_key',
          'label', 'API Key',
          'type', 'password',
          'required', true,
          'help', 'Obtain from Busy Settings → API Keys.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('products'),
      'inbound_transactional', jsonb_build_array('orders')
    ),
    'cloud',
    false
  );

-- ──────────────────────────────────────────────────────────────
-- 5. Sample tenant (TechWave Electronics distributor)
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.tenants (id, slug, business_name, subdomain, gstin, primary_state, plan)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'techwave', 'TechWave Electronics', 'techwave',
  '18AACCT1234H1Z0', 'KA', 'starter'
);

-- Link Phani Seller as seller_admin
INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'seller_admin', true, now()
);

INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ),
  '550e8400-e29b-41d4-a716-446655440701'::uuid
);

INSERT INTO app.user_profiles (user_id, created_by, updated_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440701'::uuid, '550e8400-e29b-41d4-a716-446655440701'::uuid, '550e8400-e29b-41d4-a716-446655440701'::uuid),
  ('550e8400-e29b-41d4-a716-446655440702'::uuid, '550e8400-e29b-41d4-a716-446655440701'::uuid, '550e8400-e29b-41d4-a716-446655440701'::uuid);

-- ──────────────────────────────────────────────────────────────
-- 6. Tenant brands — assign all master brands to TechWave
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
VALUES
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440105'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440106'::uuid, true);

INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
SELECT
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  c.id,
  c.name,
  c.slug,
  'approved',
  true,
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid
FROM catalog.categories c
WHERE c.is_public = true;

-- ──────────────────────────────────────────────────────────────
-- 7. Locations (transaction-level — used on estimates/orders/invoices)
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default) VALUES
(
  '550e8400-e29b-41d4-a716-446655440801'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'Main Warehouse',
  '{"line1":"42 Industrial Area","city":"Bangalore","state":"KA","pincode":"560058"}',
  12.9716000, 77.5946000, true
),
(
  '550e8400-e29b-41d4-a716-446655440802'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'Branch Store',
  '{"line1":"18 Electronics Hub","city":"Hyderabad","state":"TS","pincode":"500016"}',
  17.3850000, 78.4867000, false
);

-- ──────────────────────────────────────────────────────────────
-- 7a. Warehouses (physical stock locations — used on tenant_inventory)
--     Each warehouse links back to its canonical location.
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng) VALUES
(
  '550e8400-e29b-41d4-a716-446655440811'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  '550e8400-e29b-41d4-a716-446655440801'::uuid,
  'Main Warehouse',
  '{"line1":"42 Industrial Area","city":"Bangalore","state":"KA","pincode":"560058"}',
  'active', true, '[]', 12.9716000, 77.5946000
),
(
  '550e8400-e29b-41d4-a716-446655440812'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  '550e8400-e29b-41d4-a716-446655440802'::uuid,
  'Branch Store',
  '{"line1":"18 Electronics Hub","city":"Hyderabad","state":"TS","pincode":"500016"}',
  'active', false, '[]', 17.3850000, 78.4867000
);

-- ──────────────────────────────────────────────────────────────
-- 8. Tenant products — price matrix
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.tenant_products (
  tenant_id, tenant_brand_id, master_product_id, internal_sku,
  cost_price, base_selling_price, is_active
)
SELECT
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  tb.id,
  p.id,
  p.master_sku,
  CASE
    WHEN p.master_sku = 'APL-IP15PM-256' THEN 130000
    WHEN p.master_sku = 'APL-IP15-128'   THEN 70000
    WHEN p.master_sku = 'APL-IPAD-AIR11' THEN 65000
    WHEN p.master_sku = 'SAM-S24U-512'   THEN 120000
    WHEN p.master_sku = 'SAM-A54-128'    THEN 32000
    WHEN p.master_sku = 'SAM-TAB-S9'     THEN 45000
    WHEN p.master_sku = 'OP-12-256'      THEN 48000
    WHEN p.master_sku = 'OP-12R-128'     THEN 28000
    WHEN p.master_sku = 'XMI-14U-512'    THEN 55000
    WHEN p.master_sku = 'XMI-RN13-128'   THEN 18000
    WHEN p.master_sku = 'GOO-P9P-256'    THEN 95000
    WHEN p.master_sku = 'REA-12P-256'    THEN 28000
    WHEN p.master_sku IN ('APL-USB-C','SAM-USB-C') THEN 600
    WHEN p.master_sku = 'APL-WATCH-S9'   THEN 35000
    WHEN p.master_sku = 'SAM-GW6C'       THEN 22000
    WHEN p.master_sku = 'APL-AP-PRO'     THEN 26000
    WHEN p.master_sku = 'SAM-GB3'        THEN 12000
    ELSE 10000
  END,
  CASE
    WHEN p.master_sku = 'APL-IP15PM-256' THEN 165000
    WHEN p.master_sku = 'APL-IP15-128'   THEN 85000
    WHEN p.master_sku = 'APL-IPAD-AIR11' THEN 80000
    WHEN p.master_sku = 'SAM-S24U-512'   THEN 150000
    WHEN p.master_sku = 'SAM-A54-128'    THEN 42000
    WHEN p.master_sku = 'SAM-TAB-S9'     THEN 58000
    WHEN p.master_sku = 'OP-12-256'      THEN 60000
    WHEN p.master_sku = 'OP-12R-128'     THEN 35000
    WHEN p.master_sku = 'XMI-14U-512'    THEN 68000
    WHEN p.master_sku = 'XMI-RN13-128'   THEN 24000
    WHEN p.master_sku = 'GOO-P9P-256'    THEN 119000
    WHEN p.master_sku = 'REA-12P-256'    THEN 36000
    WHEN p.master_sku IN ('APL-USB-C','SAM-USB-C') THEN 1000
    WHEN p.master_sku = 'APL-WATCH-S9'   THEN 45000
    WHEN p.master_sku = 'SAM-GW6C'       THEN 28000
    WHEN p.master_sku = 'APL-AP-PRO'     THEN 32000
    WHEN p.master_sku = 'SAM-GB3'        THEN 16000
    ELSE 15000
  END,
  true
FROM catalog.products p
JOIN app.tenant_brands tb
  ON tb.master_brand_id = p.brand_id
  AND tb.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
WHERE p.is_public = true;

-- ──────────────────────────────────────────────────────────────
-- 9. Sample buyers
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.buyers (
  id, tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active
) VALUES
('550e8400-e29b-41d4-a716-446655440601'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Kumar Electronics',   'Rajesh Kumar', '9123456789', 'rajesh@kumarelectronics.com',
 '36AABCT5678H1Z5', '{"city":"Hyderabad","state":"TS"}', 'A', true),
('550e8400-e29b-41d4-a716-446655440602'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Singh Mobile Store',  'Priya Singh',  '9876541234', 'priya@singhmobilestore.com',
 '07AABDM1234H1Z2', '{"city":"Delhi","state":"DL"}',     'B', true),
('550e8400-e29b-41d4-a716-446655440603'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Patel Tech Hub',      'Amit Patel',   '9123454567', 'amit@pateltech.com',
 '27AABDU5432H1Z8', '{"city":"Mumbai","state":"MH"}',    'C', true),
('550e8400-e29b-41d4-a716-446655440604'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Phani Mobiles',       'Phani Buyer',  '8985987350',  'ksssp.iiith@gmail.com',
 NULL,              '{"city":"Hyderabad","state":"TS"}',  'C', true);

-- Link Phani Buyer auth user → Phani Mobiles buyer record
INSERT INTO app.buyer_users (buyer_id, user_id, role, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440604'::uuid,
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'buyer_admin', true
);

-- ──────────────────────────────────────────────────────────────
-- 10. Inventory — split across both locations
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.tenant_inventory (
  tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point
)
SELECT
  tp.id,
  '550e8400-e29b-41d4-a716-446655440811'::uuid,
  CASE p.master_sku
    WHEN 'APL-IP15PM-256' THEN 15  WHEN 'SAM-S24U-512'  THEN 15  WHEN 'GOO-P9P-256'    THEN 15
    WHEN 'APL-IP15-128'   THEN 30  WHEN 'SAM-A54-128'   THEN 30  WHEN 'OP-12-256'       THEN 30  WHEN 'XMI-14U-512'    THEN 30
    WHEN 'APL-IPAD-AIR11' THEN 10  WHEN 'SAM-TAB-S9'   THEN 10
    WHEN 'APL-USB-C'      THEN 200 WHEN 'SAM-USB-C'     THEN 200
    WHEN 'APL-WATCH-S9'   THEN 20  WHEN 'SAM-GW6C'      THEN 20
    WHEN 'APL-AP-PRO'     THEN 25  WHEN 'SAM-GB3'        THEN 25
    ELSE 20
  END,
  0,
  CASE WHEN p.master_sku IN ('APL-USB-C','SAM-USB-C') THEN 50 ELSE 5 END
FROM app.tenant_products tp
JOIN catalog.products p ON p.id = tp.master_product_id
WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;

INSERT INTO app.tenant_inventory (
  tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point
)
SELECT
  tp.id,
  '550e8400-e29b-41d4-a716-446655440812'::uuid,
  CASE p.master_sku
    WHEN 'APL-IP15PM-256' THEN 5   WHEN 'SAM-S24U-512'   THEN 5   WHEN 'GOO-P9P-256'   THEN 5
    WHEN 'APL-IP15-128'   THEN 12  WHEN 'SAM-A54-128'    THEN 12  WHEN 'OP-12-256'      THEN 12  WHEN 'XMI-14U-512'   THEN 12
    WHEN 'OP-12R-128'     THEN 20  WHEN 'XMI-RN13-128'   THEN 20  WHEN 'REA-12P-256'    THEN 20
    WHEN 'APL-IPAD-AIR11' THEN 4   WHEN 'SAM-TAB-S9'     THEN 4
    WHEN 'APL-USB-C'      THEN 80  WHEN 'SAM-USB-C'      THEN 80
    WHEN 'APL-WATCH-S9'   THEN 8   WHEN 'SAM-GW6C'       THEN 8
    WHEN 'APL-AP-PRO'     THEN 10  WHEN 'SAM-GB3'        THEN 10
    ELSE 8
  END,
  0,
  CASE WHEN p.master_sku IN ('APL-USB-C','SAM-USB-C') THEN 20 ELSE 3 END
FROM app.tenant_products tp
JOIN catalog.products p ON p.id = tp.master_product_id
WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;

-- ──────────────────────────────────────────────────────────────
-- 11. Audit log bootstrap entry
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.audit_log (tenant_id, entity_type, entity_id, action, diff)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'tenant', '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'create', '{"status":"created"}'
);

-- ──────────────────────────────────────────────────────────────
-- 12. Snapshots + daily KPI tables (derived from base seed)
-- ──────────────────────────────────────────────────────────────

SELECT app.post_sync_rebuild('550e8400-e29b-41d4-a716-446655440501'::uuid, 1);

-- ──────────────────────────────────────────────────────────────
-- Verification summary
-- ──────────────────────────────────────────────────────────────

SELECT 'auth_users'    AS table_name, COUNT(*) AS rows FROM auth.users    WHERE id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid)
UNION ALL
SELECT 'auth_identities',              COUNT(*)         FROM auth.identities WHERE user_id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid)
UNION ALL
SELECT 'catalog_brands',               COUNT(*)         FROM catalog.brands   WHERE is_public = true
UNION ALL
SELECT 'catalog_products',             COUNT(*)         FROM catalog.products WHERE is_public = true
UNION ALL
SELECT 'tenants',                      COUNT(*)         FROM app.tenants       WHERE slug = 'techwave'
UNION ALL
SELECT 'tenant_users',                 COUNT(*)         FROM app.tenant_users  WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'buyers',                       COUNT(*)         FROM app.buyers        WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'tenant_products',              COUNT(*)         FROM app.tenant_products WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'inventory_rows',               COUNT(*)         FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'estimates',                    COUNT(*)         FROM app.estimates        WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid AND deleted_at IS NULL
UNION ALL
SELECT 'invoices',                     COUNT(*)         FROM app.invoices         WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid AND deleted_at IS NULL
UNION ALL
SELECT 'tenant_settings',              COUNT(*)         FROM app.tenant_settings  WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'tenant_categories',            COUNT(*)         FROM app.tenant_categories WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid AND deleted_at IS NULL
UNION ALL
SELECT 'user_profiles',                COUNT(*)         FROM app.user_profiles    WHERE user_id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid) AND deleted_at IS NULL
UNION ALL
SELECT 'products_snapshot',            COUNT(*)         FROM app.products_snapshot WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'customers_snapshot',           COUNT(*)         FROM app.customers_snapshot WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
UNION ALL
SELECT 'buyer_app_snapshot',           COUNT(*)         FROM app.buyer_app_snapshot WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
ORDER BY table_name;
