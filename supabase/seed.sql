-- Seed data for DealFlow: Electronics & Mobiles Distributor
-- Sample tenant for testing

-- 1. Master Catalog - Categories
INSERT INTO catalog.categories (id, name, slug, description) VALUES
('cat_001', 'Smartphones', 'smartphones', 'Mobile phones and smartphones'),
('cat_002', 'Tablets', 'tablets', 'Tablets and iPad alternatives'),
('cat_003', 'Accessories', 'accessories', 'Mobile and tablet accessories'),
('cat_004', 'Wearables', 'wearables', 'Smartwatches and fitness trackers'),
('cat_005', 'Audio', 'audio', 'Earbuds, headphones, and speakers')
ON CONFLICT (id) DO NOTHING;

-- 2. Master Catalog - Brands
INSERT INTO catalog.brands (id, name, slug, logo_url, is_public, origin_tenant_id) VALUES
('brand_001', 'Apple', 'apple', 'https://example.com/apple-logo.png', true, NULL),
('brand_002', 'Samsung', 'samsung', 'https://example.com/samsung-logo.png', true, NULL),
('brand_003', 'OnePlus', 'oneplus', 'https://example.com/oneplus-logo.png', true, NULL),
('brand_004', 'Xiaomi', 'xiaomi', 'https://example.com/xiaomi-logo.png', true, NULL),
('brand_005', 'Google', 'google', 'https://example.com/google-logo.png', true, NULL),
('brand_006', 'Realme', 'realme', 'https://example.com/realme-logo.png', true, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. Master Catalog - Products
INSERT INTO catalog.products (
  id, brand_id, category_id, name, slug, sku, description,
  base_cost_price, base_selling_price, tax_rate, is_public, origin_tenant_id
) VALUES
-- iPhone products
('prod_001', 'brand_001', 'cat_001', 'iPhone 15 Pro Max', 'iphone-15-pro-max', 'APL-IP15PM-256',
 'Apple iPhone 15 Pro Max 256GB', 130000, 165000, 18, true, NULL),
('prod_002', 'brand_001', 'cat_001', 'iPhone 15', 'iphone-15', 'APL-IP15-128',
 'Apple iPhone 15 128GB', 70000, 85000, 18, true, NULL),
('prod_003', 'brand_001', 'cat_002', 'iPad Air 11', 'ipad-air-11', 'APL-IPAD-AIR11',
 'Apple iPad Air 11-inch', 65000, 80000, 18, true, NULL),

-- Samsung products
('prod_004', 'brand_002', 'cat_001', 'Galaxy S24 Ultra', 'galaxy-s24-ultra', 'SAM-S24U-512',
 'Samsung Galaxy S24 Ultra 512GB', 120000, 150000, 18, true, NULL),
('prod_005', 'brand_002', 'cat_001', 'Galaxy A54', 'galaxy-a54', 'SAM-A54-128',
 'Samsung Galaxy A54 128GB', 32000, 42000, 18, true, NULL),
('prod_006', 'brand_002', 'cat_002', 'Galaxy Tab S9', 'galaxy-tab-s9', 'SAM-TAB-S9',
 'Samsung Galaxy Tab S9 128GB', 45000, 58000, 18, true, NULL),

-- OnePlus products
('prod_007', 'brand_003', 'cat_001', 'OnePlus 12', 'oneplus-12', 'OP-12-256',
 'OnePlus 12 256GB', 48000, 60000, 18, true, NULL),
('prod_008', 'brand_003', 'cat_001', 'OnePlus 12R', 'oneplus-12r', 'OP-12R-128',
 'OnePlus 12R 128GB', 28000, 35000, 18, true, NULL),

-- Xiaomi products
('prod_009', 'brand_004', 'cat_001', 'Xiaomi 14 Ultra', 'xiaomi-14-ultra', 'XMI-14U-512',
 'Xiaomi 14 Ultra 512GB', 55000, 68000, 18, true, NULL),
('prod_010', 'brand_004', 'cat_001', 'Xiaomi Redmi Note 13', 'xiaomi-redmi-13', 'XMI-RN13-128',
 'Xiaomi Redmi Note 13 128GB', 18000, 24000, 18, true, NULL),

-- Google products
('prod_011', 'brand_005', 'cat_001', 'Pixel 9 Pro', 'pixel-9-pro', 'GOO-P9P-256',
 'Google Pixel 9 Pro 256GB', 95000, 119000, 18, true, NULL),

-- Realme products
('prod_012', 'brand_006', 'cat_001', 'Realme 12 Pro', 'realme-12-pro', 'REA-12P-256',
 'Realme 12 Pro 256GB', 28000, 36000, 18, true, NULL),

-- Accessories
('prod_013', 'brand_001', 'cat_003', 'iPhone USB-C Cable', 'iphone-usb-c', 'APL-USB-C',
 'Apple USB-C to USB-C Cable', 800, 1200, 18, true, NULL),
('prod_014', 'brand_002', 'cat_003', 'Samsung Type-C Cable', 'samsung-usb-c', 'SAM-USB-C',
 'Samsung Type-C Cable', 600, 1000, 18, true, NULL),

-- Wearables
('prod_015', 'brand_001', 'cat_004', 'Apple Watch Series 9', 'apple-watch-s9', 'APL-WATCH-S9',
 'Apple Watch Series 9 45mm', 35000, 45000, 18, true, NULL),
('prod_016', 'brand_002', 'cat_004', 'Galaxy Watch6 Classic', 'galaxy-watch6', 'SAM-GW6C',
 'Samsung Galaxy Watch6 Classic', 22000, 28000, 18, true, NULL),

-- Audio
('prod_017', 'brand_001', 'cat_005', 'AirPods Pro', 'airpods-pro', 'APL-AP-PRO',
 'Apple AirPods Pro (2nd gen)', 26000, 32000, 18, true, NULL),
('prod_018', 'brand_002', 'cat_005', 'Galaxy Buds3', 'galaxy-buds3', 'SAM-GB3',
 'Samsung Galaxy Buds3', 12000, 16000, 18, true, NULL)
ON CONFLICT (id) DO NOTHING;

-- 4. Create sample tenant (Electronics distributor)
-- Note: In production, tenants are created via signup. This is for testing.
INSERT INTO app.tenants (
  id, slug, business_name, subdomain, city, state,
  gst_number, contact_email, contact_phone, created_by, updated_by
) VALUES
(
  'tenant_test_001',
  'techwave',
  'TechWave Electronics',
  'techwave',
  'Bangalore',
  'KA',
  '18AACCT1234H1Z0',
  'admin@techwave.com',
  '+91-9876543210',
  'system-seed',
  'system-seed'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Assign all master catalog brands to tenant
INSERT INTO app.tenant_brands (tenant_id, brand_id, created_by, updated_by)
VALUES
('tenant_test_001', 'brand_001', 'system-seed', 'system-seed'),
('tenant_test_001', 'brand_002', 'system-seed', 'system-seed'),
('tenant_test_001', 'brand_003', 'system-seed', 'system-seed'),
('tenant_test_001', 'brand_004', 'system-seed', 'system-seed'),
('tenant_test_001', 'brand_005', 'system-seed', 'system-seed'),
('tenant_test_001', 'brand_006', 'system-seed', 'system-seed')
ON CONFLICT (tenant_id, brand_id) DO NOTHING;

-- 6. Assign all products to tenant with inventory
INSERT INTO app.tenant_products (
  tenant_id, brand_id, category_id, name, sku, description,
  cost_price, selling_price, tax_rate, created_by, updated_by
)
SELECT
  'tenant_test_001',
  p.brand_id,
  p.category_id,
  p.name,
  p.sku,
  p.description,
  p.base_cost_price,
  p.base_selling_price,
  p.tax_rate,
  'system-seed',
  'system-seed'
FROM catalog.products p
WHERE p.is_public = true
ON CONFLICT (tenant_id, sku) DO NOTHING;

-- 7. Create sample buyers for the tenant
INSERT INTO app.buyers (
  tenant_id, name, business_name, city, state, gst_number,
  contact_email, contact_phone, created_by, updated_by
) VALUES
('tenant_test_001', 'Rajesh Kumar', 'Kumar Electronics', 'Hyderabad', 'TS', '36AABCT5678H1Z5',
 'rajesh@kumarelectronics.com', '+91-9123456789', 'system-seed', 'system-seed'),
('tenant_test_001', 'Priya Singh', 'Singh Mobile Store', 'Delhi', 'DL', '07AABDM1234H1Z2',
 'priya@singhmobilestore.com', '+91-9876541234', 'system-seed', 'system-seed'),
('tenant_test_001', 'Amit Patel', 'Patel Tech Hub', 'Mumbai', 'MH', '27AABDU5432H1Z8',
 'amit@pateltech.com', '+91-9123454567', 'system-seed', 'system-seed')
ON CONFLICT (tenant_id, gst_number) DO NOTHING;

-- 8. Sample audit log entry
INSERT INTO app.audit_log (
  tenant_id, entity_type, entity_id, action, changes, created_by
) VALUES
(
  'tenant_test_001',
  'tenant',
  'tenant_test_001',
  'created',
  '{"status": "created"}',
  'system-seed'
);

-- Verify seeded data
SELECT 'Seed Data Summary' as status;
SELECT COUNT(*) as brand_count FROM catalog.brands WHERE is_public = true;
SELECT COUNT(*) as product_count FROM catalog.products WHERE is_public = true;
SELECT COUNT(*) as tenant_count FROM app.tenants WHERE slug = 'techwave';
SELECT COUNT(*) as buyer_count FROM app.buyers WHERE tenant_id = 'tenant_test_001';
