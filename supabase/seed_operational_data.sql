-- ============================================================
-- yukti Operational Seed — Cohorts, Price Lists, Catalogs,
-- Estimates, Sales Orders (app.orders), Invoices, Payments
--
-- Rerunnable: truncates operational tables for tenant techwave,
-- then inserts a fresh graph (estimates ↔ orders ↔ invoices).
-- Run after supabase/seed.sql.
-- ============================================================

-- Compatibility guard if deleted_at migration has not been applied yet.
ALTER TABLE IF EXISTS app.buyers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.cohorts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.price_lists ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.campaigns ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.tenant_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.locations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE IF EXISTS app.orders ADD COLUMN IF NOT EXISTS estimate_id uuid;

DO $$
DECLARE
  v_tenant_id uuid;
  v_seller_user_id uuid;

  v_buyer_kumar uuid;
  v_buyer_singh uuid;
  v_buyer_patel uuid;
  v_buyer_phani uuid;

  v_cohort_a uuid;
  v_cohort_b uuid;
  v_cohort_c uuid;

  v_pl_all uuid;
  v_pl_cohort uuid;
  v_pl_buyer uuid;
  v_pl_expired uuid;
  v_pl_growth uuid;

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

  v_estimate_id uuid;
  v_invoice_id uuid;
  v_est_seq integer := 1;
  v_inv_seq integer := 1;
  v_conv_idx integer;

  se RECORD;
  v_buy_pick uuid;
  v_sent_at timestamptz;
  v_accepted_at timestamptz;
  v_expires_at timestamptz;

  r_order RECORD;
  r_item RECORD;
  v_item_total integer;
  v_line_idx integer;
  v_partial boolean;
  v_inv_status text;
  v_inv_due timestamptz;
  v_inv_paid_at timestamptz;
  v_inv_outstanding numeric;
  v_inv_sub numeric;
  v_inv_tax numeric;
  v_inv_total numeric;
  v_pay_mode text;
  v_mod integer;

  v_direct_est_id uuid;
  v_direct_inv_id uuid;

  v_line_catalog uuid;
  v_pci_count integer;
BEGIN
  SET LOCAL row_security = OFF;

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

  -- TRUNCATE … CASCADE on cohorts would also truncate app.tenant_brands (FK to cohorts), then tenant_products.
  UPDATE app.tenant_brands
  SET default_cohort_id = NULL,
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE tenant_id = v_tenant_id
    AND default_cohort_id IS NOT NULL
    AND deleted_at IS NULL;

  -- Clear prior operational rows (single-tenant dev seed; techwave only). Cohort rows removed separately (see above).
  EXECUTE $trx$
    TRUNCATE
      app.integration_webhook_event_changes,
      app.integration_webhook_events,
      app.integration_webhook_errors,
      app.integration_webhook_echo_guards,
      app.payments,
      app.credit_notes,
      app.campaign_views,
      app.invoice_items,
      app.invoices,
      app.estimate_items,
      app.estimates,
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
      app.buyers_snapshot,
      app.buyer_current_snapshot,
      app.kpi_buyers_daily,
      app.products_snapshot,
      app.categories_snapshot,
      app.brands_snapshot,
      app.audit_log,
      app.order_items,
      app.orders,
      app.campaign_items,
      app.campaigns,
      app.price_list_assignments,
      app.price_list_items,
      app.price_lists
    RESTART IDENTITY CASCADE
  $trx$;

  DELETE FROM app.cohort_members cm
  USING app.cohorts c
  WHERE cm.cohort_id = c.id AND c.tenant_id = v_tenant_id;

  DELETE FROM app.cohorts
  WHERE tenant_id = v_tenant_id;

  SELECT id INTO v_buyer_kumar
  FROM app.buyers
  WHERE tenant_id = v_tenant_id AND business_name = 'Kumar Electronics' AND deleted_at IS NULL
  LIMIT 1;
  SELECT id INTO v_buyer_singh
  FROM app.buyers
  WHERE tenant_id = v_tenant_id AND business_name = 'Singh Mobile Store' AND deleted_at IS NULL
  LIMIT 1;
  SELECT id INTO v_buyer_patel
  FROM app.buyers
  WHERE tenant_id = v_tenant_id AND business_name = 'Patel Tech Hub' AND deleted_at IS NULL
  LIMIT 1;
  SELECT id INTO v_buyer_phani
  FROM app.buyers
  WHERE tenant_id = v_tenant_id AND (email = 'ksssp.iiith@gmail.com' OR business_name ILIKE '%Phani%')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_buyer_kumar IS NULL OR v_buyer_singh IS NULL OR v_buyer_patel IS NULL OR v_buyer_phani IS NULL THEN
    RAISE EXCEPTION 'Expected seed buyers not found for techwave.';
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
    AND deleted_at IS NULL;

  -- Cohorts
  INSERT INTO app.cohorts (
    tenant_id, name, description, rules, is_static, cached_member_count,
    created_at, updated_at, created_by, updated_by
  )
  VALUES
    (v_tenant_id, 'Premium Buyers', 'Tier A high-value accounts',
     '{"filters":[{"field":"tier","operator":"eq","value":"A"}]}'::jsonb, false, 0,
     now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Growth Accounts', 'Tier B growth cohort',
     '{"filters":[{"field":"tier","operator":"eq","value":"B"}]}'::jsonb, false, 0,
     now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Value Accounts', 'Tier C value-driven accounts',
     '{"filters":[{"field":"tier","operator":"eq","value":"C"}]}'::jsonb, false, 0,
     now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_cohort_a FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Premium Buyers' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_cohort_b FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Growth Accounts' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_cohort_c FROM app.cohorts WHERE tenant_id = v_tenant_id AND name = 'Value Accounts' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_a, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'A';

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_b, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'B';

  INSERT INTO app.cohort_members (cohort_id, buyer_id)
  SELECT v_cohort_c, b.id
  FROM app.buyers b
  WHERE b.tenant_id = v_tenant_id AND b.is_active = true AND b.deleted_at IS NULL AND b.tier = 'C';

  UPDATE app.cohorts c
  SET cached_member_count = (SELECT count(*) FROM app.cohort_members cm WHERE cm.cohort_id = c.id),
      updated_at = now(), updated_by = v_seller_user_id
  WHERE c.tenant_id = v_tenant_id AND c.deleted_at IS NULL;

  -- Price lists
  INSERT INTO app.price_lists (tenant_id, name, currency, valid_from, valid_to, priority, is_active, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_tenant_id, 'All Buyers Base', 'INR', now() - interval '20 days', NULL::timestamptz, 10, true, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Premium Cohort Advantage', 'INR', now() - interval '12 days', NULL::timestamptz, 30, true, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Special Buyer Contract', 'INR', now() - interval '10 days', now() + interval '20 days', 40, true, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Expired Festival Promo', 'INR', now() - interval '40 days', now() - interval '15 days', 5, false, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Growth Cohort Essentials', 'INR', now() - interval '15 days', NULL::timestamptz, 25, true, now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_pl_all FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'All Buyers Base' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_cohort FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Premium Cohort Advantage' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_buyer FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Special Buyer Contract' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_expired FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Expired Festival Promo' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_pl_growth FROM app.price_lists WHERE tenant_id = v_tenant_id AND name = 'Growth Cohort Essentials' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id, created_at, updated_at, created_by, updated_by)
  VALUES
    (v_pl_all, 'all_buyers', NULL, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_cohort, 'cohort', v_cohort_a, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_growth, 'cohort', v_cohort_b, now(), now(), v_seller_user_id, v_seller_user_id),
    (v_pl_buyer, 'buyer', v_buyer_patel, now(), now(), v_seller_user_id, v_seller_user_id);

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_all, tp.id, round(tp.base_selling_price * 0.98, 2), 1, NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL;

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_cohort, tp.id, round(tp.base_selling_price * 0.95, 2), 1, NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  JOIN catalog.products p ON p.id = tp.master_product_id
  JOIN catalog.categories c ON c.id = p.category_id
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
    AND c.slug IN ('smartphones', 'tablets');

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_expired, tp.id, round(tp.base_selling_price * 0.90, 2), 2, 5,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL;

  INSERT INTO app.price_list_items (price_list_id, tenant_product_id, price, min_qty, max_qty, created_at, updated_at, created_by, updated_by)
  SELECT v_pl_growth, tp.id, round(tp.base_selling_price * 0.93, 2), 1, NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  JOIN catalog.products p ON p.id = tp.master_product_id
  JOIN catalog.categories c ON c.id = p.category_id
  WHERE tp.tenant_id = v_tenant_id
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
    AND c.slug = 'accessories';

  -- Catalogs
  INSERT INTO app.campaigns (
    tenant_id, name, scope_type, scope_value, valid_from, valid_to, status,
    hero_image_url, message, share_token, created_at, updated_at, created_by, updated_by
  ) VALUES
    (v_tenant_id, 'Weekly Fast Movers', 'all', '{}'::jsonb, now() - interval '7 days', now() + interval '20 days', 'published',
     'https://example.com/catalog-fast-movers.jpg', 'Fast moving SKUs for all buyers', 'techwave-fast-movers', now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Premium Device Program', 'cohort', jsonb_build_object('cohort_id', v_cohort_a), now() - interval '5 days', now() + interval '25 days', 'published',
     'https://example.com/catalog-premium.jpg', 'Premium assortment for cohort accounts', 'techwave-premium-program', now(), now(), v_seller_user_id, v_seller_user_id),
    (v_tenant_id, 'Draft Curated Picks', 'buyer',
     jsonb_build_object('buyer_id', v_buyer_patel),
     now(), now() + interval '10 days', 'draft',
     'https://example.com/catalog-draft.jpg', 'Draft-only curated picks', 'techwave-draft-picks', now(), now(), v_seller_user_id, v_seller_user_id);

  SELECT id INTO v_catalog_all FROM app.campaigns WHERE tenant_id = v_tenant_id AND share_token = 'techwave-fast-movers' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_catalog_cohort FROM app.campaigns WHERE tenant_id = v_tenant_id AND share_token = 'techwave-premium-program' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_catalog_draft FROM app.campaigns WHERE tenant_id = v_tenant_id AND share_token = 'techwave-draft-picks' AND deleted_at IS NULL LIMIT 1;

  INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_catalog_all, tp.id, (row_number() OVER (ORDER BY tp.created_at, tp.id) % 4 = 0), row_number() OVER (ORDER BY tp.created_at, tp.id), NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
  ORDER BY tp.created_at, tp.id
  LIMIT 12;

  INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
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
  LIMIT 10;

  INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
  SELECT v_catalog_draft, tp.id, false, row_number() OVER (ORDER BY tp.created_at DESC, tp.id DESC), NULL,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.tenant_products tp
  WHERE tp.tenant_id = v_tenant_id AND tp.is_active = true AND tp.deleted_at IS NULL
  ORDER BY tp.created_at DESC, tp.id DESC
  LIMIT 8;

  -- If category-scoped inserts produced no rows (schema drift), backfill so estimates always have PCI lines.
  IF NOT EXISTS (SELECT 1 FROM app.campaign_items pci WHERE pci.campaign_id = v_catalog_cohort AND pci.deleted_at IS NULL) THEN
    INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
    SELECT v_catalog_cohort, tp.id, false, row_number() OVER (ORDER BY tp.created_at, tp.id), NULL,
           now(), now(), v_seller_user_id, v_seller_user_id
    FROM app.tenant_products tp
    WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL AND tp.is_active = true
    ORDER BY tp.created_at, tp.id
    LIMIT 12;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.campaign_items pci WHERE pci.campaign_id = v_catalog_all AND pci.deleted_at IS NULL) THEN
    INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
    SELECT v_catalog_all, tp.id, (row_number() OVER (ORDER BY tp.created_at, tp.id) % 4 = 0), row_number() OVER (ORDER BY tp.created_at, tp.id), NULL,
           now(), now(), v_seller_user_id, v_seller_user_id
    FROM app.tenant_products tp
    WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL AND tp.is_active = true
    ORDER BY tp.created_at, tp.id
    LIMIT 12;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.campaign_items pci WHERE pci.campaign_id = v_catalog_draft AND pci.deleted_at IS NULL) THEN
    INSERT INTO app.campaign_items (campaign_id, tenant_product_id, is_featured, display_order, price_override, created_at, updated_at, created_by, updated_by)
    SELECT v_catalog_draft, tp.id, false, row_number() OVER (ORDER BY tp.created_at DESC, tp.id DESC), NULL,
           now(), now(), v_seller_user_id, v_seller_user_id
    FROM app.tenant_products tp
    WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL AND tp.is_active = true
    ORDER BY tp.created_at DESC, tp.id DESC
    LIMIT 8;
  END IF;

  -- ── Standalone estimates (lines from catalog; unit_price = app.resolve_price) ──
  FOR se IN SELECT * FROM (
    VALUES
      ('seed-est-draft'::text, 'draft'::text, 'kumar'::text, 'cohort'::text),
      ('seed-est-sent', 'sent', 'singh', 'all'),
      ('seed-est-accepted', 'accepted', 'patel', 'draft'),
      ('seed-est-declined', 'declined', 'kumar', 'all'),
      ('seed-est-expired', 'expired', 'singh', 'cohort'),
      ('seed-est-open-buyer', 'sent', 'phani', 'all')
  ) AS t(ext_ref, st, buyer_key, cat_scope)
  LOOP
    v_buy_pick := CASE se.buyer_key
      WHEN 'kumar' THEN v_buyer_kumar
      WHEN 'singh' THEN v_buyer_singh
      WHEN 'patel' THEN v_buyer_patel
      WHEN 'phani' THEN v_buyer_phani
    END;

    v_line_catalog := CASE se.cat_scope
      WHEN 'cohort' THEN v_catalog_cohort
      WHEN 'draft' THEN v_catalog_draft
      ELSE v_catalog_all
    END;

    v_sent_at := NULL;
    v_accepted_at := NULL;
    v_expires_at := now() + interval '30 days';
    IF se.st IN ('sent', 'accepted', 'declined') THEN
      v_sent_at := now() - interval '4 days';
    END IF;
    IF se.st = 'accepted' THEN
      v_accepted_at := now() - interval '2 days';
    END IF;
    IF se.st = 'expired' THEN
      v_expires_at := now() - interval '3 days';
    END IF;

    INSERT INTO app.estimates (
      tenant_id, buyer_id, estimate_number, status, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, source,
      sent_at, accepted_at, expires_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id, v_buy_pick,
      format('EST-%s-%s', extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
      se.st, v_line_catalog,
      0, 0, 0, 'INR',
      format('Seed estimate via catalog %s + resolve_price()', se.cat_scope),
      'seller',
      v_sent_at, v_accepted_at, v_expires_at, se.ext_ref,
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_estimate_id;

    v_est_seq := v_est_seq + 1;

    SELECT count(*)::int INTO v_pci_count
    FROM app.campaign_items pci
    WHERE pci.campaign_id = v_line_catalog AND pci.deleted_at IS NULL;

    FOR v_j IN 1..2 LOOP
      v_tp_id := NULL;
      IF v_pci_count > 0 THEN
        SELECT pci.tenant_product_id, COALESCE(p.gst_rate, 18)
        INTO v_tp_id, v_tax
        FROM app.campaign_items pci
        JOIN app.tenant_products tp ON tp.id = pci.tenant_product_id AND tp.tenant_id = v_tenant_id
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE pci.campaign_id = v_line_catalog AND pci.deleted_at IS NULL
        ORDER BY pci.display_order, pci.tenant_product_id
        LIMIT 1 OFFSET ((v_j - 1 + abs(hashtext(se.ext_ref || v_j::text))) % v_pci_count);
      END IF;

      IF v_tp_id IS NULL THEN
        SELECT tp.id, COALESCE(p.gst_rate, 18)
        INTO v_tp_id, v_tax
        FROM app.tenant_products tp
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
        ORDER BY tp.created_at, tp.id
        LIMIT 1 OFFSET (v_j - 1);
      END IF;

      IF v_tp_id IS NULL THEN
        RAISE EXCEPTION 'No tenant_products for operational seed (tenant %, catalog %).', v_tenant_id, v_line_catalog;
      END IF;

      v_qty := CASE WHEN v_j = 1 THEN 2 ELSE 1 END;

      v_price := app.resolve_price(v_tp_id, v_buy_pick, v_qty);
      IF v_price IS NULL THEN
        SELECT COALESCE(tp.base_selling_price, 0) INTO v_price
        FROM app.tenant_products tp WHERE tp.id = v_tp_id;
      END IF;
      v_price := round(coalesce(v_price, 0), 2);
      v_line := round(v_qty * v_price, 2);

      INSERT INTO app.estimate_items (
        estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_estimate_id, v_tp_id, v_qty, v_price, v_tax, v_line,
        now(), now(), v_seller_user_id, v_seller_user_id
      );
    END LOOP;

    SELECT
      round(coalesce(sum(line_total), 0), 2),
      round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
    INTO v_subtotal, v_tax_total
    FROM app.estimate_items
    WHERE estimate_id = v_estimate_id AND deleted_at IS NULL;

    UPDATE app.estimates
    SET subtotal = v_subtotal,
        tax_amount = v_tax_total,
        total_amount = round(v_subtotal + v_tax_total, 2),
        updated_at = now(),
        updated_by = v_seller_user_id
    WHERE id = v_estimate_id;

    INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
    VALUES (
      v_tenant_id, v_seller_user_id, 'estimate', v_estimate_id, 'create',
      jsonb_build_object('external_ref', se.ext_ref, 'status', se.st, 'catalog_scope', se.cat_scope),
      now()
    );
  END LOOP;

  -- ── Converted estimate → sales order (4 chains) ─────────────────────────
  FOR v_conv_idx IN 1..4 LOOP
    v_buy_pick := CASE v_conv_idx % 4
      WHEN 1 THEN v_buyer_kumar WHEN 2 THEN v_buyer_singh WHEN 3 THEN v_buyer_patel ELSE v_buyer_phani
    END;

    INSERT INTO app.estimates (
      tenant_id, buyer_id, estimate_number, status, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, source,
      sent_at, accepted_at, expires_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id,
      v_buy_pick,
      format('EST-%s-%s', extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
      'accepted', v_catalog_cohort,
      0, 0, 0, 'INR', 'Seed estimate converted to sales order', 'seller',
      now() - interval '6 days', now() - interval '1 day', now() + interval '20 days',
      format('seed-est-conv-%s', lpad(v_conv_idx::text, 2, '0')),
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_estimate_id;

    v_est_seq := v_est_seq + 1;

    SELECT count(*)::int INTO v_pci_count
    FROM app.campaign_items pci
    WHERE pci.campaign_id = v_catalog_cohort AND pci.deleted_at IS NULL;

    v_items := 2 + (v_conv_idx % 2);
    FOR v_j IN 1..v_items LOOP
      v_tp_id := NULL;
      IF v_pci_count > 0 THEN
        SELECT pci.tenant_product_id, COALESCE(p.gst_rate, 18)
        INTO v_tp_id, v_tax
        FROM app.campaign_items pci
        JOIN app.tenant_products tp ON tp.id = pci.tenant_product_id AND tp.tenant_id = v_tenant_id
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE pci.campaign_id = v_catalog_cohort AND pci.deleted_at IS NULL
        ORDER BY pci.display_order, pci.tenant_product_id
        LIMIT 1 OFFSET ((v_j - 1 + v_conv_idx) % v_pci_count);
      END IF;

      IF v_tp_id IS NULL THEN
        SELECT tp.id, COALESCE(p.gst_rate, 18)
        INTO v_tp_id, v_tax
        FROM app.tenant_products tp
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
        ORDER BY tp.created_at, tp.id
        LIMIT 1 OFFSET (v_j - 1);
      END IF;

      IF v_tp_id IS NULL THEN
        RAISE EXCEPTION 'No tenant_products for operational seed (tenant %, converted estimate).', v_tenant_id;
      END IF;

      v_qty := 1 + (v_j % 2);

      v_price := app.resolve_price(v_tp_id, v_buy_pick, v_qty);
      IF v_price IS NULL THEN
        SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
      END IF;
      v_price := round(coalesce(v_price, 0), 2);
      v_line := round(v_qty * v_price, 2);

      INSERT INTO app.estimate_items (
        estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_estimate_id, v_tp_id, v_qty, v_price, v_tax, v_line,
        now(), now(), v_seller_user_id, v_seller_user_id
      );
    END LOOP;

    SELECT
      round(coalesce(sum(line_total), 0), 2),
      round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
    INTO v_subtotal, v_tax_total
    FROM app.estimate_items
    WHERE estimate_id = v_estimate_id AND deleted_at IS NULL;

    UPDATE app.estimates
    SET subtotal = v_subtotal,
        tax_amount = v_tax_total,
        total_amount = round(v_subtotal + v_tax_total, 2),
        updated_at = now(),
        updated_by = v_seller_user_id
    WHERE id = v_estimate_id;

    v_order_number := format('DF-EST-%s', lpad(v_conv_idx::text, 3, '0'));

    INSERT INTO app.orders (
      tenant_id, buyer_id, placed_by, order_number, status, source, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, placed_at, order_date, estimate_id,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id,
      v_buy_pick,
      v_seller_user_id, v_order_number, 'delivered', 'cockpit_manual', v_catalog_cohort,
      v_subtotal, v_tax_total, round(v_subtotal + v_tax_total, 2), 'INR',
      'Converted from estimate (operational seed)',
      now() - interval '12 hours' * v_conv_idx,
      (now() - interval '12 hours' * v_conv_idx)::date,
      v_estimate_id,
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_order_id;

    INSERT INTO app.order_items (
      order_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
      created_at, updated_at, created_by, updated_by
    )
    SELECT v_order_id, ei.tenant_product_id, ei.qty, ei.unit_price, ei.tax_rate, ei.line_total,
           now(), now(), v_seller_user_id, v_seller_user_id
    FROM app.estimate_items ei
    WHERE ei.estimate_id = v_estimate_id AND ei.deleted_at IS NULL;

    UPDATE app.estimates
    SET status = 'converted',
        buyer_id = COALESCE(buyer_id, v_buy_pick),
        converted_to_order_id = v_order_id,
        updated_at = now(),
        updated_by = v_seller_user_id
    WHERE id = v_estimate_id;

    INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
    VALUES (
      v_tenant_id, v_seller_user_id, 'order', v_order_id, 'status_change',
      jsonb_build_object('order_number', v_order_number, 'status', 'delivered', 'estimate_id', v_estimate_id),
      now()
    );
  END LOOP;

  -- ── Sales orders (14-day bulk) ───────────────────────────────────────────
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
      v_status := CASE ((extract(day FROM v_day)::int + v_i) % 9)
        WHEN 0 THEN 'received'
        WHEN 1 THEN 'confirmed'
        WHEN 2 THEN 'partially_dispatched'
        WHEN 3 THEN 'dispatched'
        WHEN 4 THEN 'delivered'
        WHEN 5 THEN 'cancelled'
        WHEN 6 THEN 'delivered'
        WHEN 7 THEN 'delivered'
        ELSE 'delivered'
      END;

      v_catalog_id := CASE WHEN v_i % 3 = 0 THEN v_catalog_cohort WHEN v_i % 2 = 0 THEN v_catalog_all ELSE NULL END;

      INSERT INTO app.orders (
        tenant_id, buyer_id, placed_by, order_number, status, source, campaign_id,
        subtotal, tax_amount, total_amount, currency, notes, placed_at, order_date,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_tenant_id, v_buyer_id, v_seller_user_id, v_order_number, v_status, v_source, v_catalog_id,
        0, 0, 0, 'INR', 'Operational seed sales order',
        v_day::timestamptz + make_interval(hours => 10 + (v_i % 7), mins => (v_i * 9) % 60),
        v_day,
        now(), now(), v_seller_user_id, v_seller_user_id
      )
      RETURNING id INTO v_order_id;

      v_subtotal := 0;
      v_tax_total := 0;
      v_items := 1 + ((extract(day FROM v_day)::int + v_i) % 4);

      FOR v_j IN 1..v_items LOOP
        v_tp_id := NULL;

        IF v_catalog_id IS NOT NULL THEN
          SELECT count(*)::int INTO v_pci_count
          FROM app.campaign_items pci
          WHERE pci.campaign_id = v_catalog_id AND pci.deleted_at IS NULL;

          IF v_pci_count > 0 THEN
            SELECT pci.tenant_product_id, COALESCE(p.gst_rate, 18)
            INTO v_tp_id, v_tax
            FROM app.campaign_items pci
            JOIN app.tenant_products tp ON tp.id = pci.tenant_product_id AND tp.tenant_id = v_tenant_id
            LEFT JOIN catalog.products p ON p.id = tp.master_product_id
            WHERE pci.campaign_id = v_catalog_id AND pci.deleted_at IS NULL
            ORDER BY pci.display_order, pci.tenant_product_id
            LIMIT 1 OFFSET ((v_j - 1 + abs(hashtext(v_order_number || v_j::text))) % v_pci_count);
          END IF;
        END IF;

        IF v_tp_id IS NULL THEN
          SELECT tp.id, COALESCE(p.gst_rate, 18)
          INTO v_tp_id, v_tax
          FROM app.tenant_products tp
          LEFT JOIN catalog.products p ON p.id = tp.master_product_id
          WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
          ORDER BY md5(tp.id::text || v_order_number || v_j::text)
          LIMIT 1;
        END IF;

        IF v_tp_id IS NULL THEN
          RAISE EXCEPTION 'No tenant_products for operational seed (tenant %).', v_tenant_id;
        END IF;

        v_qty := CASE
          WHEN (SELECT COALESCE(tp2.base_selling_price, 0) FROM app.tenant_products tp2 WHERE tp2.id = v_tp_id) < 2000
            THEN 2 + (v_j % 5)
          WHEN (SELECT COALESCE(tp2.base_selling_price, 0) FROM app.tenant_products tp2 WHERE tp2.id = v_tp_id) < 30000
            THEN 1 + (v_j % 3)
          ELSE 1 + (v_j % 2)
        END;

        v_price := app.resolve_price(v_tp_id, v_buyer_id, v_qty);
        IF v_price IS NULL THEN
          SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
        END IF;
        v_price := round(coalesce(v_price, 0), 2);
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
      SET buyer_id = COALESCE(buyer_id, v_buyer_id),
          subtotal = round(v_subtotal, 2),
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

  -- ── Direct estimate → invoice (no sales order) ─────────────────────────
  INSERT INTO app.estimates (
    tenant_id, buyer_id, estimate_number, status, campaign_id,
    subtotal, tax_amount, total_amount, currency, notes, source,
    sent_at, accepted_at, expires_at, external_ref,
    created_at, updated_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, v_buyer_patel,
    format('EST-%s-%s', extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
    'accepted', v_catalog_all,
    0, 0, 0, 'INR', 'Seed estimate invoiced directly', 'seller',
    now() - interval '8 days', now() - interval '3 days', now() + interval '14 days',
    'seed-est-invoice-direct',
    now(), now(), v_seller_user_id, v_seller_user_id
  )
  RETURNING id INTO v_direct_est_id;

  v_est_seq := v_est_seq + 1;

  v_line_catalog := v_catalog_all;
  SELECT count(*)::int INTO v_pci_count
  FROM app.campaign_items pci
  WHERE pci.campaign_id = v_line_catalog AND pci.deleted_at IS NULL;

  FOR v_j IN 1..3 LOOP
    v_tp_id := NULL;
    IF v_pci_count > 0 THEN
      SELECT pci.tenant_product_id, COALESCE(p.gst_rate, 18)
      INTO v_tp_id, v_tax
      FROM app.campaign_items pci
      JOIN app.tenant_products tp ON tp.id = pci.tenant_product_id AND tp.tenant_id = v_tenant_id
      LEFT JOIN catalog.products p ON p.id = tp.master_product_id
      WHERE pci.campaign_id = v_line_catalog AND pci.deleted_at IS NULL
      ORDER BY pci.display_order, pci.tenant_product_id
      LIMIT 1 OFFSET ((v_j - 1 + abs(hashtext('directinv' || v_j::text))) % v_pci_count);
    END IF;

    IF v_tp_id IS NULL THEN
      SELECT tp.id, COALESCE(p.gst_rate, 18)
      INTO v_tp_id, v_tax
      FROM app.tenant_products tp
      LEFT JOIN catalog.products p ON p.id = tp.master_product_id
      WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
      ORDER BY tp.created_at, tp.id
      LIMIT 1 OFFSET (v_j - 1);
    END IF;

    IF v_tp_id IS NULL THEN
      RAISE EXCEPTION 'No tenant_products for operational seed (tenant %, direct invoice estimate).', v_tenant_id;
    END IF;

    v_qty := 2;

    v_price := app.resolve_price(v_tp_id, v_buyer_patel, v_qty);
    IF v_price IS NULL THEN
      SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
    END IF;
    v_price := round(coalesce(v_price, 0), 2);
    v_line := round(v_qty * v_price, 2);

    INSERT INTO app.estimate_items (
      estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_direct_est_id, v_tp_id, v_qty, v_price, v_tax, v_line,
      now(), now(), v_seller_user_id, v_seller_user_id
    );
  END LOOP;

  SELECT
    round(coalesce(sum(line_total), 0), 2),
    round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
  INTO v_subtotal, v_tax_total
  FROM app.estimate_items
  WHERE estimate_id = v_direct_est_id AND deleted_at IS NULL;

  UPDATE app.estimates
  SET subtotal = v_subtotal,
      tax_amount = v_tax_total,
      total_amount = round(v_subtotal + v_tax_total, 2),
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE id = v_direct_est_id;

  INSERT INTO app.invoices (
    tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
    subtotal, tax_amount, total_amount, outstanding_balance,
    estimate_id, due_date, paid_at, external_ref,
    created_at, updated_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, v_buyer_patel, NULL,
    format('INV-%s-%s', extract(year from now())::int, lpad(v_inv_seq::text, 4, '0')),
    now() - interval '2 days', 'sent',
    v_subtotal, v_tax_total, round(v_subtotal + v_tax_total, 2), round(v_subtotal + v_tax_total, 2),
    v_direct_est_id, now() + interval '10 days', NULL, 'seed-inv-direct-est',
    now(), now(), v_seller_user_id, v_seller_user_id
  )
  RETURNING id INTO v_direct_inv_id;

  v_inv_seq := v_inv_seq + 1;

  INSERT INTO app.invoice_items (
    invoice_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
    created_at, updated_at, created_by, updated_by
  )
  SELECT v_direct_inv_id, ei.tenant_product_id, ei.qty, ei.unit_price, ei.tax_rate, ei.line_total,
         now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.estimate_items ei
  WHERE ei.estimate_id = v_direct_est_id AND ei.deleted_at IS NULL;

  UPDATE app.estimates
  SET status = 'invoiced',
      buyer_id = COALESCE(buyer_id, v_buyer_patel),
      converted_to_invoice_id = v_direct_inv_id,
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE id = v_direct_est_id;

  -- ── Invoices from sales orders + status mix ──────────────────────────────
  FOR r_order IN
    SELECT o.id, o.buyer_id, o.order_number, o.status, o.placed_at, o.estimate_id,
           o.subtotal AS o_sub, o.tax_amount AS o_tax, o.total_amount AS o_tot
    FROM app.orders o
    WHERE o.tenant_id = v_tenant_id
      AND o.deleted_at IS NULL
      AND o.status IN ('delivered', 'dispatched', 'partially_dispatched', 'confirmed')
    ORDER BY o.placed_at, o.order_number
  LOOP
    IF NOT (
      r_order.order_number LIKE 'DF-EST-%'
      OR (abs(hashtext(r_order.id::text)) % 100) < 36
    ) THEN
      CONTINUE;
    END IF;

    v_partial := (r_order.order_number NOT LIKE 'DF-EST-%')
      AND (abs(hashtext(r_order.id::text || ':partial')) % 10) = 0;

    SELECT count(*)::int INTO v_item_total
    FROM app.order_items oi
    WHERE oi.order_id = r_order.id AND oi.deleted_at IS NULL;

    IF v_item_total = 0 THEN
      CONTINUE;
    END IF;

    v_mod := v_inv_seq % 7;
    IF v_mod = 0 THEN
      v_inv_status := 'paid';
      v_inv_due := now() - interval '5 days';
      v_inv_paid_at := now() - interval '1 day';
      v_inv_outstanding := 0;
    ELSIF v_mod = 1 THEN
      v_inv_status := 'sent';
      v_inv_due := (current_date + 5)::timestamptz;
      v_inv_paid_at := NULL;
      v_inv_outstanding := NULL;
    ELSIF v_mod = 2 THEN
      v_inv_status := 'sent';
      v_inv_due := now() - interval '18 days';
      v_inv_paid_at := NULL;
      v_inv_outstanding := NULL;
    ELSIF v_mod = 3 THEN
      v_inv_status := 'draft';
      v_inv_due := now() + interval '21 days';
      v_inv_paid_at := NULL;
      v_inv_outstanding := NULL;
    ELSIF v_mod = 4 THEN
      v_inv_status := 'void';
      v_inv_due := now() + interval '7 days';
      v_inv_paid_at := NULL;
      v_inv_outstanding := 0;
    ELSE
      v_inv_status := 'sent';
      v_inv_due := (current_date + 14)::timestamptz;
      v_inv_paid_at := NULL;
      v_inv_outstanding := NULL;
    END IF;

    INSERT INTO app.invoices (
      tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
      subtotal, tax_amount, total_amount, outstanding_balance,
      estimate_id, due_date, paid_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id,
      COALESCE(
        r_order.buyer_id,
        (SELECT e.buyer_id FROM app.estimates e WHERE e.id = r_order.estimate_id),
        v_buyer_patel
      ),
      r_order.id,
      format('INV-%s-%s', extract(year from now())::int, lpad(v_inv_seq::text, 4, '0')),
      coalesce(r_order.placed_at, now()) + interval '6 hours',
      v_inv_status,
      0, 0, 0,
      coalesce(v_inv_outstanding, 0),
      r_order.estimate_id,
      v_inv_due, v_inv_paid_at,
      format('seed-inv-order-%s', replace(r_order.order_number, '-', '_')),
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_invoice_id;

    v_inv_seq := v_inv_seq + 1;

    v_line_idx := 0;
    v_inv_sub := 0;
    v_inv_tax := 0;

    FOR r_item IN
      SELECT oi.id, oi.tenant_product_id, oi.qty, oi.unit_price, oi.tax_rate, oi.line_total
      FROM app.order_items oi
      WHERE oi.order_id = r_order.id AND oi.deleted_at IS NULL
      ORDER BY oi.id
    LOOP
      v_line_idx := v_line_idx + 1;
      IF v_partial AND v_line_idx > greatest(1, v_item_total / 2) THEN
        EXIT;
      END IF;

      INSERT INTO app.invoice_items (
        invoice_id, tenant_product_id, qty, unit_price, tax_rate, line_total,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_invoice_id, r_item.tenant_product_id, r_item.qty, r_item.unit_price, r_item.tax_rate, r_item.line_total,
        now(), now(), v_seller_user_id, v_seller_user_id
      );

      v_inv_sub := v_inv_sub + r_item.line_total;
      v_inv_tax := v_inv_tax + round(r_item.line_total * (r_item.tax_rate / 100.0), 2);
    END LOOP;

    v_inv_total := round(v_inv_sub + v_inv_tax, 2);
    v_inv_sub := round(v_inv_sub, 2);
    v_inv_tax := round(v_inv_tax, 2);

    IF v_inv_status = 'draft' OR v_inv_status = 'void' THEN
      UPDATE app.invoices
      SET subtotal = v_inv_sub,
          tax_amount = v_inv_tax,
          total_amount = v_inv_total,
          outstanding_balance = CASE WHEN v_inv_status = 'void' THEN 0 ELSE v_inv_total END,
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = v_invoice_id;
    ELSIF v_inv_status = 'paid' THEN
      UPDATE app.invoices
      SET subtotal = v_inv_sub,
          tax_amount = v_inv_tax,
          total_amount = v_inv_total,
          outstanding_balance = 0,
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = v_invoice_id;
    ELSE
      UPDATE app.invoices
      SET subtotal = v_inv_sub,
          tax_amount = v_inv_tax,
          total_amount = v_inv_total,
          outstanding_balance = v_inv_total,
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = v_invoice_id;
    END IF;

    IF v_inv_status = 'paid' THEN
      v_pay_mode := (ARRAY['upi', 'neft', 'cash'])[1 + (abs(hashtext(v_invoice_id::text)) % 3)];
      INSERT INTO app.payments (
        tenant_id, buyer_id, invoice_id, amount, status, mode, paid_at, external_ref,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_tenant_id,
        COALESCE(
          r_order.buyer_id,
          (SELECT e.buyer_id FROM app.estimates e WHERE e.id = r_order.estimate_id),
          v_buyer_patel
        ),
        v_invoice_id, v_inv_total, 'cleared', v_pay_mode, v_inv_paid_at,
        format('seed-pay-%s', replace(v_invoice_id::text, '-', '')),
        now(), now(), v_seller_user_id, v_seller_user_id
      );
    END IF;

    IF v_partial THEN
      UPDATE app.orders
      SET status = 'dispatched',
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = r_order.id;
    ELSE
      UPDATE app.orders
      SET status = 'delivered',
          updated_at = now(),
          updated_by = v_seller_user_id
      WHERE id = r_order.id;
    END IF;
  END LOOP;

  -- Defensive backfill: keep every transactional document tied to a buyer.
  UPDATE app.estimates e
  SET buyer_id = COALESCE(
        e.buyer_id,
        (SELECT o.buyer_id FROM app.orders o WHERE o.id = e.converted_to_order_id),
        (SELECT i.buyer_id FROM app.invoices i WHERE i.id = e.converted_to_invoice_id)
      ),
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE e.tenant_id = v_tenant_id
    AND e.deleted_at IS NULL
    AND e.buyer_id IS NULL;

  UPDATE app.orders o
  SET buyer_id = COALESCE(
        o.buyer_id,
        (SELECT e.buyer_id FROM app.estimates e WHERE e.id = o.estimate_id),
        (SELECT i.buyer_id FROM app.invoices i WHERE i.order_id = o.id AND i.deleted_at IS NULL ORDER BY i.created_at LIMIT 1)
      ),
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE o.tenant_id = v_tenant_id
    AND o.deleted_at IS NULL
    AND o.buyer_id IS NULL;

  UPDATE app.invoices i
  SET buyer_id = COALESCE(
        i.buyer_id,
        (SELECT o.buyer_id FROM app.orders o WHERE o.id = i.order_id),
        (SELECT e.buyer_id FROM app.estimates e WHERE e.id = i.estimate_id)
      ),
      updated_at = now(),
      updated_by = v_seller_user_id
  WHERE i.tenant_id = v_tenant_id
    AND i.deleted_at IS NULL
    AND i.buyer_id IS NULL;

  -- ── Snapshots + daily KPI tables (seller/buyer landings) ─────────────────
  PERFORM app.post_sync_rebuild(v_tenant_id, 14);
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
SELECT 'campaigns', count(*)::text
FROM app.campaigns pc
JOIN app.tenants t ON t.id = pc.tenant_id
WHERE t.slug = 'techwave' AND pc.deleted_at IS NULL
UNION ALL
SELECT 'estimates', count(*)::text
FROM app.estimates e
JOIN app.tenants t ON t.id = e.tenant_id
WHERE t.slug = 'techwave' AND e.deleted_at IS NULL
UNION ALL
SELECT 'estimate_items', count(*)::text
FROM app.estimate_items ei
JOIN app.estimates e ON e.id = ei.estimate_id
JOIN app.tenants t ON t.id = e.tenant_id
WHERE t.slug = 'techwave' AND ei.deleted_at IS NULL AND e.deleted_at IS NULL
UNION ALL
SELECT 'invoices', count(*)::text
FROM app.invoices i
JOIN app.tenants t ON t.id = i.tenant_id
WHERE t.slug = 'techwave' AND i.deleted_at IS NULL
UNION ALL
SELECT 'invoice_items', count(*)::text
FROM app.invoice_items ii
JOIN app.invoices i ON i.id = ii.invoice_id
JOIN app.tenants t ON t.id = i.tenant_id
WHERE t.slug = 'techwave' AND ii.deleted_at IS NULL AND i.deleted_at IS NULL
UNION ALL
SELECT 'payments', count(*)::text
FROM app.payments p
JOIN app.tenants t ON t.id = p.tenant_id
WHERE t.slug = 'techwave' AND p.deleted_at IS NULL
UNION ALL
SELECT 'orders_14d', count(*)::text
FROM app.orders o
JOIN app.tenants t ON t.id = o.tenant_id
WHERE t.slug = 'techwave' AND o.deleted_at IS NULL AND o.placed_at::date >= current_date - 13
UNION ALL
SELECT 'orders_with_estimate', count(*)::text
FROM app.orders o
JOIN app.tenants t ON t.id = o.tenant_id
WHERE t.slug = 'techwave' AND o.deleted_at IS NULL AND o.estimate_id IS NOT NULL
UNION ALL
SELECT 'orders_invoiced', count(*)::text
FROM app.orders o
JOIN app.tenants t ON t.id = o.tenant_id
WHERE t.slug = 'techwave' AND o.deleted_at IS NULL AND o.status = 'delivered'
  AND EXISTS (SELECT 1 FROM app.invoices i WHERE i.order_id = o.id AND i.deleted_at IS NULL)
UNION ALL
SELECT 'invoices_linked_to_order', count(*)::text
FROM app.invoices i
JOIN app.tenants t ON t.id = i.tenant_id
WHERE t.slug = 'techwave' AND i.deleted_at IS NULL AND i.order_id IS NOT NULL
UNION ALL
SELECT 'tenant_settings', count(*)::text
FROM app.tenant_settings ts
JOIN app.tenants t ON t.id = ts.tenant_id
WHERE t.slug = 'techwave'
UNION ALL
SELECT 'products_snapshot', count(*)::text
FROM app.products_snapshot ps
JOIN app.tenants t ON t.id = ps.tenant_id
WHERE t.slug = 'techwave'
UNION ALL
SELECT 'buyer_app_snapshot', count(*)::text
FROM app.buyer_app_snapshot bas
JOIN app.tenants t ON t.id = bas.tenant_id
WHERE t.slug = 'techwave'
UNION ALL
SELECT 'kpi_buyer_app_daily', count(*)::text
FROM app.kpi_buyer_app_daily kbad
JOIN app.tenants t ON t.id = kbad.tenant_id
WHERE t.slug = 'techwave';
