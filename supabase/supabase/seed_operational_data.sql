-- ============================================================
-- DealFlow Operational Seed — Cohorts, Price Lists, Catalogs, Orders
--
-- This file is append-safe and tenant-scoped for slug = 'techwave'.
-- Run after supabase/supabase/seed.sql.
-- ============================================================

-- Compatibility guard if deleted_at migration has not been applied yet.
ALTER TABLE IF EXISTS app.buyers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.cohorts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.price_lists ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.published_catalogs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.tenant_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.locations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
DECLARE
  v_tenant_id uuid;
  v_seller_user_id uuid;

  v_cohort_a uuid;
  v_cohort_b uuid;
  v_cohort_c uuid;

  v_pl_all uuid;
  v_pl_cohort uuid;
  v_pl_buyer uuid;
  v_pl_expired uuid;

  v_catalog_all uuid;
  v_catalog_cohort uuid;
  v_catalog_draft uuid;

  v_day date;
  v_order_count integer;
  v_i integer;

  v_order_id uuid;
  v_order_number text;
  v_buyer_id uuid;
  v_catalog_id uuid;
  v_status text;
  v_source text;

  v_items integer;
  v_j integer;
  v_tp_id uuid;
  v_price numeric;
  v_tax numeric;
  v_qty numeric;
  v_line numeric;
  v_subtotal numeric;
  v_tax_total numeric;
BEGIN
  SELECT id INTO v_tenant_id
  FROM app.tenants
  WHERE slug = 'techwave'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'techwave tenant not found. Run seed.sql first.';
  END IF;

  SELECT user_id INTO v_seller_user_id
  FROM app.tenant_users
  WHERE tenant_id = v_tenant_id
    AND role = 'seller_admin'
    AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_seller_user_id IS NULL THEN
    RAISE EXCEPTION 'seller_admin user not found for techwave.';
  END IF;

  -- Ensure buyer tiers for deterministic cohorts
  UPDATE app.buyers
  SET tier = CASE
      WHEN business_name ILIKE '%Kumar%' THEN 'A'
      WHEN business_name ILIKE '%Singh%' THEN 'B'
      ELSE 'C'
    END,
    updated_at = now(),
    updated_by = v_seller_user_id
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND deleted_at IS NULL
    AND tier IS NULL;

  -- Cohorts
  INSERT INTO app.cohorts (
    tenant_id, name, description, rules, is_static, cached_member_count,
    created_at, updated_at, created_by, updated_by
  )
  SELECT v_tenant_id, x.name, x.description, x.rules, false, 0,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM (
    VALUES
      ('Premium Buyers', 'Tier A high-value accounts', '{"filters":[{"field":"tier","operator":"eq","value":"A"}]}'::jsonb),
      ('Growth Accounts', 'Tier B growth cohort', '{"filters":[{"field":"tier","operator":"eq","value":"B"}]}'::jsonb),
      ('Value Accounts', 'Tier C value-driven accounts', '{"filters":[{"field":"tier","operator":"eq","value":"C"}]}'::jsonb)
  ) x(name, description, rules)
  WHERE NOT EXISTS (
    SELECT 1 FROM app.cohorts c
    WHERE c.tenant_id = v_tenant_id
      AND c.name = x.name
      AND c.deleted_at IS NULL
  );

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Premium Buyers' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Growth Accounts' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Value Accounts' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_a, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'A'
  ON CONFLICT DO NOTHING;

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_b, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'B'
  ON CONFLICT DO NOTHING;

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_c, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'C'
  ON CONFLICT DO NOTHING;

  UPDATE app.cohorts c
  SET cached_member_count = (SELECT count(*) FROM app.cohort_members cm WHERE cm.cohort_id = c.id),
      updated_at = now(), updated_by = v_seller_user_id
  WHERE c.tenant_id = v_tenant_id AND c.deleted_at IS NULL;

  -- Price lists
  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  SELECT v_tenant_id, x.name, 'INR', x.valid_from, x.valid_to, x.priority, x.is_active,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM (
    VALUES
      ('All Buyers Base', now() - interval '20 days', NULL::timestamptz, 10, true),
      ('Premium Cohort Advantage', now() - interval '12 days', NULL::timestamptz, 30, true),
      ('Special Buyer Contract', now() - interval '10 days', now() + interval '20 days', 40, true),
      ('Expired Festival Promo', now() - interval '40 days', now() - interval '15 days', 5, false)
  ) x(name, valid_from, valid_to, priority, is_active)
  WHERE NOT EXISTS (
    SELECT 1 FROM app.price_lists pl
    WHERE pl.tenant_id = v_tenant_id
      AND pl.name = x.name
      AND pl.deleted_at IS NULL
  );

  SELECT id INTO v_pl_all FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'All Buyers Base' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_cohort FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Premium Cohort Advantage' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_buyer FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Special Buyer Contract' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_expired FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Expired Festival Promo' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_all, 'all_buyers', NULL, now(), now(), v_seller_user_id, v_seller_user_id
  WHERE NOT EXISTS (SELECT 1 FROM app.price_list_assignments WHERE price_list_id = v_pl_all AND target_type = 'all_buyers' AND target_id IS NULL);

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_cohort, 'cohort', v_cohort_a, now(), now(), v_seller_user_id, v_seller_user_id
  WHERE NOT EXISTS (SELECT 1 FROM app.price_list_assignments WHERE price_list_id = v_pl_cohort AND target_type = 'cohort' AND target_id = v_cohort_a);

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_buyer, 'buyer', b.id, now(), now(), v_seller_user_id, v_seller_user_id
  FROM (SELECT id FROM app.buyers WHERE tenant_id = v_tenant_id AND is_active = true AND deleted_at IS NULL ORDER BY created_at LIMIT 1) b
  WHERE NOT EXISTS (SELECT 1 FROM app.price_list_assignments WHERE price_list_id = v_pl_buyer AND target_type = 'buyer' AND target_id = b.id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_all, tp.id, round(tp.base_selling_price * 0.98, 2), 1, NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.price_list_items pli
      WHERE pli.price_list_id = v_pl_all AND pli.tenant_product_id = tp.id AND pli.min_qty = 1
    );

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_cohort, tp.id, round(tp.base_selling_price * 0.95, 2), 1, NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  JOIN catalog.products p ON p.id = tp.master_product_id
  JOIN catalog.categories c ON c.id = p.category_id
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
    AND c.slug IN ('smartphones', 'tablets')
    AND NOT EXISTS (
      SELECT 1 FROM app.price_list_items pli
      WHERE pli.price_list_id = v_pl_cohort AND pli.tenant_product_id = tp.id AND pli.min_qty = 1
    );

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_expired, tp.id, round(tp.base_selling_price * 0.90, 2), 2, 5,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.price_list_items pli
      WHERE pli.price_list_id = v_pl_expired AND pli.tenant_product_id = tp.id AND pli.min_qty = 2
    );

  -- Catalogs
  INSERT INTO app.published_catalogs (
    tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by
  ) VALUES
    (v_tenant_id, 'Weekly Fast Movers', 'all', '{}'::jsonb, now() - interval '7 days', now() + interval '20 days', 'published',
     'https://example.com/catalog-fast-movers.jpg', 'Fast moving SKUs for all buyers', 'techwave-fast-movers', now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Premium Device Program', 'cohort', jsonb_build_object('cohort_id', v_cohort_a), now() - interval '5 days', now() + interval '25 days', 'published',
     'https://example.com/catalog-premium.jpg', 'Premium assortment for cohort accounts', 'techwave-premium-program', now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Draft Curated Picks', 'buyer',
     (SELECT jsonb_build_object('buyer_id', id) FROM app.buyers WHERE tenant_id = v_tenant_id AND is_active = true AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
     now(), now() + interval '10 days', 'draft',
     'https://example.com/catalog-draft.jpg', 'Draft-only curated picks', 'techwave-draft-picks', now(), now(), v_seller_user_id, v_seller_user_id)
  ON CONFLICT (share_token) DO UPDATE
    SET deleted_at = NULL,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by,
        name = EXCLUDED.name,
        scope_type = EXCLUDED.scope_type,
        scope_value = EXCLUDED.scope_value,
        status = EXCLUDED.status,
        valid_from = EXCLUDED.valid_from,
        valid_to = EXCLUDED.valid_to;

  SELECT id INTO v_catalog_all FROM app.published_catalogs WHERE tenant_id = v_tenant_id AND share_token = 'techwave-fast-movers' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_catalog_cohort FROM app.published_catalogs WHERE tenant_id = v_tenant_id AND share_token = 'techwave-premium-program' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_catalog_draft FROM app.published_catalogs WHERE tenant_id = v_tenant_id AND share_token = 'techwave-draft-picks' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.published_catalog_items (catalog_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_catalog_all, tp.id, (row_number() OVER (ORDER BY tp.created_at, tp.id) % 4 = 0), row_number() OVER (ORDER BY tp.created_at, tp.id), NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
  ORDER BY tp.created_at, tp.id
  LIMIT 12
  ON CONFLICT (catalog_id, tenant_product_id) DO NOTHING;

  INSERT INTO app.published_catalog_items (catalog_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_catalog_cohort, tp.id, (row_number() OVER (ORDER BY tp.created_at, tp.id) % 3 = 0), row_number() OVER (ORDER BY tp.created_at, tp.id), round(tp.base_selling_price * 0.96, 2),
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  JOIN catalog.products p ON p.id = tp.master_product_id
  JOIN catalog.categories c ON c.id = p.category_id
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
    AND c.slug IN ('smartphones', 'tablets', 'wearables')
  ORDER BY tp.created_at, tp.id
  LIMIT 10
  ON CONFLICT (catalog_id, tenant_product_id) DO NOTHING;

  INSERT INTO app.published_catalog_items (catalog_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_catalog_draft, tp.id, false, row_number() OVER (ORDER BY tp.created_at DESC, tp.id DESC), NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
  ORDER BY tp.created_at DESC, tp.id DESC
  LIMIT 8
  ON CONFLICT (catalog_id, tenant_product_id) DO NOTHING;

  -- Orders for last 14 days
  FOR v_day IN SELECT generate_series(current_date - 13, current_date, interval '1 day')::date LOOP
    v_order_count := CASE WHEN extract(isodow FROM v_day) IN (6, 7) THEN 2 ELSE 5 END;

    FOR v_i IN 1..v_order_count LOOP
      v_order_number := format('DF-%s-%s', to_char(v_day, 'YYYYMMDD'), lpad(v_i::text, 3, '0'));

      SELECT b.id INTO v_buyer_id
      FROM app.buyers b
      WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL
      ORDER BY md5(b.id::text || v_order_number)
      LIMIT 1;

      v_source := CASE v_i % 3 WHEN 0 THEN 'buyer_app' WHEN 1 THEN 'cockpit_manual' ELSE 'csv_import' END;
      v_status := CASE ((extract(day FROM v_day)::int + v_i) % 7)
        WHEN 0 THEN 'received'
        WHEN 1 THEN 'confirmed'
        WHEN 2 THEN 'partially_dispatched'
        WHEN 3 THEN 'dispatched'
        WHEN 4 THEN 'delivered'
        WHEN 5 THEN 'cancelled'
        ELSE 'delivered'
      END;

      v_catalog_id := CASE WHEN v_i % 3 = 0 THEN v_catalog_cohort WHEN v_i % 2 = 0 THEN v_catalog_all ELSE NULL END;

      INSERT INTO app.orders (
        tenant_id, buyer_id, placed_by, order_number, status, source, catalog_id,
        subtotal, tax_amount, total_amount, currency, notes, placed_at,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_tenant_id, v_buyer_id, v_seller_user_id, v_order_number, v_status, v_source, v_catalog_id,
        0, 0, 0, 'INR', 'Operational seed order',
        v_day::timestamptz + make_interval(hours => 10 + (v_i % 7), mins => (v_i * 9) % 60),
        now(), now(), v_seller_user_id, v_seller_user_id
      )
      ON CONFLICT (tenant_id, order_number) DO UPDATE
        SET deleted_at = NULL,
            buyer_id = EXCLUDED.buyer_id,
            status = EXCLUDED.status,
            source = EXCLUDED.source,
            catalog_id = EXCLUDED.catalog_id,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
      RETURNING id INTO v_order_id;

      DELETE FROM app.order_items WHERE order_id = v_order_id;

      v_subtotal := 0;
      v_tax_total := 0;
      v_items := 1 + ((extract(day FROM v_day)::int + v_i) % 4);

      FOR v_j IN 1..v_items LOOP
        SELECT tp.id, COALESCE(tp.base_selling_price, 1000), COALESCE(p.gst_rate, 18)
        INTO v_tp_id, v_price, v_tax
        FROM app.tenant_products tp
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
        ORDER BY md5(tp.id::text || v_order_number || v_j::text)
        LIMIT 1;

        v_qty := CASE WHEN v_price < 2000 THEN 2 + (v_j % 5) WHEN v_price < 30000 THEN 1 + (v_j % 3) ELSE 1 + (v_j % 2) END;
        v_price := round(v_price * (0.94 + ((v_j + v_i) % 6) * 0.01), 2);
        v_line := round(v_qty * v_price, 2);

        INSERT INTO app.order_items (
          order_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
          created_at, updated_at, created_by, updated_by
        ) VALUES (
          v_order_id, v_tp_id, v_qty, v_price, v_tax, v_line,
          now(), now(), v_seller_user_id, v_seller_user_id
        );

        v_subtotal := v_subtotal + v_line;
        v_tax_total := v_tax_total + round(v_line * (v_tax / 100.0), 2);
      END LOOP;

      UPDATE app.orders
      SET subtotal = round(v_subtotal, 2),
          tax_amount = round(v_tax_total, 2),
          total_amount = round(v_subtotal + v_tax_total, 2),
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = v_order_id;

      INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
      VALUES (
        v_tenant_id, v_seller_user_id, 'order', v_order_id, 'status_change',
        jsonb_build_object('order_number', v_order_number, 'status', v_status, 'source', v_source),
        now()
      );
    END LOOP;
  END LOOP;
END $$;

-- Quick verification snapshot
SELECT 'cohorts' AS metric, count(*)::text AS value
FROM app.cohorts c
JOIN app.tenants t ON t.id = c.tenant_id
WHERE t.slug = 'techwave' AND c.deleted_at IS NULL
UNION ALL
SELECT 'price_lists', count(*)::text
FROM app.price_lists pl
JOIN app.tenants t ON t.id = pl.tenant_id
WHERE t.slug = 'techwave' AND pl.deleted_at IS NULL
UNION ALL
SELECT 'published_catalogs', count(*)::text
FROM app.published_catalogs pc
JOIN app.tenants t ON t.id = pc.tenant_id
WHERE t.slug = 'techwave' AND pc.deleted_at IS NULL
UNION ALL
SELECT 'orders_14d', count(*)::text
FROM app.orders o
JOIN app.tenants t ON t.id = o.tenant_id
WHERE t.slug = 'techwave' AND o.deleted_at IS NULL AND o.placed_at::date >= current_date - 13;
