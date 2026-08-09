-- ============================================================
-- Demo tenant — Electricals distributor (electricians/retailers/contractors)
--
-- Additive only — never truncates anything. Idempotent: no-ops if the
-- 'electricals-demo' tenant already exists (re-run safe, does not resync).
-- Run after 00_shared_catalog.sql. Reuses the shared seller test login
-- (santosh.phani@gmail.com, seller_admin) so one login can switch across
-- all demo tenants.
--
-- Pricing: mrp = spec MRP, base_selling_price = spec Base Rate,
-- cost_price = base_selling_price * (1 - random 5-20% margin).
-- Where the spec had no Base Rate ("—"), base_selling_price is
-- estimated as round(mrp * 0.90, 2) — flagged inline.
-- Campaign Rate is used only in price_list_items (never in tenant_products).
-- ============================================================

DO $$
DECLARE
  v_tenant_id uuid;
  v_seller_user_id uuid := '550e8400-e29b-41d4-a716-446655440701'::uuid; -- shared seller login
  v_loc_main uuid;
  v_loc_branch uuid;
  v_wh_main uuid;
  v_wh_branch uuid;
  v_cohort_a uuid; -- A-class electrician (Hyderabad)
  v_cohort_b uuid; -- B-class retailer (Secunderabad)
  v_cohort_c uuid; -- Project contractor
  v_pl_main uuid;
  v_pl_contractor uuid;
  v_campaign_id uuid;
BEGIN
  SET LOCAL row_security = OFF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE slug = 'electricals-demo') THEN
    RAISE NOTICE 'electricals-demo tenant already exists — skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seller_user_id) THEN
    RAISE EXCEPTION 'Shared seller auth user % not found — run supabase/seed.sql first.', v_seller_user_id;
  END IF;

  -- 1. Tenant
  INSERT INTO app.tenants (slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_purchased_credits_balance)
  VALUES ('electricals-demo', 'Sri Balaji Electricals Distribution', 'electricals-demo', '36AAECS4521H1Z5', 'TS', 'starter', 0)
  RETURNING id INTO v_tenant_id;

  -- 2. Seller admin (shared login)
  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
  VALUES (v_tenant_id, v_seller_user_id, 'seller_admin', true, now(), '9441479686');

  -- 3. Tenant settings (mirrors seed.sql defaults)
  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ), v_seller_user_id);

  -- 4. Locations + warehouses (Hyderabad main + Secunderabad branch, per spec cohort geography)
  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse - Hyderabad',
    '{"line1":"12 Balanagar Industrial Estate","city":"Hyderabad","state":"TS","pincode":"500037"}'::jsonb, 17.4674000, 78.4536000, true)
  RETURNING id INTO v_loc_main;

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Branch - Secunderabad',
    '{"line1":"8 Trunk Road","city":"Secunderabad","state":"TS","pincode":"500003"}'::jsonb, 17.4399000, 78.4983000, false)
  RETURNING id INTO v_loc_branch;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_main, 'Main Warehouse - Hyderabad',
    '{"line1":"12 Balanagar Industrial Estate","city":"Hyderabad","state":"TS","pincode":"500037"}'::jsonb, 'active', true, '[]', 17.4674000, 78.4536000)
  RETURNING id INTO v_wh_main;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_branch, 'Branch - Secunderabad',
    '{"line1":"8 Trunk Road","city":"Secunderabad","state":"TS","pincode":"500003"}'::jsonb, 'active', false, '[]', 17.4399000, 78.4983000)
  RETURNING id INTO v_wh_branch;

  -- 5. Tenant brands
  INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
  SELECT v_tenant_id, b.id, true FROM catalog.brands b
  WHERE b.slug IN ('polycab', 'havells', 'anchor') AND b.is_public = true;

  -- 6. Tenant categories
  INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
  SELECT v_tenant_id, c.id, c.name, c.slug, 'approved', true, v_seller_user_id, v_seller_user_id
  FROM catalog.categories c
  WHERE c.slug IN ('wires-cables', 'mcb-switchgear', 'modular-switches-sockets', 'fans', 'lighting-led', 'distribution-boards')
    AND c.is_public = true;

  -- 7. Tenant products
  INSERT INTO app.tenant_products (tenant_id, tenant_brand_id, master_product_id, internal_sku, mrp, base_selling_price, cost_price, is_active)
  SELECT v_tenant_id, tb.id, p.id, p.master_sku, v.mrp, v.base_rate,
         round((v.base_rate * (1 - (0.05 + random() * 0.15)))::numeric, 2), true
  FROM (VALUES
    ('ELE-PLC-WIRE15', 1610, 1420),
    ('ELE-PLC-WIRE25', 2480, 2190),
    ('ELE-PLC-WIRE40', 3850, 3410),
    ('ELE-HAV-MCB16C', 185,  178),
    ('ELE-HAV-MCB32C', 245,  230),
    ('ELE-HAV-RCCB25', 1890, 1750),
    ('ELE-HAV-DB8SPN', 1240, 1150),
    ('ELE-ANC-SW6A10', 640,  576),  -- base rate not given in spec; estimated as mrp * 0.90
    ('ELE-ANC-SOC16A', 185,  166),  -- estimated
    ('ELE-HAV-FAN1200',2350, 2150),
    ('ELE-HAV-LED9W10',950,  855),  -- estimated
    ('ELE-PLC-BAT20W', 420,  378),  -- estimated
    ('ELE-HAV-EXH150', 980,  882),  -- estimated
    ('ELE-ANC-ROSE',   65,   58),   -- estimated
    ('ELE-HAV-ELCB40', 2650, 2385)  -- estimated
  ) AS v(master_sku, mrp, base_rate)
  JOIN catalog.products p ON p.master_sku = v.master_sku AND p.is_public = true
  JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = v_tenant_id;

  -- 8. Inventory — split across both warehouses
  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_main, 40 + (abs(hashtext(tp.internal_sku)) % 60), 0, 10
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_branch, 10 + (abs(hashtext(tp.internal_sku || 'b')) % 25), 0, 5
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  -- 9. Buyers (invented industry-plausible business names; spec gives cohort *types*, not real names)
  INSERT INTO app.buyers (tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled)
  VALUES
    (v_tenant_id, 'Sri Balaji Electricals',            'Ramesh Reddy',   '9812340001', 'ramesh@sribalajielec.in',   '36AABCS1111H1Z1', '{"city":"Hyderabad","state":"TS"}'::jsonb,    'A', true, true),
    (v_tenant_id, 'Venkateswara Electric Works',        'Srinivas Rao',   '9812340002', 'srinivas@vew.in',           '36AABCV2222H1Z2', '{"city":"Hyderabad","state":"TS"}'::jsonb,    'A', true, true),
    (v_tenant_id, 'Hyderabad Electric Traders',         'Anil Kumar',     '9812340003', 'anil@hyderabadelectric.in', '36AABCH3333H1Z3', '{"city":"Hyderabad","state":"TS"}'::jsonb,    'A', true, true),
    (v_tenant_id, 'Secunderabad Electric Mart',         'Praveen Goud',   '9812340004', 'praveen@secelectric.in',    '36AABCS4444H1Z4', '{"city":"Secunderabad","state":"TS"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'New Light House Electricals',        'Suresh Babu',    '9812340005', 'suresh@newlighthouse.in',   NULL,               '{"city":"Secunderabad","state":"TS"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'Sri Ganesh Electricals',              'Naveen Chandra', '9812340006', 'naveen@sriganeshelec.in',   NULL,               '{"city":"Secunderabad","state":"TS"}'::jsonb, 'B', true, true),
    (v_tenant_id, 'Metro Infra Electricals Pvt Ltd',     'Vikram Singh',   '9812340007', 'vikram@metroinfra.in',      '36AABCM5555H1Z5', '{"city":"Hyderabad","state":"TS"}'::jsonb,    'C', true, true),
    (v_tenant_id, 'Skyline Contractors & Electricals',   'Manoj Verma',    '9812340008', 'manoj@skylinecontractors.in','36AABCM6666H1Z6', '{"city":"Hyderabad","state":"TS"}'::jsonb,    'C', true, true);

  -- 10. Cohorts + static membership (manual, no rule evaluation — kept simple for demo)
  INSERT INTO app.cohorts (tenant_id, name, description, rules, is_static, cached_member_count, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'A-class Electrician (Hyderabad)', 'High-frequency electrician accounts in Hyderabad', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'B-class Retailer (Secunderabad)',  'Retail counter accounts in Secunderabad',          '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Project Contractor',                'Project-rate contractor accounts with own credit terms', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'A-class Electrician (Hyderabad)' LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'B-class Retailer (Secunderabad)' LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Project Contractor' LIMIT 1;

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

  -- 11. Price lists — "Monsoon Stock-Up" campaign rates for A/B cohorts; a deeper contractor rate for cohort C
  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Monsoon Stock-Up Rates', 'INR', now(), NULL, 20, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_main;

  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Project Contractor Rates', 'INR', now(), NULL, 30, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_contractor;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, valid_from, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_main, 'cohort', v_cohort_a, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_b, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_contractor, 'cohort', v_cohort_c, now(), now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_main, tp.id, v.campaign_rate, 1, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM (VALUES
    ('ELE-PLC-WIRE15', 1289), ('ELE-PLC-WIRE25', 1990), ('ELE-PLC-WIRE40', 3100),
    ('ELE-HAV-MCB16C', 164),  ('ELE-HAV-MCB32C', 212),  ('ELE-HAV-RCCB25', 1610),
    ('ELE-HAV-DB8SPN', 1050), ('ELE-ANC-SW6A10', 575),  ('ELE-ANC-SOC16A', 165),
    ('ELE-HAV-FAN1200',1940), ('ELE-HAV-LED9W10',840),  ('ELE-PLC-BAT20W', 365),
    ('ELE-HAV-EXH150', 870),  ('ELE-ANC-ROSE',   58),   ('ELE-HAV-ELCB40', 2410)
  ) AS v(master_sku, campaign_rate)
  JOIN app.tenant_products tp ON tp.internal_sku = v.master_sku AND tp.tenant_id = v_tenant_id;

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_contractor, tp.id, round(pli.price * 0.97, 2), 5, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.price_list_items pli
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pli.price_list_id = v_pl_main;

  -- 12. Campaign — "Monsoon Stock-Up" (matches the spec's flagship demo walkthrough), targeted at cohort A
  INSERT INTO app.campaigns (tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Monsoon Stock-Up', 'cohort', jsonb_build_object('cohort_id', v_cohort_a),
    now() - interval '3 days', now() + interval '25 days', 'published',
    NULL, 'Stock up before the monsoon rush — special rates on wires, MCBs and switchgear.', 'electricals-demo-monsoon-stockup',
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

SELECT 'electricals-demo' AS tenant, 'tenant_products' AS metric, count(*)::text AS value
FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id WHERE t.slug = 'electricals-demo'
UNION ALL
SELECT 'electricals-demo', 'buyers', count(*)::text FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id WHERE t.slug = 'electricals-demo'
UNION ALL
SELECT 'electricals-demo', 'cohorts', count(*)::text FROM app.cohorts c JOIN app.tenants t ON t.id = c.tenant_id WHERE t.slug = 'electricals-demo'
UNION ALL
SELECT 'electricals-demo', 'campaigns_published', count(*)::text FROM app.campaigns ca JOIN app.tenants t ON t.id = ca.tenant_id WHERE t.slug = 'electricals-demo' AND ca.status = 'published';
