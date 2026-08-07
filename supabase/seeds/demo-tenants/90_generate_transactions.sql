-- ============================================================
-- Demo tenants — transaction generator (estimates, orders, invoices, payments)
--
-- Without a funnel of real transactions, the demo has no story — every
-- KPI tile reads zero. Ported from supabase/seed_operational_data.sql's
-- proven estimate→order→invoice→payment pattern (verified against the
-- live schema), generalized to work for ANY tenant slug instead of
-- techwave's hardcoded buyer names, and defined once as a pg_temp
-- procedure so the 5 industry tenants don't need the logic copy-pasted.
--
-- pg_temp is session-local — the procedure disappears when this psql
-- session ends. Nothing is written to a permanent schema.
--
-- Does NOT call app.post_sync_rebuild (confirmed dead/broken — see
-- README.md). KPI materialization is 99_refresh_metrics.sql's job,
-- run separately and only after explicit approval.
--
-- Additive only — never truncates anything. NOT idempotent by design:
-- re-running for the same tenant will add a second batch of transactions
-- (there's no natural "already seeded" marker for transactional data,
-- unlike the tenant-existence check in 01..05). Run once per tenant.
--
-- Run after 01_electricals.sql .. 05_cosmetics_salon.sql.
-- ============================================================

CREATE OR REPLACE PROCEDURE pg_temp.seed_demo_transactions(p_tenant_slug text)
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_tenant_id uuid;
  v_seller_user_id uuid;
  v_campaign_id uuid;
  v_tenant_abbr text;
  v_buyer_ids uuid[];
  v_buyer_count int;

  v_day date;
  v_order_count integer;
  v_i integer;
  v_j integer;
  v_items integer;

  v_estimate_id uuid;
  v_order_id uuid;
  v_invoice_id uuid;
  v_order_number text;
  v_buyer_id uuid;
  v_status text;
  v_source text;

  v_tp_id uuid;
  v_price numeric;
  v_tax numeric;
  v_qty numeric;
  v_line numeric;
  v_subtotal numeric;
  v_tax_total numeric;

  v_est_seq integer := 1;
  v_inv_seq integer := 1;
  v_conv_idx integer;
  v_buy_pick uuid;

  se RECORD;
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
BEGIN
  SET LOCAL row_security = OFF;

  SELECT id INTO v_tenant_id FROM app.tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION '% tenant not found. Run 01..05_*.sql first.', p_tenant_slug;
  END IF;

  SELECT user_id INTO v_seller_user_id
  FROM app.tenant_users
  WHERE tenant_id = v_tenant_id AND role = 'seller_admin' AND is_active = true
  ORDER BY created_at LIMIT 1;
  IF v_seller_user_id IS NULL THEN
    RAISE EXCEPTION 'seller_admin user not found for %.', p_tenant_slug;
  END IF;

  SELECT id INTO v_campaign_id
  FROM app.campaigns WHERE tenant_id = v_tenant_id AND status = 'published'
  ORDER BY created_at LIMIT 1;

  SELECT array_agg(id ORDER BY created_at) INTO v_buyer_ids
  FROM app.buyers WHERE tenant_id = v_tenant_id AND is_active = true AND deleted_at IS NULL;
  v_buyer_count := coalesce(array_length(v_buyer_ids, 1), 0);
  IF v_buyer_count = 0 THEN
    RAISE EXCEPTION 'No buyers found for %.', p_tenant_slug;
  END IF;

  v_tenant_abbr := upper(left(regexp_replace(p_tenant_slug, '-demo$', ''), 3));

  -- ── Standalone estimates (6, one per status) ────────────────────────────
  FOR se IN SELECT * FROM (
    VALUES (1,'draft'::text), (2,'sent'), (3,'accepted'), (4,'declined'), (5,'expired'), (6,'sent')
  ) AS t(idx, st)
  LOOP
    v_buy_pick := v_buyer_ids[1 + (se.idx % v_buyer_count)];

    INSERT INTO app.estimates (
      tenant_id, buyer_id, estimate_number, status, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, source,
      sent_at, accepted_at, expires_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id, v_buy_pick,
      format('EST-%s-%s-%s', v_tenant_abbr, extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
      se.st, v_campaign_id,
      0, 0, 0, 'INR', 'Seed estimate', 'seller',
      CASE WHEN se.st IN ('sent','accepted','declined') THEN now() - interval '4 days' ELSE NULL END,
      CASE WHEN se.st = 'accepted' THEN now() - interval '2 days' ELSE NULL END,
      CASE WHEN se.st = 'expired' THEN now() - interval '3 days' ELSE now() + interval '30 days' END,
      format('seed-est-%s-%s', p_tenant_slug, se.idx),
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_estimate_id;

    v_est_seq := v_est_seq + 1;

    FOR v_j IN 1..2 LOOP
      SELECT tp.id, COALESCE(p.gst_rate, 18) INTO v_tp_id, v_tax
      FROM app.tenant_products tp
      LEFT JOIN catalog.products p ON p.id = tp.master_product_id
      WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
      ORDER BY md5(tp.id::text || se.idx::text || v_j::text) LIMIT 1;

      v_qty := CASE WHEN v_j = 1 THEN 2 ELSE 1 END;
      v_price := app.resolve_price(v_tp_id, v_buy_pick, v_qty);
      IF v_price IS NULL THEN
        SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
      END IF;
      v_price := round(coalesce(v_price, 0), 2);
      v_line := round(v_qty * v_price, 2);

      INSERT INTO app.estimate_items (estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
      VALUES (v_estimate_id, v_tp_id, v_qty, v_price, v_tax, v_line, now(), now(), v_seller_user_id, v_seller_user_id);
    END LOOP;

    SELECT round(coalesce(sum(line_total), 0), 2), round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
    INTO v_subtotal, v_tax_total
    FROM app.estimate_items WHERE estimate_id = v_estimate_id AND deleted_at IS NULL;

    UPDATE app.estimates SET subtotal = v_subtotal, tax_amount = v_tax_total, total_amount = round(v_subtotal + v_tax_total, 2),
      updated_at = now(), updated_by = v_seller_user_id
    WHERE id = v_estimate_id;
  END LOOP;

  -- ── Converted estimate → sales order (4 chains, all 'delivered') ───────
  FOR v_conv_idx IN 1..4 LOOP
    v_buy_pick := v_buyer_ids[1 + (v_conv_idx % v_buyer_count)];

    INSERT INTO app.estimates (
      tenant_id, buyer_id, estimate_number, status, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, source,
      sent_at, accepted_at, expires_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id, v_buy_pick,
      format('EST-%s-%s-%s', v_tenant_abbr, extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
      'accepted', v_campaign_id,
      0, 0, 0, 'INR', 'Seed estimate converted to sales order', 'seller',
      now() - interval '6 days', now() - interval '1 day', now() + interval '20 days',
      format('seed-est-conv-%s-%s', p_tenant_slug, lpad(v_conv_idx::text, 2, '0')),
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_estimate_id;

    v_est_seq := v_est_seq + 1;
    v_items := 2 + (v_conv_idx % 2);

    FOR v_j IN 1..v_items LOOP
      SELECT tp.id, COALESCE(p.gst_rate, 18) INTO v_tp_id, v_tax
      FROM app.tenant_products tp
      LEFT JOIN catalog.products p ON p.id = tp.master_product_id
      WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
      ORDER BY md5(tp.id::text || 'conv' || v_conv_idx::text || v_j::text) LIMIT 1;

      v_qty := 1 + (v_j % 2);
      v_price := app.resolve_price(v_tp_id, v_buy_pick, v_qty);
      IF v_price IS NULL THEN
        SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
      END IF;
      v_price := round(coalesce(v_price, 0), 2);
      v_line := round(v_qty * v_price, 2);

      INSERT INTO app.estimate_items (estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
      VALUES (v_estimate_id, v_tp_id, v_qty, v_price, v_tax, v_line, now(), now(), v_seller_user_id, v_seller_user_id);
    END LOOP;

    SELECT round(coalesce(sum(line_total), 0), 2), round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
    INTO v_subtotal, v_tax_total
    FROM app.estimate_items WHERE estimate_id = v_estimate_id AND deleted_at IS NULL;

    UPDATE app.estimates SET subtotal = v_subtotal, tax_amount = v_tax_total, total_amount = round(v_subtotal + v_tax_total, 2),
      updated_at = now(), updated_by = v_seller_user_id
    WHERE id = v_estimate_id;

    v_order_number := format('%s-EST-%s', v_tenant_abbr, lpad(v_conv_idx::text, 3, '0'));

    INSERT INTO app.orders (
      tenant_id, buyer_id, placed_by, order_number, status, source, campaign_id,
      subtotal, tax_amount, total_amount, currency, notes, placed_at, order_date, estimate_id,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id, v_buy_pick, v_seller_user_id, v_order_number, 'delivered', 'cockpit_manual', v_campaign_id,
      v_subtotal, v_tax_total, round(v_subtotal + v_tax_total, 2), 'INR', 'Converted from estimate (seed)',
      now() - interval '12 hours' * v_conv_idx, (now() - interval '12 hours' * v_conv_idx)::date, v_estimate_id,
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_order_id;

    INSERT INTO app.order_items (order_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
    SELECT v_order_id, ei.tenant_product_id, ei.qty, ei.unit_price, ei.tax_rate, ei.line_total, now(), now(), v_seller_user_id, v_seller_user_id
    FROM app.estimate_items ei WHERE ei.estimate_id = v_estimate_id AND ei.deleted_at IS NULL;

    UPDATE app.estimates SET status = 'converted', converted_to_order_id = v_order_id, updated_at = now(), updated_by = v_seller_user_id
    WHERE id = v_estimate_id;
  END LOOP;

  -- ── Bulk sales orders (14-day spread, 1-2/day) ──────────────────────────
  FOR v_day IN SELECT generate_series(current_date - 13, current_date, interval '1 day')::date LOOP
    v_order_count := CASE WHEN extract(isodow FROM v_day) IN (6, 7) THEN 1 ELSE 2 END;

    FOR v_i IN 1..v_order_count LOOP
      v_order_number := format('%s-%s-%s', v_tenant_abbr, to_char(v_day, 'YYYYMMDD'), lpad(v_i::text, 3, '0'));
      v_buyer_id := v_buyer_ids[1 + (abs(hashtext(v_order_number)) % v_buyer_count)];
      v_source := CASE v_i % 3 WHEN 0 THEN 'buyer_app' WHEN 1 THEN 'cockpit_manual' ELSE 'csv_import' END;
      v_status := CASE ((extract(day FROM v_day)::int + v_i) % 9)
        WHEN 0 THEN 'received' WHEN 1 THEN 'confirmed' WHEN 2 THEN 'partially_dispatched'
        WHEN 3 THEN 'dispatched' WHEN 4 THEN 'delivered' WHEN 5 THEN 'cancelled'
        ELSE 'delivered'
      END;

      INSERT INTO app.orders (
        tenant_id, buyer_id, placed_by, order_number, status, source, campaign_id,
        subtotal, tax_amount, total_amount, currency, notes, placed_at, order_date,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        v_tenant_id, v_buyer_id, v_seller_user_id, v_order_number, v_status, v_source,
        CASE WHEN v_i % 2 = 0 THEN v_campaign_id ELSE NULL END,
        0, 0, 0, 'INR', 'Seed sales order',
        v_day::timestamptz + make_interval(hours => 10 + (v_i % 7), mins => (v_i * 9) % 60), v_day,
        now(), now(), v_seller_user_id, v_seller_user_id
      )
      RETURNING id INTO v_order_id;

      v_subtotal := 0;
      v_tax_total := 0;
      v_items := 1 + ((extract(day FROM v_day)::int + v_i) % 3);

      FOR v_j IN 1..v_items LOOP
        SELECT tp.id, COALESCE(p.gst_rate, 18) INTO v_tp_id, v_tax
        FROM app.tenant_products tp
        LEFT JOIN catalog.products p ON p.id = tp.master_product_id
        WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
        ORDER BY md5(tp.id::text || v_order_number || v_j::text) LIMIT 1;

        v_qty := CASE
          WHEN (SELECT COALESCE(tp2.base_selling_price, 0) FROM app.tenant_products tp2 WHERE tp2.id = v_tp_id) < 500 THEN 3 + (v_j % 5)
          WHEN (SELECT COALESCE(tp2.base_selling_price, 0) FROM app.tenant_products tp2 WHERE tp2.id = v_tp_id) < 3000 THEN 1 + (v_j % 3)
          ELSE 1 + (v_j % 2)
        END;

        v_price := app.resolve_price(v_tp_id, v_buyer_id, v_qty);
        IF v_price IS NULL THEN
          SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
        END IF;
        v_price := round(coalesce(v_price, 0), 2);
        v_line := round(v_qty * v_price, 2);

        INSERT INTO app.order_items (order_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
        VALUES (v_order_id, v_tp_id, v_qty, v_price, v_tax, v_line, now(), now(), v_seller_user_id, v_seller_user_id);

        v_subtotal := v_subtotal + v_line;
        v_tax_total := v_tax_total + round(v_line * (v_tax / 100.0), 2);
      END LOOP;

      UPDATE app.orders SET subtotal = round(v_subtotal, 2), tax_amount = round(v_tax_total, 2),
        total_amount = round(v_subtotal + v_tax_total, 2), updated_at = now(), updated_by = v_seller_user_id
      WHERE id = v_order_id;
    END LOOP;
  END LOOP;

  -- ── Direct estimate → invoice (no sales order) ──────────────────────────
  v_buy_pick := v_buyer_ids[v_buyer_count];

  INSERT INTO app.estimates (
    tenant_id, buyer_id, estimate_number, status, campaign_id,
    subtotal, tax_amount, total_amount, currency, notes, source,
    sent_at, accepted_at, expires_at, external_ref,
    created_at, updated_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, v_buy_pick,
    format('EST-%s-%s-%s', v_tenant_abbr, extract(year from now())::int, lpad(v_est_seq::text, 4, '0')),
    'accepted', v_campaign_id,
    0, 0, 0, 'INR', 'Seed estimate invoiced directly', 'seller',
    now() - interval '8 days', now() - interval '3 days', now() + interval '14 days',
    format('seed-est-invoice-direct-%s', p_tenant_slug),
    now(), now(), v_seller_user_id, v_seller_user_id
  )
  RETURNING id INTO v_direct_est_id;

  v_est_seq := v_est_seq + 1;

  FOR v_j IN 1..3 LOOP
    SELECT tp.id, COALESCE(p.gst_rate, 18) INTO v_tp_id, v_tax
    FROM app.tenant_products tp
    LEFT JOIN catalog.products p ON p.id = tp.master_product_id
    WHERE tp.tenant_id = v_tenant_id AND tp.deleted_at IS NULL
    ORDER BY md5(tp.id::text || 'directinv' || v_j::text) LIMIT 1;

    v_qty := 2;
    v_price := app.resolve_price(v_tp_id, v_buy_pick, v_qty);
    IF v_price IS NULL THEN
      SELECT COALESCE(tp.base_selling_price, 0) INTO v_price FROM app.tenant_products tp WHERE tp.id = v_tp_id;
    END IF;
    v_price := round(coalesce(v_price, 0), 2);
    v_line := round(v_qty * v_price, 2);

    INSERT INTO app.estimate_items (estimate_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
    VALUES (v_direct_est_id, v_tp_id, v_qty, v_price, v_tax, v_line, now(), now(), v_seller_user_id, v_seller_user_id);
  END LOOP;

  SELECT round(coalesce(sum(line_total), 0), 2), round(coalesce(sum(round(line_total * (tax_rate / 100.0), 2)), 0), 2)
  INTO v_subtotal, v_tax_total
  FROM app.estimate_items WHERE estimate_id = v_direct_est_id AND deleted_at IS NULL;

  UPDATE app.estimates SET subtotal = v_subtotal, tax_amount = v_tax_total, total_amount = round(v_subtotal + v_tax_total, 2),
    updated_at = now(), updated_by = v_seller_user_id
  WHERE id = v_direct_est_id;

  INSERT INTO app.invoices (
    tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
    subtotal, tax_amount, total_amount, outstanding_balance,
    estimate_id, due_date, paid_at, external_ref,
    created_at, updated_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, v_buy_pick, NULL,
    format('INV-%s-%s-%s', v_tenant_abbr, extract(year from now())::int, lpad(v_inv_seq::text, 4, '0')),
    now() - interval '2 days', 'sent',
    v_subtotal, v_tax_total, round(v_subtotal + v_tax_total, 2), round(v_subtotal + v_tax_total, 2),
    v_direct_est_id, now() + interval '10 days', NULL, format('seed-inv-direct-est-%s', p_tenant_slug),
    now(), now(), v_seller_user_id, v_seller_user_id
  )
  RETURNING id INTO v_invoice_id;

  v_inv_seq := v_inv_seq + 1;

  INSERT INTO app.invoice_items (invoice_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
  SELECT v_invoice_id, ei.tenant_product_id, ei.qty, ei.unit_price, ei.tax_rate, ei.line_total, now(), now(), v_seller_user_id, v_seller_user_id
  FROM app.estimate_items ei WHERE ei.estimate_id = v_direct_est_id AND ei.deleted_at IS NULL;

  UPDATE app.estimates SET status = 'invoiced', converted_to_invoice_id = v_invoice_id, updated_at = now(), updated_by = v_seller_user_id
  WHERE id = v_direct_est_id;

  -- ── Invoices from qualifying orders + status mix, payments for 'paid' ───
  FOR r_order IN
    SELECT o.id, o.buyer_id, o.order_number, o.status, o.placed_at, o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = v_tenant_id AND o.deleted_at IS NULL
      AND o.status IN ('delivered', 'dispatched', 'partially_dispatched', 'confirmed')
    ORDER BY o.placed_at, o.order_number
  LOOP
    IF NOT (
      r_order.order_number LIKE '%-EST-%'
      OR (abs(hashtext(r_order.id::text)) % 100) < 36
    ) THEN
      CONTINUE;
    END IF;

    v_partial := (r_order.order_number NOT LIKE '%-EST-%') AND (abs(hashtext(r_order.id::text || ':partial')) % 10) = 0;

    SELECT count(*)::int INTO v_item_total FROM app.order_items oi WHERE oi.order_id = r_order.id AND oi.deleted_at IS NULL;
    IF v_item_total = 0 THEN CONTINUE; END IF;

    v_mod := v_inv_seq % 7;
    IF v_mod = 0 THEN
      v_inv_status := 'paid'; v_inv_due := now() - interval '5 days'; v_inv_paid_at := now() - interval '1 day'; v_inv_outstanding := 0;
    ELSIF v_mod = 3 THEN
      v_inv_status := 'draft'; v_inv_due := now() + interval '21 days'; v_inv_paid_at := NULL; v_inv_outstanding := NULL;
    ELSIF v_mod = 4 THEN
      v_inv_status := 'void'; v_inv_due := now() + interval '7 days'; v_inv_paid_at := NULL; v_inv_outstanding := 0;
    ELSE
      v_inv_status := 'sent'; v_inv_due := (current_date + 10)::timestamptz; v_inv_paid_at := NULL; v_inv_outstanding := NULL;
    END IF;

    INSERT INTO app.invoices (
      tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
      subtotal, tax_amount, total_amount, outstanding_balance,
      estimate_id, due_date, paid_at, external_ref,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      v_tenant_id, r_order.buyer_id, r_order.id,
      format('INV-%s-%s-%s', v_tenant_abbr, extract(year from now())::int, lpad(v_inv_seq::text, 4, '0')),
      coalesce(r_order.placed_at, now()) + interval '6 hours', v_inv_status,
      0, 0, 0, coalesce(v_inv_outstanding, 0), r_order.estimate_id, v_inv_due, v_inv_paid_at,
      format('seed-inv-order-%s-%s', p_tenant_slug, replace(r_order.order_number, '-', '_')),
      now(), now(), v_seller_user_id, v_seller_user_id
    )
    RETURNING id INTO v_invoice_id;

    v_inv_seq := v_inv_seq + 1;
    v_line_idx := 0;
    v_inv_sub := 0;
    v_inv_tax := 0;

    FOR r_item IN
      SELECT oi.tenant_product_id, oi.qty, oi.unit_price, oi.tax_rate, oi.line_total
      FROM app.order_items oi WHERE oi.order_id = r_order.id AND oi.deleted_at IS NULL ORDER BY oi.id
    LOOP
      v_line_idx := v_line_idx + 1;
      IF v_partial AND v_line_idx > greatest(1, v_item_total / 2) THEN EXIT; END IF;

      INSERT INTO app.invoice_items (invoice_id, tenant_product_id, qty, unit_price, tax_rate, line_total, created_at, updated_at, created_by, updated_by)
      VALUES (v_invoice_id, r_item.tenant_product_id, r_item.qty, r_item.unit_price, r_item.tax_rate, r_item.line_total, now(), now(), v_seller_user_id, v_seller_user_id);

      v_inv_sub := v_inv_sub + r_item.line_total;
      v_inv_tax := v_inv_tax + round(r_item.line_total * (r_item.tax_rate / 100.0), 2);
    END LOOP;

    v_inv_total := round(v_inv_sub + v_inv_tax, 2);
    v_inv_sub := round(v_inv_sub, 2);
    v_inv_tax := round(v_inv_tax, 2);

    UPDATE app.invoices SET subtotal = v_inv_sub, tax_amount = v_inv_tax, total_amount = v_inv_total,
      outstanding_balance = CASE v_inv_status WHEN 'paid' THEN 0 WHEN 'void' THEN 0 ELSE v_inv_total END,
      updated_at = now(), updated_by = v_seller_user_id
    WHERE id = v_invoice_id;

    IF v_inv_status = 'paid' THEN
      v_pay_mode := (ARRAY['upi', 'neft', 'cash'])[1 + (abs(hashtext(v_invoice_id::text)) % 3)];
      INSERT INTO app.payments (tenant_id, buyer_id, invoice_id, amount, status, mode, paid_at, external_ref, created_at, updated_at, created_by, updated_by)
      VALUES (v_tenant_id, r_order.buyer_id, v_invoice_id, v_inv_total, 'cleared', v_pay_mode, v_inv_paid_at,
        format('seed-pay-%s', replace(v_invoice_id::text, '-', '')), now(), now(), v_seller_user_id, v_seller_user_id);
    END IF;

    UPDATE app.orders SET status = CASE WHEN v_partial THEN 'dispatched' ELSE 'delivered' END,
      updated_at = now(), updated_by = v_seller_user_id
    WHERE id = r_order.id;
  END LOOP;

  RAISE NOTICE '% — seeded % standalone estimates + 4 converted chains + bulk orders + direct invoice + order-linked invoices.', p_tenant_slug, 6;
END;
$proc$;

CALL pg_temp.seed_demo_transactions('electricals-demo');
CALL pg_temp.seed_demo_transactions('mobiles-electronics-demo');
CALL pg_temp.seed_demo_transactions('automotive-spares-demo');
CALL pg_temp.seed_demo_transactions('hardware-building-demo');
CALL pg_temp.seed_demo_transactions('cosmetics-salon-demo');

DROP PROCEDURE IF EXISTS pg_temp.seed_demo_transactions(text);

-- Verification
SELECT t.slug AS tenant, 'estimates' AS metric, count(*)::text AS value
FROM app.estimates e JOIN app.tenants t ON t.id = e.tenant_id
WHERE t.slug IN ('electricals-demo','mobiles-electronics-demo','automotive-spares-demo','hardware-building-demo','cosmetics-salon-demo')
  AND e.deleted_at IS NULL
GROUP BY t.slug
UNION ALL
SELECT t.slug, 'orders', count(*)::text
FROM app.orders o JOIN app.tenants t ON t.id = o.tenant_id
WHERE t.slug IN ('electricals-demo','mobiles-electronics-demo','automotive-spares-demo','hardware-building-demo','cosmetics-salon-demo')
  AND o.deleted_at IS NULL
GROUP BY t.slug
UNION ALL
SELECT t.slug, 'invoices', count(*)::text
FROM app.invoices i JOIN app.tenants t ON t.id = i.tenant_id
WHERE t.slug IN ('electricals-demo','mobiles-electronics-demo','automotive-spares-demo','hardware-building-demo','cosmetics-salon-demo')
  AND i.deleted_at IS NULL
GROUP BY t.slug
UNION ALL
SELECT t.slug, 'payments', count(*)::text
FROM app.payments p JOIN app.tenants t ON t.id = p.tenant_id
WHERE t.slug IN ('electricals-demo','mobiles-electronics-demo','automotive-spares-demo','hardware-building-demo','cosmetics-salon-demo')
  AND p.deleted_at IS NULL
GROUP BY t.slug
ORDER BY 1, 2;
