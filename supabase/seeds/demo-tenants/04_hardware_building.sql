-- ============================================================
-- Demo tenant — Hardware & Building Materials distributor (contractors/project buyers/retail counter)
--
-- Additive only — never truncates anything. Idempotent: no-ops if the
-- 'hardware-building-demo' tenant already exists. Run after
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
  v_cohort_a uuid; -- Project contractor
  v_cohort_b uuid; -- Counter retailer
  v_cohort_c uuid; -- Interior/renovation contractor
  v_pl_main uuid;
  v_pl_project uuid;
  v_campaign_id uuid;
BEGIN
  SET LOCAL row_security = OFF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE slug = 'hardware-building-demo') THEN
    RAISE NOTICE 'hardware-building-demo tenant already exists — skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seller_user_id) THEN
    RAISE EXCEPTION 'Shared seller auth user % not found — run supabase/seed.sql first.', v_seller_user_id;
  END IF;

  INSERT INTO app.tenants (slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_purchased_credits_balance)
  VALUES ('hardware-building-demo', 'Shreeji Hardware & Building Supplies', 'hardware-building-demo', '08AAECS6621H1Z4', 'RJ', 'starter', 0)
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
  VALUES (v_tenant_id, v_seller_user_id, 'seller_admin', true, now(), '9441479686');

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ), v_seller_user_id);

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse - Jaipur',
    '{"line1":"31 Transport Nagar","city":"Jaipur","state":"RJ","pincode":"302019"}'::jsonb, 26.9124000, 75.7873000, true)
  RETURNING id INTO v_loc_main;

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Branch - Surat',
    '{"line1":"7 Ring Road Hardware Market","city":"Surat","state":"GJ","pincode":"395002"}'::jsonb, 21.1959000, 72.8302000, false)
  RETURNING id INTO v_loc_branch;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_main, 'Main Warehouse - Jaipur',
    '{"line1":"31 Transport Nagar","city":"Jaipur","state":"RJ","pincode":"302019"}'::jsonb, 'active', true, '[]', 26.9124000, 75.7873000)
  RETURNING id INTO v_wh_main;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_branch, 'Branch - Surat',
    '{"line1":"7 Ring Road Hardware Market","city":"Surat","state":"GJ","pincode":"395002"}'::jsonb, 'active', false, '[]', 21.1959000, 72.8302000)
  RETURNING id INTO v_wh_branch;

  INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
  SELECT v_tenant_id, b.id, true FROM catalog.brands b
  WHERE b.slug IN ('asian-paints', 'cera', 'pidilite', 'local-unbranded') AND b.is_public = true;

  INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
  SELECT v_tenant_id, c.id, c.name, c.slug, 'approved', true, v_seller_user_id, v_seller_user_id
  FROM catalog.categories c
  WHERE c.slug IN ('paints', 'sanitaryware', 'fasteners', 'adhesives-sealants', 'hand-power-tools', 'plumbing')
    AND c.is_public = true;

  INSERT INTO app.tenant_products (tenant_id, tenant_brand_id, master_product_id, internal_sku, mrp, base_selling_price, cost_price, is_active)
  SELECT v_tenant_id, tb.id, p.id, p.master_sku, v.mrp, v.base_rate,
         round((v.base_rate * (1 - (0.05 + random() * 0.15)))::numeric, 2), true
  FROM (VALUES
    ('HRD-ASP-TRC20',  3200, 2850),
    ('HRD-ASP-APX10',  2900, 2580),
    ('HRD-ASP-PRM20',  2100, 1870),
    ('HRD-CER-BASIN',  1850, 1620),
    ('HRD-CER-WC1PC',  8900, 7850),
    ('HRD-CER-BATHFIT',2400, 2100),
    ('HRD-PID-FEV1KG',  280,  245),
    ('HRD-PID-DRFIX20',4500, 3950),
    ('HRD-LOC-M8BOLT',  450,  380),
    ('HRD-LOC-HINGE',   120,   95),
    ('HRD-LOC-NAIL3',   180,  150),
    ('HRD-LOC-TWRB8',    95,   78),
    ('HRD-PID-MSEAL',   110,   92),
    ('HRD-LOC-PVC1IN',  210,  175),
    ('HRD-LOC-TROWEL',  150,  120)
  ) AS v(master_sku, mrp, base_rate)
  JOIN catalog.products p ON p.master_sku = v.master_sku AND p.is_public = true
  JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_main, 25 + (abs(hashtext(tp.internal_sku)) % 45), 0, 8
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_branch, 8 + (abs(hashtext(tp.internal_sku || 'b')) % 18), 0, 4
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.buyers (tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled)
  VALUES
    (v_tenant_id, 'Shreeji Constructions Pvt Ltd',   'Nitin Agarwal',   '9845670001', 'nitin@shreejiconstructions.in', '08AABCS1111H1Z1', '{"city":"Jaipur","state":"RJ"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Blue Sky Infra Projects',          'Kiran Shah',      '9845670002', 'kiran@blueskyinfra.in',         '24AABCB2222H1Z2', '{"city":"Surat","state":"GJ"}'::jsonb,  'A', true, true),
    (v_tenant_id, 'Jaipur Hardware Mart',              'Rakesh Sharma',   '9845670003', 'rakesh@jaipurhardware.in',      NULL,               '{"city":"Jaipur","state":"RJ"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'Gupta Hardware Store',              'Sanjay Gupta',    '9845670004', 'sanjay@guptahardware.in',       NULL,               '{"city":"Lucknow","state":"UP"}'::jsonb,'B', true, true),
    (v_tenant_id, 'Om Sai Hardware',                    'Bharat Patel',    '9845670005', 'bharat@omsaihardware.in',       NULL,               '{"city":"Surat","state":"GJ"}'::jsonb,  'B', true, true),
    (v_tenant_id, 'Modern Interiors & Decor',          'Neha Kapoor',     '9845670006', 'neha@moderninteriors.in',       '08AABCM3333H1Z3', '{"city":"Jaipur","state":"RJ"}'::jsonb, 'C', true, true),
    (v_tenant_id, 'Elegant Home Renovators',           'Jignesh Mehta',   '9845670007', 'jignesh@eleganthome.in',        '24AABCE4444H1Z4', '{"city":"Surat","state":"GJ"}'::jsonb,  'C', true, true),
    (v_tenant_id, 'Classic Interior Solutions',        'Amit Srivastava', '9845670008', 'amit@classicinterior.in',       NULL,               '{"city":"Lucknow","state":"UP"}'::jsonb,'C', true, true);

  INSERT INTO app.cohorts (tenant_id, name, description, rules, is_static, cached_member_count, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'Project Contractor',            'Large orders, project rate, credit terms', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Counter Retailer',               'Small-quantity, cash-paying counter retailers', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Interior / Renovation Contractor','Interior and renovation project contractors', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Project Contractor' LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Counter Retailer' LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Interior / Renovation Contractor' LIMIT 1;

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

  -- Two price lists to show project-rate vs counter-rate on the SAME SKU (the exact pain point named in the spec)
  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Pre-Festive Renovation Push — Counter Rates', 'INR', now(), NULL, 20, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_main;

  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Project Contractor Rates', 'INR', now(), NULL, 30, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_project;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, valid_from, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_main, 'cohort', v_cohort_b, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_c, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_project, 'cohort', v_cohort_a, now(), now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_main, tp.id, v.campaign_rate, 1, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM (VALUES
    ('HRD-ASP-TRC20', 2600),  ('HRD-ASP-APX10', 2350),  ('HRD-ASP-PRM20', 1700),
    ('HRD-CER-BASIN', 1480),  ('HRD-CER-WC1PC', 7200),  ('HRD-CER-BATHFIT', 1920),
    ('HRD-PID-FEV1KG', 225),  ('HRD-PID-DRFIX20', 3600),('HRD-LOC-M8BOLT', 345),
    ('HRD-LOC-HINGE',   85),  ('HRD-LOC-NAIL3',   135),  ('HRD-LOC-TWRB8',   70),
    ('HRD-PID-MSEAL',    84),  ('HRD-LOC-PVC1IN', 160),  ('HRD-LOC-TROWEL', 108)
  ) AS v(master_sku, campaign_rate)
  JOIN app.tenant_products tp ON tp.internal_sku = v.master_sku AND tp.tenant_id = v_tenant_id;

  -- Project-rate list: same SKUs, deeper discount + bulk min_qty (illustrates project-rate vs counter-rate on the same SKU)
  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_project, tp.id, round(pli.price * 0.94, 2), 10, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.price_list_items pli
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pli.price_list_id = v_pl_main;

  INSERT INTO app.campaigns (tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Pre-Festive Renovation Push', 'cohort', jsonb_build_object('cohort_id', v_cohort_c),
    now() - interval '5 days', now() + interval '30 days', 'published',
    NULL, 'Festive renovation season is here — lock in your rates before demand peaks.', 'hardware-building-demo-festive-push',
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

SELECT 'hardware-building-demo' AS tenant, 'tenant_products' AS metric, count(*)::text AS value
FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id WHERE t.slug = 'hardware-building-demo'
UNION ALL
SELECT 'hardware-building-demo', 'buyers', count(*)::text FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id WHERE t.slug = 'hardware-building-demo'
UNION ALL
SELECT 'hardware-building-demo', 'cohorts', count(*)::text FROM app.cohorts c JOIN app.tenants t ON t.id = c.tenant_id WHERE t.slug = 'hardware-building-demo'
UNION ALL
SELECT 'hardware-building-demo', 'campaigns_published', count(*)::text FROM app.campaigns ca JOIN app.tenants t ON t.id = ca.tenant_id WHERE t.slug = 'hardware-building-demo' AND ca.status = 'published';
