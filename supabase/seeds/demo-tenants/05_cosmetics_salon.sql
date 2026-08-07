-- ============================================================
-- Demo tenant — Cosmetics & Salon Supply distributor (salons, small orders often)
--
-- Additive only — never truncates anything. Idempotent: no-ops if the
-- 'cosmetics-salon-demo' tenant already exists. Run after
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
  v_cohort_a uuid; -- A-class salon chain
  v_cohort_b uuid; -- Independent neighbourhood salon
  v_cohort_c uuid; -- Bridal/event studio
  v_pl_main uuid;
  v_campaign_id uuid;
BEGIN
  SET LOCAL row_security = OFF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE slug = 'cosmetics-salon-demo') THEN
    RAISE NOTICE 'cosmetics-salon-demo tenant already exists — skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seller_user_id) THEN
    RAISE EXCEPTION 'Shared seller auth user % not found — run supabase/seed.sql first.', v_seller_user_id;
  END IF;

  INSERT INTO app.tenants (slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_purchased_credits_balance)
  VALUES ('cosmetics-salon-demo', 'Radiance Beauty & Salon Supplies', 'cosmetics-salon-demo', '33AAECR9821H1Z6', 'TN', 'starter', 0)
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
  VALUES (v_tenant_id, v_seller_user_id, 'seller_admin', true, now(), '9441479686');

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ), v_seller_user_id);

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse - Chennai',
    '{"line1":"18 T Nagar Beauty Supply Complex","city":"Chennai","state":"TN","pincode":"600017"}'::jsonb, 13.0418000, 80.2341000, true)
  RETURNING id INTO v_loc_main;

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Branch - Coimbatore',
    '{"line1":"5 RS Puram Salon Market","city":"Coimbatore","state":"TN","pincode":"641002"}'::jsonb, 11.0018000, 76.9628000, false)
  RETURNING id INTO v_loc_branch;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_main, 'Main Warehouse - Chennai',
    '{"line1":"18 T Nagar Beauty Supply Complex","city":"Chennai","state":"TN","pincode":"600017"}'::jsonb, 'active', true, '[]', 13.0418000, 80.2341000)
  RETURNING id INTO v_wh_main;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_branch, 'Branch - Coimbatore',
    '{"line1":"5 RS Puram Salon Market","city":"Coimbatore","state":"TN","pincode":"641002"}'::jsonb, 'active', false, '[]', 11.0018000, 76.9628000)
  RETURNING id INTO v_wh_branch;

  INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
  SELECT v_tenant_id, b.id, true FROM catalog.brands b
  WHERE b.slug IN ('loreal-professionnel', 'lakme', 'vlcc') AND b.is_public = true;

  INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
  SELECT v_tenant_id, c.id, c.name, c.slug, 'approved', true, v_seller_user_id, v_seller_user_id
  FROM catalog.categories c
  WHERE c.slug IN ('hair-color', 'skincare', 'makeup', 'haircare', 'salon-consumables') AND c.is_public = true;

  INSERT INTO app.tenant_products (tenant_id, tenant_brand_id, master_product_id, internal_sku, mrp, base_selling_price, cost_price, is_active)
  SELECT v_tenant_id, tb.id, p.id, p.master_sku, v.mrp, v.base_rate,
         round(v.base_rate * (1 - (0.05 + random() * 0.15)), 2), true
  FROM (VALUES
    ('COS-LOR-MAJ63',    650,  560),
    ('COS-LOR-MAJ40',    650,  560),
    ('COS-LOR-SEXP500', 1450, 1270),
    ('COS-LAK-FOUND',    899,  770),
    ('COS-LAK-COMP',     450,  385),
    ('COS-LAK-KAJAL',    220,  185),
    ('COS-VLC-FACGOLD',  680,  580),
    ('COS-VLC-BLEACH',   420,  360),
    ('COS-VLC-BODYPOL',  950,  810),
    ('COS-LOR-DEV1L',    520,  445),
    ('COS-LAK-NAIL',     150,  125),
    ('COS-VLC-STRIPS',   280,  235),
    ('COS-LOR-SERUM',    890,  760),
    ('COS-LAK-REMOVER',  350,  298),
    ('COS-VLC-GLOVES',   180,  150)
  ) AS v(master_sku, mrp, base_rate)
  JOIN catalog.products p ON p.master_sku = v.master_sku AND p.is_public = true
  JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_main, 30 + (abs(hashtext(tp.internal_sku)) % 50), 0, 10
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_branch, 10 + (abs(hashtext(tp.internal_sku || 'b')) % 20), 0, 5
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.buyers (tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled)
  VALUES
    (v_tenant_id, 'Glamour Studio Salon Chain',  'Priya Ramaswamy', '9856780001', 'priya@glamourstudio.in',   '33AABCG1111H1Z1', '{"city":"Chennai","state":"TN"}'::jsonb,    'A', true, true),
    (v_tenant_id, 'Elite Looks Salon Group',      'Divya Krishnan',  '9856780002', 'divya@elitelooks.in',      '33AABCE2222H1Z2', '{"city":"Coimbatore","state":"TN"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Beauty Point Salon',           'Lakshmi Narayan', '9856780003', 'lakshmi@beautypoint.in',   NULL,               '{"city":"Chennai","state":"TN"}'::jsonb,    'B', true, true),
    (v_tenant_id, 'Style Craft Ladies Salon',     'Anitha Mohan',    '9856780004', 'anitha@stylecraft.in',     NULL,               '{"city":"Kochi","state":"KL"}'::jsonb,      'B', true, true),
    (v_tenant_id, 'Trendy Cuts Salon',            'Revathi Suresh',  '9856780005', 'revathi@trendycuts.in',    NULL,               '{"city":"Coimbatore","state":"TN"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'Radiance Bridal Studio',       'Kavya Menon',     '9856780006', 'kavya@radiancebridal.in',  '33AABCR3333H1Z3', '{"city":"Chennai","state":"TN"}'::jsonb,    'C', true, true),
    (v_tenant_id, 'Perfect Day Makeover Studio',  'Swathi Pillai',   '9856780007', 'swathi@perfectday.in',     NULL,               '{"city":"Kochi","state":"KL"}'::jsonb,      'C', true, true),
    (v_tenant_id, 'Grace Bridal & Event Salon',   'Meera Nair',      '9856780008', 'meera@gracebridal.in',     NULL,               '{"city":"Coimbatore","state":"TN"}'::jsonb, 'C', true, true);

  INSERT INTO app.cohorts (tenant_id, name, description, rules, is_static, cached_member_count, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'A-class Salon Chain',              'Multi-outlet salon chains ordering frequently in small batches', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Independent Neighbourhood Salon',  'Standalone neighbourhood salons', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Bridal / Event Studio',             'Project and seasonal bridal/event buyers', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'A-class Salon Chain' LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Independent Neighbourhood Salon' LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Bridal / Event Studio' LIMIT 1;

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
  VALUES (v_tenant_id, 'New Shade Launch Rates', 'INR', now(), now() + interval '14 days', 20, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_main;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, valid_from, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_main, 'cohort', v_cohort_a, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_b, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_c, now(), now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_main, tp.id, v.campaign_rate, 1, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM (VALUES
    ('COS-LOR-MAJ63', 510),  ('COS-LOR-MAJ40', 510),  ('COS-LOR-SEXP500', 1160),
    ('COS-LAK-FOUND', 700),  ('COS-LAK-COMP',  350),  ('COS-LAK-KAJAL',   168),
    ('COS-VLC-FACGOLD', 525),('COS-VLC-BLEACH', 325), ('COS-VLC-BODYPOL', 735),
    ('COS-LOR-DEV1L', 405),  ('COS-LAK-NAIL',   113), ('COS-VLC-STRIPS',  213),
    ('COS-LOR-SERUM', 690),  ('COS-LAK-REMOVER',270), ('COS-VLC-GLOVES',  135)
  ) AS v(master_sku, campaign_rate)
  JOIN app.tenant_products tp ON tp.internal_sku = v.master_sku AND tp.tenant_id = v_tenant_id;

  -- "New Shade Launch — 2-Week Window": matches the spec's own pain point of new launches
  -- losing relevance if salons don't hear in the first 2-3 weeks — a short, urgent window.
  INSERT INTO app.campaigns (tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'New Shade Launch — 2-Week Window', 'cohort', jsonb_build_object('cohort_id', v_cohort_a),
    now() - interval '1 days', now() + interval '13 days', 'published',
    NULL, 'New shades just landed — order this week before they''re gone from the front page.', 'cosmetics-salon-demo-shade-launch',
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

SELECT 'cosmetics-salon-demo' AS tenant, 'tenant_products' AS metric, count(*)::text AS value
FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id WHERE t.slug = 'cosmetics-salon-demo'
UNION ALL
SELECT 'cosmetics-salon-demo', 'buyers', count(*)::text FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id WHERE t.slug = 'cosmetics-salon-demo'
UNION ALL
SELECT 'cosmetics-salon-demo', 'cohorts', count(*)::text FROM app.cohorts c JOIN app.tenants t ON t.id = c.tenant_id WHERE t.slug = 'cosmetics-salon-demo'
UNION ALL
SELECT 'cosmetics-salon-demo', 'campaigns_published', count(*)::text FROM app.campaigns ca JOIN app.tenants t ON t.id = ca.tenant_id WHERE t.slug = 'cosmetics-salon-demo' AND ca.status = 'published';
