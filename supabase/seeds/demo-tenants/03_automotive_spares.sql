-- ============================================================
-- Demo tenant — Automotive Spares distributor (mechanics/retailers/service centers)
--
-- Additive only — never truncates anything. Idempotent: no-ops if the
-- 'automotive-spares-demo' tenant already exists. Run after
-- 00_shared_catalog.sql. Reuses the shared seller test login
-- (santosh.phani@gmail.com, seller_admin).
--
-- Pricing: mrp = spec MRP, base_selling_price = spec Base Rate,
-- cost_price = base_selling_price * (1 - random 5-20% margin).
-- Campaign Rate is used only in price_list_items (never in tenant_products).
-- ============================================================

DO $$
DECLARE
  v_tenant_id uuid;
  v_seller_user_id uuid := '550e8400-e29b-41d4-a716-446655440701'::uuid;
  v_loc_main uuid;
  v_loc_branch uuid;
  v_wh_main uuid;
  v_wh_branch uuid;
  v_cohort_a uuid; -- Multi-brand mechanic garage
  v_cohort_b uuid; -- Retail counter/parts shop
  v_cohort_c uuid; -- Fleet/service center
  v_pl_main uuid;
  v_pl_fleet uuid;
  v_campaign_id uuid;
BEGIN
  SET LOCAL row_security = OFF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE slug = 'automotive-spares-demo') THEN
    RAISE NOTICE 'automotive-spares-demo tenant already exists — skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seller_user_id) THEN
    RAISE EXCEPTION 'Shared seller auth user % not found — run supabase/seed.sql first.', v_seller_user_id;
  END IF;

  INSERT INTO app.tenants (slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_purchased_credits_balance)
  VALUES ('automotive-spares-demo', 'Highway Auto Spares Distribution', 'automotive-spares-demo', '27AAECH7731H1Z3', 'MH', 'starter', 0)
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
  VALUES (v_tenant_id, v_seller_user_id, 'seller_admin', true, now(), '9441479686');

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ), v_seller_user_id);

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse - Nagpur',
    '{"line1":"14 Automotive Market, Sadar","city":"Nagpur","state":"MH","pincode":"440001"}'::jsonb, 21.1498000, 79.0821000, true)
  RETURNING id INTO v_loc_main;

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Branch - Indore',
    '{"line1":"9 MG Road Auto Parts Lane","city":"Indore","state":"MP","pincode":"452001"}'::jsonb, 22.7196000, 75.8577000, false)
  RETURNING id INTO v_loc_branch;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_main, 'Main Warehouse - Nagpur',
    '{"line1":"14 Automotive Market, Sadar","city":"Nagpur","state":"MH","pincode":"440001"}'::jsonb, 'active', true, '[]', 21.1498000, 79.0821000)
  RETURNING id INTO v_wh_main;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_branch, 'Branch - Indore',
    '{"line1":"9 MG Road Auto Parts Lane","city":"Indore","state":"MP","pincode":"452001"}'::jsonb, 'active', false, '[]', 22.7196000, 75.8577000)
  RETURNING id INTO v_wh_branch;

  INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
  SELECT v_tenant_id, b.id, true FROM catalog.brands b
  WHERE b.slug IN ('bosch', 'rane', 'exide', 'local-make') AND b.is_public = true;

  INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
  SELECT v_tenant_id, c.id, c.name, c.slug, 'approved', true, v_seller_user_id, v_seller_user_id
  FROM catalog.categories c
  WHERE c.slug IN ('filters', 'brake-parts', 'batteries', 'auto-electricals', 'bearings', 'clutch-plates', 'body-parts')
    AND c.is_public = true;

  INSERT INTO app.tenant_products (tenant_id, tenant_brand_id, master_product_id, internal_sku, mrp, base_selling_price, cost_price, is_active)
  SELECT v_tenant_id, tb.id, p.id, p.master_sku, v.mrp, v.base_rate,
         round(v.base_rate * (1 - (0.05 + random() * 0.15)), 2), true
  FROM (VALUES
    ('AUT-BSH-OILF-SWF',  280,  245),
    ('AUT-BSH-AIRF-I20',  420,  365),
    ('AUT-BSH-PLUG4',     680,  590),
    ('AUT-RNE-BRK-WGR',   950,  830),
    ('AUT-RNE-BRK-CRT',  1450, 1270),
    ('AUT-RNE-CLU-BOL',  2100, 1850),
    ('AUT-EXD-BAT35',    4200, 3750),
    ('AUT-EXD-BAT65',    7800, 6950),
    ('AUT-BSH-FUELF-ACE', 350,  305),
    ('AUT-LOC-BRG-FRT',   550,  470),
    ('AUT-LOC-TAIL-ALT',  850,  720),
    ('AUT-BSH-WIPE20',    450,  390),
    ('AUT-LOC-RAD-BOL',  3200, 2750),
    ('AUT-RNE-TIE-SWB',   680,  590),
    ('AUT-LOC-ENGMT',    1100,  950)
  ) AS v(master_sku, mrp, base_rate)
  JOIN catalog.products p ON p.master_sku = v.master_sku AND p.is_public = true
  JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_main, 20 + (abs(hashtext(tp.internal_sku)) % 40), 0, 8
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_branch, 6 + (abs(hashtext(tp.internal_sku || 'b')) % 15), 0, 4
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.buyers (tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled)
  VALUES
    (v_tenant_id, 'Speed Auto Garage',                'Rajendra Patil',  '9834560001', 'rajendra@speedautogarage.in',  '27AABCS1111H1Z1', '{"city":"Nagpur","state":"MH"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Highway Motors Service',            'Vinod Deshmukh',  '9834560002', 'vinod@highwaymotors.in',       '27AABCH2222H1Z2', '{"city":"Nagpur","state":"MH"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Precision Auto Care',                'Ashok Jain',      '9834560003', 'ashok@precisionautocare.in',   '23AABCP3333H1Z3', '{"city":"Indore","state":"MP"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Bhandari Auto Parts',                'Mahesh Bhandari', '9834560004', 'mahesh@bhandariauto.in',       NULL,               '{"city":"Nagpur","state":"MH"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'National Spares Corner',             'Ramesh Chandel',  '9834560005', 'ramesh@nationalspares.in',     NULL,               '{"city":"Indore","state":"MP"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'Reliable Fleet Services Pvt Ltd',    'Sunil Kadam',     '9834560006', 'sunil@reliablefleet.in',       '27AABCR4444H1Z4', '{"city":"Nagpur","state":"MH"}'::jsonb, 'C', true, true),
    (v_tenant_id, 'Metro Logistics Garage',             'Anand Tiwari',    '9834560007', 'anand@metrologistics.in',      '23AABCM5555H1Z5', '{"city":"Indore","state":"MP"}'::jsonb, 'C', true, true),
    (v_tenant_id, 'City Cab Fleet Maintenance',         'Prakash Gaikwad', '9834560008', 'prakash@citycabfleet.in',      NULL,               '{"city":"Nagpur","state":"MH"}'::jsonb, 'C', true, true);

  INSERT INTO app.cohorts (tenant_id, name, description, rules, is_static, cached_member_count, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'Multi-brand Mechanic Garage',  'High-frequency, multi-make mechanic garages', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Retail Counter / Parts Shop',   'Retail counter and parts shop accounts', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Fleet / Service Center',        'Project-rate, credit-heavy fleet and service center accounts', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Multi-brand Mechanic Garage' LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Retail Counter / Parts Shop' LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Fleet / Service Center' LIMIT 1;

  INSERT INTO app.cohort_members (cohort_id, buyer_id, valid_from)
  SELECT v_cohort_a, b.id, now() FROM app.buyers b WHERE b.tenant_id = v_tenant_id AND b.tier = 'A';
  INSERT INTO app.cohort_members (cohort_id, buyer_id, valid_from)
  SELECT v_cohort_b, b.id, now() FROM app.buyers b WHERE b.tenant_id = v_tenant_id AND b.tier = 'B';
  INSERT INTO app.cohort_members (cohort_id, buyer_id, valid_from)
  SELECT v_cohort_c, b.id, now() FROM app.buyers b WHERE b.tenant_id = v_tenant_id AND b.tier = 'C';

  UPDATE app.cohorts c
  SET cached_member_count = (SELECT count(*) FROM app.cohort_members cm WHERE cm.cohort_id = c.id AND cm.valid_until IS NULL),
      updated_at = now(), updated_by = v_seller_user_id
  WHERE c.tenant_id = v_tenant_id;

  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Service Season Ready Rates', 'INR', now(), NULL, 20, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_main;

  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Fleet Service Center Rates', 'INR', now(), NULL, 30, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_fleet;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, valid_from, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_main, 'cohort', v_cohort_a, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_b, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_fleet, 'cohort', v_cohort_c, now(), now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_main, tp.id, v.campaign_rate, 1, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM (VALUES
    ('AUT-BSH-OILF-SWF', 225),  ('AUT-BSH-AIRF-I20', 335),  ('AUT-BSH-PLUG4', 540),
    ('AUT-RNE-BRK-WGR',  760),  ('AUT-RNE-BRK-CRT', 1160),  ('AUT-RNE-CLU-BOL', 1700),
    ('AUT-EXD-BAT35',   3500),  ('AUT-EXD-BAT65',   6500),  ('AUT-BSH-FUELF-ACE', 280),
    ('AUT-LOC-BRG-FRT',  430),  ('AUT-LOC-TAIL-ALT', 660),  ('AUT-BSH-WIPE20',   355),
    ('AUT-LOC-RAD-BOL', 2520),  ('AUT-RNE-TIE-SWB',  540),  ('AUT-LOC-ENGMT',    870)
  ) AS v(master_sku, campaign_rate)
  JOIN app.tenant_products tp ON tp.internal_sku = v.master_sku AND tp.tenant_id = v_tenant_id;

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_fleet, tp.id, round(pli.price * 0.96, 2), 3, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.price_list_items pli
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pli.price_list_id = v_pl_main;

  INSERT INTO app.campaigns (tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Service Season Ready', 'cohort', jsonb_build_object('cohort_id', v_cohort_a),
    now() - interval '4 days', now() + interval '20 days', 'published',
    NULL, 'Pre-monsoon brake and battery push — stock up before service season peaks.', 'automotive-spares-demo-service-season',
    now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_campaign_id;

  INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_campaign_id, tp.id, (row_number() OVER (ORDER BY tp.created_at, tp.id) % 4 = 0),
         row_number() OVER (ORDER BY tp.created_at, tp.id), pli.price,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  JOIN app.price_list_items pli ON pli.tenant_product_id = tp.id AND pli.price_list_id = v_pl_main
  WHERE tp.tenant_id = v_tenant_id;

END $$;

SELECT 'automotive-spares-demo' AS tenant, 'tenant_products' AS metric, count(*)::text AS value
FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id WHERE t.slug = 'automotive-spares-demo'
UNION ALL
SELECT 'automotive-spares-demo', 'buyers', count(*)::text FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id WHERE t.slug = 'automotive-spares-demo'
UNION ALL
SELECT 'automotive-spares-demo', 'cohorts', count(*)::text FROM app.cohorts c JOIN app.tenants t ON t.id = c.tenant_id WHERE t.slug = 'automotive-spares-demo'
UNION ALL
SELECT 'automotive-spares-demo', 'campaigns_published', count(*)::text FROM app.campaigns ca JOIN app.tenants t ON t.id = ca.tenant_id WHERE t.slug = 'automotive-spares-demo' AND ca.status = 'published';
