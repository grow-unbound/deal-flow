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

TRUNCATE
  app.whatsapp_credit_transactions,
  app.whatsapp_send_queue,
  app.whatsapp_messages,
  app.whatsapp_broadcasts,
  app.whatsapp_platform_config,
  app.whatsapp_templates,
  app.whatsapp_rate_card,
  app.whatsapp_credit_pricing,
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

  app.kpi_buyers_daily,
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
  app.campaign_views,
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
  '9441479686', now(),
  '{"provider":"phone","providers":["email","phone"]}',
  '{"name":"Phani Seller","phone":"9441479686"}',
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
  '9440369497', now(),
  '{"provider":"phone","providers":["email","phone"]}',
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

-- Phone identities — required for WhatsApp OTP login (GoTrue phone provider).
-- provider_id must be E.164. identity_data.phone must match.
INSERT INTO auth.identities (
  id, provider_id, user_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES
(
  gen_random_uuid(),
  '9441479686',
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'phone',
  jsonb_build_object(
    'sub',           '550e8400-e29b-41d4-a716-446655440701',
    'phone',         '9441479686',
    'phone_verified', true
  ),
  now(), now(), now()
),
(
  gen_random_uuid(),
  '9440369497',
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'phone',
  jsonb_build_object(
    'sub',           '550e8400-e29b-41d4-a716-446655440702',
    'phone',         '9440369497',
    'phone_verified', true
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

-- Platform tenant — owns OTP billing wallet and platform-managed WhatsApp templates.
-- UUID must match WHATSAPP_PLATFORM_TENANT_ID env var.
INSERT INTO app.tenants (id, slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_credits_balance)
VALUES (
  '550e8400-e29b-41d4-a716-446655440500'::uuid,
  'platform-tenant', 'Platform Tenant', 'platform',
  NULL, 'KA', 'scale', 99999
);

INSERT INTO app.tenants (id, slug, business_name, subdomain, gstin, primary_state, plan)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'techwave', 'TechWave Electronics', 'techwave',
  '18AACCT1234H1Z0', 'KA', 'starter'
);

-- Link Phani Seller as seller_admin
INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'seller_admin', true, now(), '9441479686'
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
  id, tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled
) VALUES
('550e8400-e29b-41d4-a716-446655440601'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Kumar Electronics',   'Rajesh Kumar', '9123456789', 'rajesh@kumarelectronics.com',
 '36AABCT5678H1Z5', '{"city":"Hyderabad","state":"TS"}', 'A', true, true),
('550e8400-e29b-41d4-a716-446655440602'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Singh Mobile Store',  'Priya Singh',  '9876541234', 'priya@singhmobilestore.com',
 '07AABDM1234H1Z2', '{"city":"Delhi","state":"DL"}',     'B', true, true),
('550e8400-e29b-41d4-a716-446655440603'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Patel Tech Hub',      'Amit Patel',   '9123454567', 'amit@pateltech.com',
 '27AABDU5432H1Z8', '{"city":"Mumbai","state":"MH"}',    'C', true, true),
('550e8400-e29b-41d4-a716-446655440604'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid,
 'Phani Mobiles',       'Phani Buyer',  '9440369497',  'ksssp.iiith@gmail.com',
 NULL,              '{"city":"Hyderabad","state":"TS"}',  'C', true, true);

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
-- 12. WhatsApp config — rate card, credit pricing, platform templates
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.whatsapp_credit_pricing (credit_price_inr)
VALUES (0.25);

INSERT INTO app.whatsapp_rate_card (meta_category, meta_cost_inr, credits_per_message)
VALUES
  ('utility',        0.1150, 1),
  ('authentication', 0.1150, 1),
  ('marketing',      0.8631, 6);

-- Platform-managed transactional templates (already approved with Meta).
-- tenant_id = NULL means these are global/platform templates.
INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, display_name, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
) VALUES
(
  NULL, 'login_otp', 'Login OTP', 'authentication', 'otp_login', 'en_US',
  E'OTP Code: {{1}}. This is your OTP code for {{2}}. For your security, do not share this code.\n\nIf you have any concerns or questions, contact us at {{3}}.',
  '[{"key":"otp","description":"OTP code"},{"key":"product_name","description":"Product/app name"},{"key":"support_number","description":"Support contact number"}]'::jsonb,
  NULL, NULL, 'Powered by Yukti', NULL,
  'approved', true, false
),
(
  NULL, 'invite_user_seller', 'Invite seller user', 'utility', 'updates', 'en',
  E'Hi {{seller_user}},\n\n{{seller_name}} has invited you to join Yukti.\n\nTo activate your account, tap the button below. You will verify your phone number and then create a password for alternate email login.\n\nIf you were not expecting this invite, please ignore this message.',
  '[{"key":"seller_user","description":"Teammate first name or full name"},{"key":"seller_name","description":"Tenant or business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/activate"}'::jsonb,
  '{"format":"text","text":"You''ve been invited to Yukti"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/activate"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'order_received_seller', 'Order received', 'utility', 'updates', 'en_IN',
  E'Hi {{seller_location}} team,\n\nThere is a new order for your location. Here are the details.\n\nCustomer Name: *{{buyer_name}}*\nPhone Number: {{buyer_phone_number}}\nOrder Number: {{order_number}}\nTotal Amount: *₹{{total_amount}} ({{item_count}} items)*\n\nPlease contact the buyer in the next {{eta}} hours.',
  '[{"key":"seller_location","description":"Seller location/warehouse name"},{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"buyer_phone_number","description":"Buyer phone number"},{"key":"order_number","description":"Order reference number"},{"key":"total_amount","description":"Order total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"eta","description":"Response time commitment in hours"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/sales-orders/{{1}}","variable_source":"order_id"}'::jsonb,
  '{"format":"text","text":"New Order received"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/sales-orders/{{1}}","variable_source":"order_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'order_received_buyer', 'Order submitted', 'utility', 'updates', 'en_IN',
  E'Hi {{buyer_name}},\n\nWe received your order for *{{item_count}} items*. Here are your details.\n\nOrder Number: *{{order_number}}*\nTotal Amount: *₹{{total_amount}}*\n\nOur {{seller_name}} team will contact you in {{eta}} hours.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"item_count","description":"Number of line items"},{"key":"order_number","description":"Order reference number"},{"key":"total_amount","description":"Order total in INR"},{"key":"seller_name","description":"Seller business name"},{"key":"eta","description":"Expected response time in hours"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/sales-orders/{{1}}","variable_source":"order_id"}'::jsonb,
  '{"format":"text","text":"Order received"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/sales-orders/{{1}}","variable_source":"order_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'request_received_seller', 'Estimate received', 'utility', 'updates', 'en',
  E'Hi {{seller_location}} team,\n\nThere is a new request for your location. Here are the details.\n\nCustomer Name: *{{buyer_name}}*\nPhone Number: {{buyer_phone_number}}\nEstimate Number: {{request_number}}\nTotal Amount: *₹{{total_amount}} ({{item_count}} items)*\n\nPlease contact the buyer in the next {{eta}} hours.',
  '[{"key":"seller_location","description":"Seller location/warehouse name"},{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"buyer_phone_number","description":"Buyer phone number"},{"key":"request_number","description":"Estimate/request reference number"},{"key":"total_amount","description":"Request total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"eta","description":"Response time commitment in hours"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/estimates/{{1}}","variable_source":"estimate_id"}'::jsonb,
  '{"format":"text","text":"New request received"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/estimates/{{1}}","variable_source":"estimate_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'request_received_buyer', 'Estimate sent', 'utility', 'updates', 'en',
  E'Hi *{{buyer_name}}*,\n\nWe received your request for *{{item_count}} items*. Here are your details.\n\nRequest Number: *{{estimate_number}}*\nTotal Amount: *₹{{total_amount}}*\n\nOur *{{seller_name}}* team will contact you in {{eta}} hours.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"item_count","description":"Number of line items"},{"key":"estimate_number","description":"Estimate/request reference number"},{"key":"total_amount","description":"Request total in INR"},{"key":"seller_name","description":"Seller business name and location"},{"key":"eta","description":"Expected response time in hours"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}'::jsonb,
  '{"format":"text","text":"Request received"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'request_update_buyer', 'Send estimate', 'utility', 'updates', 'en',
  E'Hi {{buyer_name}},\n\nHere is your enquiry {{request_number}} for ₹{{total_amount}} ({{item_count}} items).\n\nContact {{seller_name}} ({{seller_phone_number}}) to confirm the order at these prices.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"request_number","description":"Estimate/request reference number"},{"key":"total_amount","description":"Request total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'invoice_update_buyer', 'Invoice sent', 'utility', 'updates', 'en',
  E'Hi {{buyer_name}},\n\nHere is invoice {{invoice_number}} for your review.\n\nAmount: ₹{{total_amount}} ({{item_count}} items)\n\nContact {{seller_name}} ({{seller_phone_number}}) for next steps.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"invoice_number","description":"Invoice reference number"},{"key":"total_amount","description":"Invoice total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}]'::jsonb,
  'approved', true, false
),
(
  NULL, 'buyer_payment_reminder', 'Payment reminder', 'utility', 'updates', 'en',
  E'Hi {{buyer_name}},\n\nThis is a payment reminder from *{{seller_name}}* on {{due_invoice_count}} invoices.\n\nAmount Due: *₹{{outstanding_amount}} ({{due_status}})*\nContact: {{seller_phone_number}}\n\nCheck your dues and pay at the earliest.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"}, {"key":"seller_name","description":"Seller business name"}, {"key":"due_invoice_count","description":"Number of due invoices"},{"key":"outstanding_amount","description":"Outstanding amount in INR"},{"key":"due_status","description":"Due in X days or Overdue by X days status"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/orders"}'::jsonb,
  '{"format":"text","text":"Payment reminder"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/orders"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'campaign_published_buyer', 'Campaign announcement', 'utility', 'campaigns', 'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} has a new campaign live - *{{campaign_title}}*.\n\n*{{buyer_note}}*\nContact: {{seller_phone_number}} for more details.\n\nCheck it out and order in the app.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"}, {"key":"seller_name","description":"Seller business name"}, {"key":"campaign_title","description":"Campaign title"}, {"key":"buyer_note","description":"Seller note to buyers about the campaign"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '[{"type":"url", "index":"0", "url_template":"https://app.useyukti.in/catalog?share_toke={{1}}","variable_source":"share_token"}, {"type":"QUICK_REPLY","index":"1","text":"Opt out"}]'::jsonb,
  '{"format":"text","text":"New promotion live"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/catalog?share_toke={{1}}","variable_source":"share_token"}, {"type":"QUICK_REPLY","index":"1","text":"Opt out"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'beat_route_buyer', 'Agent visit reminder', 'utility', 'engagement', 'en',
  E'Hi {{buyer_name}},\n\nOur team from {{seller_name}} will be visiting you soon.\n\nVisit window: {{visit_date}} {{visit_window}}\nContact: {{seller_phone_number}}\n\nKeep your payments and any new stock requirements ready. \nYou can also place orders anytime in the app.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"},{"key":"visit_date","description":"Visit date, e.g. 26 July"},{"key":"visit_window","description":"Visit time window, e.g. 3:30PM-5:30PM"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'new_stock_buyer', 'New stock arrived', 'marketing', 'campaigns', 'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} just added new stock.\n\n{{buyer_note}}\n\nCheck out latest arrivals and place your order in the app before it''s gone.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"},{"key":"buyer_note","description":"Seller note to the buyer from campaigns.message"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'buyer_app_dormant', 'App order reminder', 'marketing', 'buyer_app', 'en',
  E'Hi {{buyer_name}},\n\nYou''re all set up on the {{seller_name}}''s catalog app.\n\nPlace your first order whenever you''re ready. Until then, explore their products and review prices.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'buyer_app_adoption', 'App login reminder', 'marketing', 'buyer_app', 'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} set up the catalog app for you, but it looks like you haven''t logged in yet.\n\nYou can explore their entire catalog, review prices, and place orders easily. It only takes a minute to get started.\n\nTap below to log in.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved', true, true
),
(
  NULL, 'buyer_app_enabled', 'Buyer app enabled', 'marketing', 'buyer_app', 'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} has enabled the catalog app for you.\n\nYou can now explore their latest stock, check prices, and place orders anytime.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  '{"format":"text","text":"Catalog enabled for you"}'::jsonb, 'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved', true, true
)
ON CONFLICT (tenant_id, meta_template_name) DO UPDATE SET
  display_name            = EXCLUDED.display_name,
  approval_status       = EXCLUDED.approval_status,
  is_platform_managed   = EXCLUDED.is_platform_managed,
  use_case              = EXCLUDED.use_case,
  meta_category         = EXCLUDED.meta_category,
  locale                = EXCLUDED.locale,
  body                  = EXCLUDED.body,
  variables             = EXCLUDED.variables,
  button_config         = EXCLUDED.button_config,
  header_config         = EXCLUDED.header_config,
  footer_text           = EXCLUDED.footer_text,
  buttons_config        = EXCLUDED.buttons_config,
  is_broadcast_template = EXCLUDED.is_broadcast_template,
  updated_at            = now();

-- Set WhatsApp consent for test buyer (Phani Mobiles) so campaign audience RPCs include them.
UPDATE app.buyers
SET whatsapp_consent_at = now(), whatsapp_consent_method = 'implicit_first_login'
WHERE id = '550e8400-e29b-41d4-a716-446655440604'::uuid;

-- ──────────────────────────────────────────────────────────────
-- 13. Snapshots + daily KPI tables (derived from base seed)
-- ──────────────────────────────────────────────────────────────

SELECT app.post_sync_rebuild('550e8400-e29b-41d4-a716-446655440501'::uuid, 1);

-- ──────────────────────────────────────────────────────────────
-- Verification summary
-- ──────────────────────────────────────────────────────────────

SELECT 'auth_users'    AS table_name, COUNT(*) AS rows FROM auth.users    WHERE id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid)
UNION ALL
SELECT 'auth_identities',              COUNT(*)         FROM auth.identities WHERE user_id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid)
UNION ALL
SELECT 'auth_phone_identities',        COUNT(*)         FROM auth.identities WHERE provider = 'phone' AND user_id IN ('550e8400-e29b-41d4-a716-446655440701'::uuid,'550e8400-e29b-41d4-a716-446655440702'::uuid)
UNION ALL
SELECT 'platform_tenant',              COUNT(*)         FROM app.tenants WHERE slug = 'platform-tenant'
UNION ALL
SELECT 'whatsapp_rate_card',           COUNT(*)         FROM app.whatsapp_rate_card
UNION ALL
SELECT 'whatsapp_credit_pricing',      COUNT(*)         FROM app.whatsapp_credit_pricing
UNION ALL
SELECT 'whatsapp_templates',           COUNT(*)         FROM app.whatsapp_templates WHERE approval_status = 'approved'
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
SELECT 'buyer_app_snapshot',           COUNT(*)         FROM app.buyer_app_snapshot WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
ORDER BY table_name;
