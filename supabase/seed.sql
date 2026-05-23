-- Seed data for DealFlow: Electronics & Mobiles Distributor
-- Sample tenant for testing

-- 0. Auth users (phone-based, no password — OTP login)
-- Seller: Phani Seller (+919490744841)
-- Buyer:  Phani Buyer  (+918985987350)
INSERT INTO auth.users (
  id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  encrypted_password, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'authenticated', 'authenticated',
  '+919490744841', now(),
  '{"provider":"phone","providers":["phone"]}',
  '{"name":"Phani Seller"}',
  '', now(), now(), '', '', '', ''
),
(
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'authenticated', 'authenticated',
  '+918985987350', now(),
  '{"provider":"phone","providers":["phone"]}',
  '{"name":"Phani Buyer"}',
  '', now(), now(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- 1. Master Catalog - Categories
INSERT INTO catalog.categories (id, name, parent_id, slug, is_public) VALUES
('550e8400-e29b-41d4-a716-446655440001'::uuid, 'Smartphones', NULL, 'smartphones', true),
('550e8400-e29b-41d4-a716-446655440002'::uuid, 'Tablets', NULL, 'tablets', true),
('550e8400-e29b-41d4-a716-446655440003'::uuid, 'Accessories', NULL, 'accessories', true),
('550e8400-e29b-41d4-a716-446655440004'::uuid, 'Wearables', NULL, 'wearables', true),
('550e8400-e29b-41d4-a716-446655440005'::uuid, 'Audio', NULL, 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Master Catalog - Brands
INSERT INTO catalog.brands (id, name, slug, logo_url, is_public) VALUES
('550e8400-e29b-41d4-a716-446655440101'::uuid, 'Apple', 'apple', 'https://example.com/apple-logo.png', true),
('550e8400-e29b-41d4-a716-446655440102'::uuid, 'Samsung', 'samsung', 'https://example.com/samsung-logo.png', true),
('550e8400-e29b-41d4-a716-446655440103'::uuid, 'OnePlus', 'oneplus', 'https://example.com/oneplus-logo.png', true),
('550e8400-e29b-41d4-a716-446655440104'::uuid, 'Xiaomi', 'xiaomi', 'https://example.com/xiaomi-logo.png', true),
('550e8400-e29b-41d4-a716-446655440105'::uuid, 'Google', 'google', 'https://example.com/google-logo.png', true),
('550e8400-e29b-41d4-a716-446655440106'::uuid, 'Realme', 'realme', 'https://example.com/realme-logo.png', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Master Catalog - Products
INSERT INTO catalog.products (
  id, brand_id, category_id, name, description, master_sku, default_uom, gst_rate, is_public
) VALUES
('550e8400-e29b-41d4-a716-446655440201'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'iPhone 15 Pro Max', 'Apple iPhone 15 Pro Max 256GB', 'APL-IP15PM-256', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440202'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'iPhone 15', 'Apple iPhone 15 128GB', 'APL-IP15-128', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440203'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'iPad Air 11', 'Apple iPad Air 11-inch', 'APL-IPAD-AIR11', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440204'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Galaxy S24 Ultra', 'Samsung Galaxy S24 Ultra 512GB', 'SAM-S24U-512', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440205'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Galaxy A54', 'Samsung Galaxy A54 128GB', 'SAM-A54-128', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440206'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid, 'Galaxy Tab S9', 'Samsung Galaxy Tab S9 128GB', 'SAM-TAB-S9', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440207'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'OnePlus 12', 'OnePlus 12 256GB', 'OP-12-256', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440208'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'OnePlus 12R', 'OnePlus 12R 128GB', 'OP-12R-128', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440209'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Xiaomi 14 Ultra', 'Xiaomi 14 Ultra 512GB', 'XMI-14U-512', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440210'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Xiaomi Redmi Note 13', 'Xiaomi Redmi Note 13 128GB', 'XMI-RN13-128', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440211'::uuid, '550e8400-e29b-41d4-a716-446655440105'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Pixel 9 Pro', 'Google Pixel 9 Pro 256GB', 'GOO-P9P-256', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440212'::uuid, '550e8400-e29b-41d4-a716-446655440106'::uuid, '550e8400-e29b-41d4-a716-446655440001'::uuid, 'Realme 12 Pro', 'Realme 12 Pro 256GB', 'REA-12P-256', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440213'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440003'::uuid, 'iPhone USB-C Cable', 'Apple USB-C to USB-C Cable', 'APL-USB-C', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440214'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440003'::uuid, 'Samsung Type-C Cable', 'Samsung Type-C Cable', 'SAM-USB-C', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440215'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid, 'Apple Watch Series 9', 'Apple Watch Series 9 45mm', 'APL-WATCH-S9', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440216'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid, 'Galaxy Watch6 Classic', 'Samsung Galaxy Watch6 Classic', 'SAM-GW6C', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440217'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, '550e8400-e29b-41d4-a716-446655440005'::uuid, 'AirPods Pro', 'Apple AirPods Pro (2nd gen)', 'APL-AP-PRO', 'unit', 18, true),
('550e8400-e29b-41d4-a716-446655440218'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, '550e8400-e29b-41d4-a716-446655440005'::uuid, 'Galaxy Buds3', 'Samsung Galaxy Buds3', 'SAM-GB3', 'unit', 18, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Create sample tenant (Electronics distributor)
-- Note: In production, tenants are created via signup. This is for testing.
INSERT INTO app.tenants (
  id, slug, business_name, subdomain, gstin, primary_state, plan
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'techwave',
  'TechWave Electronics',
  'techwave',
  '18AACCT1234H1Z0',
  'KA',
  'starter'
)
ON CONFLICT (id) DO NOTHING;

-- 4b. Tenant users — link Phani Seller as seller_admin
INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  '550e8400-e29b-41d4-a716-446655440701'::uuid,
  'seller_admin',
  true,
  now()
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 5. Assign all master catalog brands to tenant
INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
VALUES
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440101'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440102'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440103'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440104'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440105'::uuid, true),
('550e8400-e29b-41d4-a716-446655440501'::uuid, '550e8400-e29b-41d4-a716-446655440106'::uuid, true)
ON CONFLICT (tenant_id, master_brand_id) DO NOTHING;

-- 5b. Locations
INSERT INTO app.locations (id, tenant_id, name, address, is_default) VALUES
(
  '550e8400-e29b-41d4-a716-446655440801'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'Main Warehouse',
  '{"line1": "42 Industrial Area", "city": "Bangalore", "state": "KA", "pincode": "560058"}',
  true
),
(
  '550e8400-e29b-41d4-a716-446655440802'::uuid,
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'Branch Store',
  '{"line1": "18 Electronics Hub", "city": "Hyderabad", "state": "TS", "pincode": "500016"}',
  false
)
ON CONFLICT (id) DO NOTHING;

-- 6. Assign all products to tenant
INSERT INTO app.tenant_products (
  tenant_id, tenant_brand_id, master_product_id, internal_sku, cost_price, base_selling_price,
  is_active
)
SELECT
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  tb.id,
  p.id,
  p.master_sku,
  CASE
    WHEN p.name LIKE '%iPhone%Pro%Max%' THEN 130000
    WHEN p.name LIKE '%iPhone 15' THEN 70000
    WHEN p.name LIKE '%iPad%' THEN 65000
    WHEN p.name LIKE '%Galaxy S24%' THEN 120000
    WHEN p.name LIKE '%Galaxy A54%' THEN 32000
    WHEN p.name LIKE '%Galaxy Tab%' THEN 45000
    WHEN p.name LIKE '%OnePlus 12' AND p.name NOT LIKE '%12R%' THEN 48000
    WHEN p.name LIKE '%OnePlus 12R%' THEN 28000
    WHEN p.name LIKE '%Xiaomi 14%' THEN 55000
    WHEN p.name LIKE '%Xiaomi Redmi%' THEN 18000
    WHEN p.name LIKE '%Pixel 9%' THEN 95000
    WHEN p.name LIKE '%Realme%' THEN 28000
    WHEN p.name LIKE '%USB-C%' OR p.name LIKE '%Type-C%' THEN 600
    WHEN p.name LIKE '%Apple Watch%' THEN 35000
    WHEN p.name LIKE '%Galaxy Watch%' THEN 22000
    WHEN p.name LIKE '%AirPods%' THEN 26000
    WHEN p.name LIKE '%Galaxy Buds%' THEN 12000
    ELSE 10000
  END as cost_price,
  CASE
    WHEN p.name LIKE '%iPhone%Pro%Max%' THEN 165000
    WHEN p.name LIKE '%iPhone 15' THEN 85000
    WHEN p.name LIKE '%iPad%' THEN 80000
    WHEN p.name LIKE '%Galaxy S24%' THEN 150000
    WHEN p.name LIKE '%Galaxy A54%' THEN 42000
    WHEN p.name LIKE '%Galaxy Tab%' THEN 58000
    WHEN p.name LIKE '%OnePlus 12' AND p.name NOT LIKE '%12R%' THEN 60000
    WHEN p.name LIKE '%OnePlus 12R%' THEN 35000
    WHEN p.name LIKE '%Xiaomi 14%' THEN 68000
    WHEN p.name LIKE '%Xiaomi Redmi%' THEN 24000
    WHEN p.name LIKE '%Pixel 9%' THEN 119000
    WHEN p.name LIKE '%Realme%' THEN 36000
    WHEN p.name LIKE '%USB-C%' OR p.name LIKE '%Type-C%' THEN 1000
    WHEN p.name LIKE '%Apple Watch%' THEN 45000
    WHEN p.name LIKE '%Galaxy Watch%' THEN 28000
    WHEN p.name LIKE '%AirPods%' THEN 32000
    WHEN p.name LIKE '%Galaxy Buds%' THEN 16000
    ELSE 15000
  END as selling_price,
  true
FROM catalog.products p
JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid
WHERE p.is_public = true
ON CONFLICT (tenant_id, internal_sku) DO NOTHING;

-- 7. Create sample buyers for the tenant
INSERT INTO app.buyers (
  id, tenant_id, business_name, contact_name, phone, email, gstin, geography, is_active
) VALUES
('550e8400-e29b-41d4-a716-446655440601'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid, 'Kumar Electronics', 'Rajesh Kumar', '+91-9123456789', 'rajesh@kumarelectronics.com', '36AABCT5678H1Z5',
 '{"city": "Hyderabad", "state": "TS"}', true),
('550e8400-e29b-41d4-a716-446655440602'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid, 'Singh Mobile Store', 'Priya Singh', '+91-9876541234', 'priya@singhmobilestore.com', '07AABDM1234H1Z2',
 '{"city": "Delhi", "state": "DL"}', true),
('550e8400-e29b-41d4-a716-446655440603'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid, 'Patel Tech Hub', 'Amit Patel', '+91-9123454567', 'amit@pateltech.com', '27AABDU5432H1Z8',
 '{"city": "Mumbai", "state": "MH"}', true),
('550e8400-e29b-41d4-a716-446655440604'::uuid, '550e8400-e29b-41d4-a716-446655440501'::uuid, 'Phani Mobiles', 'Phani Buyer', '+918985987350', 'phani.buyer@example.com', NULL,
 '{"city": "Hyderabad", "state": "TS"}', true)
ON CONFLICT (id) DO NOTHING;

-- 7b. Buyer users — link Phani Buyer auth user to Phani Mobiles buyer record
INSERT INTO app.buyer_users (buyer_id, user_id, role, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440604'::uuid,
  '550e8400-e29b-41d4-a716-446655440702'::uuid,
  'buyer_admin',
  true
)
ON CONFLICT (buyer_id, user_id) DO NOTHING;

-- 7c. Tenant inventory — spread across both locations
-- Main Warehouse (loc 1): higher stock on flagship phones + all accessories
-- Branch Store (loc 2): moderate stock on mid-range phones + wearables/audio
INSERT INTO app.tenant_inventory (tenant_product_id, location_id, qty_available, qty_reserved, reorder_point)
SELECT
  tp.id,
  '550e8400-e29b-41d4-a716-446655440801'::uuid,
  CASE
    WHEN p.master_sku IN ('APL-IP15PM-256', 'SAM-S24U-512', 'GOO-P9P-256') THEN 15
    WHEN p.master_sku IN ('APL-IP15-128', 'SAM-A54-128', 'OP-12-256', 'XMI-14U-512') THEN 30
    WHEN p.master_sku IN ('APL-IPAD-AIR11', 'SAM-TAB-S9') THEN 10
    WHEN p.master_sku IN ('APL-USB-C', 'SAM-USB-C') THEN 200
    WHEN p.master_sku IN ('APL-WATCH-S9', 'SAM-GW6C') THEN 20
    WHEN p.master_sku IN ('APL-AP-PRO', 'SAM-GB3') THEN 25
    ELSE 20
  END,
  0,
  CASE
    WHEN p.master_sku IN ('APL-USB-C', 'SAM-USB-C') THEN 50
    ELSE 5
  END
FROM app.tenant_products tp
JOIN catalog.products p ON p.id = tp.master_product_id
WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;

INSERT INTO app.tenant_inventory (tenant_product_id, location_id, qty_available, qty_reserved, reorder_point)
SELECT
  tp.id,
  '550e8400-e29b-41d4-a716-446655440802'::uuid,
  CASE
    WHEN p.master_sku IN ('APL-IP15PM-256', 'SAM-S24U-512', 'GOO-P9P-256') THEN 5
    WHEN p.master_sku IN ('APL-IP15-128', 'SAM-A54-128', 'OP-12-256', 'XMI-14U-512') THEN 12
    WHEN p.master_sku IN ('OP-12R-128', 'XMI-RN13-128', 'REA-12P-256') THEN 20
    WHEN p.master_sku IN ('APL-IPAD-AIR11', 'SAM-TAB-S9') THEN 4
    WHEN p.master_sku IN ('APL-USB-C', 'SAM-USB-C') THEN 80
    WHEN p.master_sku IN ('APL-WATCH-S9', 'SAM-GW6C') THEN 8
    WHEN p.master_sku IN ('APL-AP-PRO', 'SAM-GB3') THEN 10
    ELSE 8
  END,
  0,
  CASE
    WHEN p.master_sku IN ('APL-USB-C', 'SAM-USB-C') THEN 20
    ELSE 3
  END
FROM app.tenant_products tp
JOIN catalog.products p ON p.id = tp.master_product_id
WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;

-- 8. Sample audit log entry
INSERT INTO app.audit_log (
  tenant_id, entity_type, entity_id, action, diff
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'tenant',
  '550e8400-e29b-41d4-a716-446655440501'::uuid,
  'create',
  '{"status": "created"}'
);

-- Verify seeded data
SELECT 'Seed Data Summary' as status;
SELECT COUNT(*) as brand_count FROM catalog.brands WHERE is_public = true;
SELECT COUNT(*) as product_count FROM catalog.products WHERE is_public = true;
SELECT COUNT(*) as tenant_count FROM app.tenants WHERE slug = 'techwave';
SELECT COUNT(*) as tenant_user_count FROM app.tenant_users WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;
SELECT COUNT(*) as buyer_count FROM app.buyers WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;
SELECT COUNT(*) as location_count FROM app.locations WHERE tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;
SELECT COUNT(*) as inventory_count FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = '550e8400-e29b-41d4-a716-446655440501'::uuid;
