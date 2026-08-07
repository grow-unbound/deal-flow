-- ============================================================
-- Demo tenant — Mobiles & Electronics distributor (handsets/accessories to retail counters)
--
-- Additive only — never truncates anything. Idempotent: no-ops if the
-- 'mobiles-electronics-demo' tenant already exists. Run after
-- 00_shared_catalog.sql. Reuses the shared seller test login
-- (santosh.phani@gmail.com, seller_admin).
--
-- Pricing: mrp = spec MRP, base_selling_price = spec Base Rate,
-- cost_price = base_selling_price * (1 - random 5-20% margin).
-- Apple charger is MRP-protected (mrp = base = campaign rate, per spec).
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
  v_cohort_a uuid; -- Retail counter A-class
  v_cohort_b uuid; -- Tier-2 town retailer
  v_cohort_c uuid; -- Online/kirana hybrid seller
  v_pl_main uuid;
  v_campaign_id uuid;
BEGIN
  SET LOCAL row_security = OFF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE slug = 'mobiles-electronics-demo') THEN
    RAISE NOTICE 'mobiles-electronics-demo tenant already exists — skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_seller_user_id) THEN
    RAISE EXCEPTION 'Shared seller auth user % not found — run supabase/seed.sql first.', v_seller_user_id;
  END IF;

  INSERT INTO app.tenants (slug, business_name, subdomain, gstin, primary_state, plan, whatsapp_purchased_credits_balance)
  VALUES ('mobiles-electronics-demo', 'Digital Wave Mobiles Distribution', 'mobiles-electronics-demo', '29AAECD8821H1Z2', 'KA', 'starter', 0)
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, joined_at, phone)
  VALUES (v_tenant_id, v_seller_user_id, 'seller_admin', true, now(), '9441479686');

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, jsonb_build_object(
    'delivery_routing_threshold_km', 50,
    'business_policy', jsonb_build_object('gst_rate', 18)
  ), v_seller_user_id);

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse - Bangalore',
    '{"line1":"45 SP Road Electronics Market","city":"Bangalore","state":"KA","pincode":"560002"}'::jsonb, 12.9784000, 77.5788000, true)
  RETURNING id INTO v_loc_main;

  INSERT INTO app.locations (id, tenant_id, name, address, lat, lng, is_default)
  VALUES (gen_random_uuid(), v_tenant_id, 'Branch - Chennai',
    '{"line1":"22 Ritchie Street","city":"Chennai","state":"TN","pincode":"600002"}'::jsonb, 13.0569000, 80.2645000, false)
  RETURNING id INTO v_loc_branch;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_main, 'Main Warehouse - Bangalore',
    '{"line1":"45 SP Road Electronics Market","city":"Bangalore","state":"KA","pincode":"560002"}'::jsonb, 'active', true, '[]', 12.9784000, 77.5788000)
  RETURNING id INTO v_wh_main;

  INSERT INTO app.warehouses (id, tenant_id, location_id, name, address, status, is_default, associated_users, lat, lng)
  VALUES (gen_random_uuid(), v_tenant_id, v_loc_branch, 'Branch - Chennai',
    '{"line1":"22 Ritchie Street","city":"Chennai","state":"TN","pincode":"600002"}'::jsonb, 'active', false, '[]', 13.0569000, 80.2645000)
  RETURNING id INTO v_wh_branch;

  INSERT INTO app.tenant_brands (tenant_id, master_brand_id, is_active)
  SELECT v_tenant_id, b.id, true FROM catalog.brands b
  WHERE b.slug IN ('samsung', 'vivo', 'xiaomi', 'motorola', 'apple', 'boat') AND b.is_public = true;

  INSERT INTO app.tenant_categories (tenant_id, master_category_id, name, slug, review_status, is_active, created_by, updated_by)
  SELECT v_tenant_id, c.id, c.name, c.slug, 'approved', true, v_seller_user_id, v_seller_user_id
  FROM catalog.categories c
  WHERE c.slug IN ('smartphones', 'accessories', 'audio', 'small-appliances') AND c.is_public = true;

  INSERT INTO app.tenant_products (tenant_id, tenant_brand_id, master_product_id, internal_sku, mrp, base_selling_price, cost_price, is_active)
  SELECT v_tenant_id, tb.id, p.id, p.master_sku, v.mrp, v.base_rate,
         round(v.base_rate * (1 - (0.05 + random() * 0.15)), 2), true
  FROM (VALUES
    ('MOB-SAM-A16-128', 18999, 17200),
    ('MOB-SAM-M35-128', 19999, 18100),
    ('MOB-VIV-Y29-128', 15999, 14500),
    ('MOB-VIV-T4-128',  22999, 20900),
    ('MOB-XMI-14C-128',  9999, 9050),
    ('MOB-XMI-M7P-5G',  13999, 12650),
    ('MOB-MOT-E60F',    21999, 19900),
    ('MOB-APL-CHG20W',   1900, 1900), -- MRP-protected, no margin
    ('MOB-SAM-CHG25W',   1499, 1320),
    ('MOB-BOT-RKZ450',   1499, 1290),
    ('MOB-BOT-AD141',    1299, 1120),
    ('MOB-VIV-GLASS',     299, 210),
    ('MOB-XMI-PB10K',    1299, 1090),
    ('MOB-SAM-USBC1M',    499, 390),
    ('MOB-GEN-CASE',      249, 150)
  ) AS v(master_sku, mrp, base_rate)
  JOIN catalog.products p ON p.master_sku = v.master_sku AND p.is_public = true
  JOIN app.tenant_brands tb ON tb.master_brand_id = p.brand_id AND tb.tenant_id = v_tenant_id;

  -- Apple charger is MRP-protected: pin cost_price to a thin fixed margin instead of the random 5-20% band.
  UPDATE app.tenant_products SET cost_price = 1750
  WHERE tenant_id = v_tenant_id AND internal_sku = 'MOB-APL-CHG20W';

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_main,
         CASE WHEN tp.base_selling_price > 15000 THEN 8 + (abs(hashtext(tp.internal_sku)) % 12) ELSE 30 + (abs(hashtext(tp.internal_sku)) % 50) END,
         0, CASE WHEN tp.base_selling_price > 15000 THEN 3 ELSE 10 END
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.tenant_inventory (tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point)
  SELECT tp.id, v_wh_branch,
         CASE WHEN tp.base_selling_price > 15000 THEN 3 + (abs(hashtext(tp.internal_sku || 'b')) % 6) ELSE 10 + (abs(hashtext(tp.internal_sku || 'b')) % 20) END,
         0, CASE WHEN tp.base_selling_price > 15000 THEN 2 ELSE 5 END
  FROM app.tenant_products tp WHERE tp.tenant_id = v_tenant_id;

  INSERT INTO app.buyers (tenant_id, business_name, contact_name, phone, email, gstin, geography, tier, is_active, buyer_app_enabled)
  VALUES
    (v_tenant_id, 'Cellcom Mobile Zone',           'Arjun Nair',      '9823450001', 'arjun@cellcomzone.in',      '29AABCC1111H1Z1', '{"city":"Bangalore","state":"KA"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Digital Point Mobiles',         'Karthik Iyer',    '9823450002', 'karthik@digitalpoint.in',   '33AABCD2222H1Z2', '{"city":"Chennai","state":"TN"}'::jsonb,   'A', true, true),
    (v_tenant_id, 'Prime Mobile Hub',              'Sandeep Rao',     '9823450003', 'sandeep@primemobilehub.in', '29AABCP3333H1Z3', '{"city":"Bangalore","state":"KA"}'::jsonb, 'A', true, true),
    (v_tenant_id, 'Rathi Mobile Store',            'Deepak Rathi',    '9823450004', 'deepak@rathimobile.in',     NULL,               '{"city":"Nashik","state":"MH"}'::jsonb,    'B', true, true),
    (v_tenant_id, 'Sri Krishna Mobiles',           'Ravi Teja',       '9823450005', 'ravi@srikrishnamobiles.in', NULL,               '{"city":"Warangal","state":"TS"}'::jsonb,  'B', true, true),
    (v_tenant_id, 'New Star Communications',       'Faizan Ahmed',    '9823450006', 'faizan@newstarcomm.in',     NULL,               '{"city":"Rajahmundry","state":"AP"}'::jsonb,'B', true, true),
    (v_tenant_id, 'QuickBuy Mobile & Electronics', 'Meena Krishnan',  '9823450007', 'meena@quickbuymobile.in',   '29AABCQ4444H1Z4', '{"city":"Bangalore","state":"KA"}'::jsonb, 'C', true, true),
    (v_tenant_id, 'SmartConnect Retail',            'Ganesh Pillai',   '9823450008', 'ganesh@smartconnect.in',    NULL,               '{"city":"Chennai","state":"TN"}'::jsonb,   'C', true, true);

  INSERT INTO app.cohorts (tenant_id, name, description, rules, is_static, cached_member_count, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'Retail Counter A-class',          'Fast-moving, dues-sensitive retail counters', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Tier-2 Town Retailer',             'Slower-moving retailers ordering bulk-on-scheme', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Online/Kirana Hybrid Seller',      'Hybrid counters selling online and offline', '{}'::jsonb, true, 0, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Retail Counter A-class' LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Tier-2 Town Retailer' LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Online/Kirana Hybrid Seller' LIMIT 1;

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
  VALUES (v_tenant_id, 'Price Drop Alert Rates', 'INR', now(), NULL, 20, true, now(), now(), v_seller_user_id, v_seller_user_id)
  RETURNING id INTO v_pl_main;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, valid_from, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_main, 'cohort', v_cohort_a, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_b, now(), now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_main, 'cohort', v_cohort_c, now(), now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, valid_from, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_main, tp.id, v.campaign_rate, 1, NULL, now(), now(), now(), v_seller_user_id, v_seller_user_id
  FROM (VALUES
    ('MOB-SAM-A16-128', 16450), ('MOB-SAM-M35-128', 17300), ('MOB-VIV-Y29-128', 13800),
    ('MOB-VIV-T4-128',  19950), ('MOB-XMI-14C-128', 8600),  ('MOB-XMI-M7P-5G',  12050),
    ('MOB-MOT-E60F',    18950), ('MOB-APL-CHG20W',  1900),  ('MOB-SAM-CHG25W',  1240),
    ('MOB-BOT-RKZ450',  1190),  ('MOB-BOT-AD141',   1030),  ('MOB-VIV-GLASS',   180),
    ('MOB-XMI-PB10K',   990),   ('MOB-SAM-USBC1M',  350),   ('MOB-GEN-CASE',    125)
  ) AS v(master_sku, campaign_rate)
  JOIN app.tenant_products tp ON tp.internal_sku = v.master_sku AND tp.tenant_id = v_tenant_id;

  INSERT INTO app.campaigns (tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by)
  VALUES (v_tenant_id, 'Price Drop Alert', 'cohort', jsonb_build_object('cohort_id', v_cohort_a),
    now() - interval '2 days', now() + interval '14 days', 'published',
    NULL, 'Prices just dropped on fast-moving models — order before stock runs out.', 'mobiles-electronics-demo-price-drop',
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

SELECT 'mobiles-electronics-demo' AS tenant, 'tenant_products' AS metric, count(*)::text AS value
FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id WHERE t.slug = 'mobiles-electronics-demo'
UNION ALL
SELECT 'mobiles-electronics-demo', 'buyers', count(*)::text FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id WHERE t.slug = 'mobiles-electronics-demo'
UNION ALL
SELECT 'mobiles-electronics-demo', 'cohorts', count(*)::text FROM app.cohorts c JOIN app.tenants t ON t.id = c.tenant_id WHERE t.slug = 'mobiles-electronics-demo'
UNION ALL
SELECT 'mobiles-electronics-demo', 'campaigns_published', count(*)::text FROM app.campaigns ca JOIN app.tenants t ON t.id = ca.tenant_id WHERE t.slug = 'mobiles-electronics-demo' AND ca.status = 'published';
