-- EP-15-002: estimate detail columns, orders.estimate_id, estimate action RPCs.

ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS seller_note text;

ALTER TABLE app.estimate_items
  ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0;

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES app.estimates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_estimate_id ON app.orders(estimate_id) WHERE deleted_at IS NULL;

-- ── Helpers (SECURITY DEFINER; validate tenant + membership) ─────────────────

CREATE OR REPLACE FUNCTION app._estimate_assert_seller_member(p_tenant_id uuid, p_actor_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND COALESCE(tu.is_active, true)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app._next_estimate_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.estimates WHERE tenant_id = p_tenant_id;
  RETURN format('EST-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION app._next_order_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.orders WHERE tenant_id = p_tenant_id;
  RETURN format('ORD-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION app._next_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM (timezone('Asia/Kolkata', now())))::int;
  v_seq int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_seq FROM app.invoices WHERE tenant_id = p_tenant_id;
  RETURN format('INV-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END;
$$;

-- ── estimate_send: draft → sent ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.estimate_send(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'sent',
      sent_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'sent'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;

-- ── estimate_accept: sent → accepted ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.estimate_accept(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'accepted',
      accepted_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'accepted'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;

-- ── estimate_decline: sent → declined ────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.estimate_decline(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_row app.estimates%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_row
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_row.status <> 'sent' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET status = 'declined',
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'declined'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;

-- ── estimate_convert_to_order: accepted → converted + order + order_items ───

CREATE OR REPLACE FUNCTION app.estimate_convert_to_order(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
  v_item app.estimate_items%ROWTYPE;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '23514';
  END IF;

  v_order_number := app._next_order_number(p_tenant_id);

  INSERT INTO app.orders (
    tenant_id,
    buyer_id,
    placed_by,
    order_number,
    status,
    source,
    campaign_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    placed_at,
    estimate_id,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    p_actor_user_id,
    v_order_number,
    'received',
    'cockpit_manual',
    v_est.campaign_id,
    v_est.subtotal,
    v_est.tax_amount,
    v_est.total_amount,
    COALESCE(v_est.currency, 'INR'),
    v_est.notes,
    now(),
    p_estimate_id,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    INSERT INTO app.order_items (
      order_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      created_by,
      updated_by
    )
    VALUES (
      v_order_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.line_total,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimates
  SET status = 'converted',
      converted_to_order_id = v_order_id,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'converted', 'order_id', v_order_id, 'order_number', v_order_number),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'redirect_path', format('/sales-orders/%s', v_order_id)
  );
END;
$$;

-- ── estimate_convert_to_invoice: accepted → invoiced + invoice + items ──────

CREATE OR REPLACE FUNCTION app.estimate_convert_to_invoice(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid,
  p_due_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
  v_inv_id uuid;
  v_inv_number text;
  v_item app.estimate_items%ROWTYPE;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'due_date required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_invoiced' USING ERRCODE = '23514';
  END IF;

  v_sub := COALESCE(v_est.subtotal, 0);
  v_tax := COALESCE(v_est.tax_amount, 0);
  v_total := COALESCE(v_est.total_amount, v_sub + v_tax);

  v_inv_number := app._next_invoice_number(p_tenant_id);

  INSERT INTO app.invoices (
    tenant_id,
    buyer_id,
    order_id,
    invoice_number,
    invoice_date,
    status,
    subtotal,
    tax_amount,
    total_amount,
    outstanding_balance,
    estimate_id,
    due_date,
    created_by,
    updated_by
  )
  VALUES (
    v_est.tenant_id,
    v_est.buyer_id,
    NULL,
    v_inv_number,
    now(),
    'draft',
    v_sub,
    v_tax,
    v_total,
    v_total,
    p_estimate_id,
    p_due_date,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_inv_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    INSERT INTO app.invoice_items (
      invoice_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      created_by,
      updated_by
    )
    VALUES (
      v_inv_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.line_total,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimates
  SET status = 'invoiced',
      converted_to_invoice_id = v_inv_id,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE id = p_estimate_id;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    p_estimate_id,
    'status_change',
    jsonb_build_object('to', 'invoiced', 'invoice_id', v_inv_id, 'invoice_number', v_inv_number),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_inv_id,
    'invoice_number', v_inv_number,
    'redirect_path', format('/invoices/%s', v_inv_id)
  );
END;
$$;

-- ── estimate_duplicate: clone estimate + items as new draft ─────────────────

CREATE OR REPLACE FUNCTION app.estimate_duplicate(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_src app.estimates%ROWTYPE;
  v_new_id uuid;
  v_new_number text;
  v_item app.estimate_items%ROWTYPE;
  v_expires timestamptz := (now() AT TIME ZONE 'utc') + interval '30 days';
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_src
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  v_new_number := app._next_estimate_number(p_tenant_id);

  INSERT INTO app.estimates (
    tenant_id,
    buyer_id,
    estimate_number,
    status,
    campaign_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    seller_note,
    source,
    expires_at,
    created_by,
    updated_by
  )
  VALUES (
    v_src.tenant_id,
    v_src.buyer_id,
    v_new_number,
    'draft',
    v_src.campaign_id,
    v_src.subtotal,
    v_src.tax_amount,
    v_src.total_amount,
    COALESCE(v_src.currency, 'INR'),
    v_src.notes,
    v_src.seller_note,
    'seller',
    v_expires,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_new_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    INSERT INTO app.estimate_items (
      estimate_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      discount_pct,
      created_by,
      updated_by
    )
    VALUES (
      v_new_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      v_item.tax_rate,
      v_item.line_total,
      COALESCE(v_item.discount_pct, 0),
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'estimate',
    v_new_id,
    'create',
    jsonb_build_object('from_estimate_id', p_estimate_id, 'estimate_number', v_new_number),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'estimate_id', v_new_id,
    'estimate_number', v_new_number,
    'redirect_path', format('/estimates/%s', v_new_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.estimate_send(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_accept(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_decline(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_invoice(uuid, uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_duplicate(uuid, uuid, uuid) TO authenticated, service_role;
