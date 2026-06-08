-- Transactional documents (estimates, sales orders, invoices): composer math, line-item tax/discount,
-- lifecycle timestamps, and estimate RPCs. Single column `notes` for internal text (no ERP-specific columns).

-- ── app.estimates ───────────────────────────────────────────────────────────

ALTER TABLE app.estimates
  ALTER COLUMN buyer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS date_issued date,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_channel text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_by_name text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimate_version integer NOT NULL DEFAULT 1;

UPDATE app.estimates
SET
  valid_until = COALESCE(valid_until, (expires_at AT TIME ZONE 'Asia/Kolkata')::date),
  date_issued = COALESCE(date_issued, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
WHERE valid_until IS NULL OR date_issued IS NULL;

ALTER TABLE app.estimates
  ALTER COLUMN valid_until SET DEFAULT (CURRENT_DATE + 14),
  ALTER COLUMN date_issued SET DEFAULT CURRENT_DATE;

ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_sent_channel_check;

ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('whatsapp', 'email', 'download'));

ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;

ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_status_check CHECK (
    status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'converted', 'invoiced', 'void')
  );

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_status_valid_until
  ON app.estimates (tenant_id, status, valid_until)
  WHERE deleted_at IS NULL;

-- ── app.estimate_items ───────────────────────────────────────────────────────

ALTER TABLE app.estimate_items
  ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS scheme_tag text;

UPDATE app.estimate_items
SET
  disc_pct = COALESCE(discount_pct, 0),
  tax_pct = COALESCE(tax_pct, tax_rate)
WHERE disc_pct = 0 OR tax_pct IS NULL;

-- ── app.orders (sales orders) ─────────────────────────────────────────────────

ALTER TABLE app.orders
  ALTER COLUMN buyer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES app.estimates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_backorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_delivery date,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS dispatch_notes text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_estimate_id_tx_docs
  ON app.orders (estimate_id)
  WHERE deleted_at IS NULL AND estimate_id IS NOT NULL;

UPDATE app.orders
SET received_at = placed_at
WHERE received_at IS NULL
  AND placed_at IS NOT NULL
  AND deleted_at IS NULL
  AND COALESCE(status, '') <> 'draft';

-- ── app.order_items ─────────────────────────────────────────────────────────

ALTER TABLE app.order_items
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS scheme_tag text,
  ADD COLUMN IF NOT EXISTS on_hand_at_confirm integer;

UPDATE app.order_items oi
SET
  disc_pct = COALESCE(oi.disc_pct, 0),
  tax_pct = COALESCE(oi.tax_pct, oi.tax_rate)
WHERE oi.tax_pct IS NULL;

-- ── app.invoices ─────────────────────────────────────────────────────────────

ALTER TABLE app.invoices
  ALTER COLUMN buyer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_channel text,
  ADD COLUMN IF NOT EXISTS gstin_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hsn_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_by_name text,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS intra_state_tax boolean NOT NULL DEFAULT true;

ALTER TABLE app.invoices DROP CONSTRAINT IF EXISTS invoices_sent_channel_check;

ALTER TABLE app.invoices
  ADD CONSTRAINT invoices_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('whatsapp', 'email', 'download'));

UPDATE app.invoices AS i
SET intra_state_tax = COALESCE(
  (
    SELECT
      CASE
        WHEN i.buyer_id IS NULL THEN true
        WHEN length(trim(COALESCE(b.gstin, ''))) < 2 THEN true
        WHEN length(trim(COALESCE(t.gstin, ''))) < 2 THEN true
        ELSE upper(left(trim(b.gstin), 2)) = upper(left(trim(t.gstin), 2))
      END
    FROM app.buyers AS b
    INNER JOIN app.tenants AS t ON t.id = i.tenant_id
    WHERE b.id = i.buyer_id
  ),
  true
);

UPDATE app.invoices
SET amount_paid = COALESCE(amount_paid, GREATEST(COALESCE(total_amount, 0) - COALESCE(outstanding_balance, 0), 0))
WHERE amount_paid = 0;

-- ── app.invoice_items ────────────────────────────────────────────────────────

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS scheme_tag text;

UPDATE app.invoice_items AS item
SET
  sku = COALESCE(item.sku, products.internal_sku),
  hsn_code = COALESCE(item.hsn_code, catalog_products.hsn_code),
  tax_pct = COALESCE(item.tax_pct, item.tax_rate, catalog_products.gst_rate, 0),
  disc_pct = COALESCE(item.disc_pct, 0)
FROM app.tenant_products AS products
LEFT JOIN catalog.products AS catalog_products ON catalog_products.id = products.master_product_id
WHERE products.id = item.tenant_product_id;

-- ── RPC helpers & estimate lifecycle ───────────────────────────────────────

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

CREATE OR REPLACE FUNCTION app._estimate_assert_seller_admin(p_tenant_id uuid, p_actor_user_id uuid)
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
      AND tu.role = 'seller_admin'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION app._estimate_assert_seller_admin(uuid, uuid) TO authenticated, service_role;

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
  SET
    status = 'sent',
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
  SET
    status = 'accepted',
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
  SET
    status = 'declined',
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

DROP FUNCTION IF EXISTS app.estimate_convert_to_order(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION app.estimate_convert_to_order(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid,
  p_line_ids uuid[] DEFAULT NULL,
  p_expected_delivery date DEFAULT NULL,
  p_order_number_override text DEFAULT NULL
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
  v_ids uuid[];
  v_delivery date;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status NOT IN ('accepted', 'sent') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '23514';
  END IF;
  IF v_est.buyer_id IS NULL THEN
    RAISE EXCEPTION 'buyer_required' USING ERRCODE = '22023';
  END IF;

  IF p_line_ids IS NULL OR cardinality(p_line_ids) = 0 THEN
    SELECT coalesce(array_agg(sub.id), '{}'::uuid[])
    INTO v_ids
    FROM (
      SELECT ei.id
      FROM app.estimate_items ei
      WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
      ORDER BY ei.created_at
    ) sub;
  ELSE
    v_ids := p_line_ids;
  END IF;

  IF v_ids IS NULL OR coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)::int
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_line_ids' USING ERRCODE = '23514';
  END IF;

  v_order_number := nullif(trim(coalesce(p_order_number_override, '')), '');
  IF v_order_number IS NULL THEN
    v_order_number := app._next_order_number(p_tenant_id);
  END IF;

  v_delivery := coalesce(p_expected_delivery, (CURRENT_DATE + 7));

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    v_sub := v_sub + (v_item.qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100));
    v_tax := v_tax
      + (v_item.qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100))
        * coalesce(v_item.tax_pct, v_item.tax_rate, 0) / 100;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);

  INSERT INTO app.orders (
    tenant_id,
    buyer_id,
    placed_by,
    order_number,
    status,
    source,
    catalog_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    placed_at,
    estimate_id,
    expected_delivery,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
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
    v_est.catalog_id,
    v_sub,
    v_tax,
    v_total,
    coalesce(v_est.currency, 'INR'),
    v_est.notes,
    now(),
    p_estimate_id,
    v_delivery,
    v_est.buyer_po_ref,
    coalesce(v_est.discount_flat, 0),
    coalesce(v_est.freight, 0),
    coalesce(v_est.round_off, 0),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id
      AND ei.deleted_at IS NULL
      AND ei.id = ANY (v_ids)
  LOOP
    INSERT INTO app.order_items (
      order_id,
      tenant_product_id,
      qty,
      unit_price,
      tax_rate,
      line_total,
      disc_pct,
      tax_pct,
      scheme_tag,
      created_by,
      updated_by
    )
    VALUES (
      v_order_id,
      v_item.tenant_product_id,
      v_item.qty,
      v_item.unit_price,
      coalesce(v_item.tax_rate, v_item.tax_pct, 0),
      v_item.line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, 0),
      v_item.scheme_tag,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimate_items ei
  SET
    deleted_at = now(),
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE ei.estimate_id = p_estimate_id
    AND ei.id = ANY (v_ids)
    AND ei.deleted_at IS NULL;

  UPDATE app.estimates
  SET
    status = 'converted',
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
    jsonb_build_object('to', 'converted', 'order_id', v_order_id, 'order_number', v_order_number, 'line_ids', v_ids),
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
    notes,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
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
    v_est.notes,
    v_est.buyer_po_ref,
    coalesce(v_est.discount_flat, 0),
    coalesce(v_est.freight, 0),
    coalesce(v_est.round_off, 0),
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
      disc_pct,
      tax_pct,
      scheme_tag,
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
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, 0),
      v_item.scheme_tag,
      p_actor_user_id,
      p_actor_user_id
    );
  END LOOP;

  UPDATE app.estimates
  SET
    status = 'invoiced',
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
    catalog_id,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    source,
    expires_at,
    buyer_po_ref,
    discount_flat,
    freight,
    round_off,
    valid_until,
    date_issued,
    created_by,
    updated_by
  )
  VALUES (
    v_src.tenant_id,
    v_src.buyer_id,
    v_new_number,
    'draft',
    v_src.catalog_id,
    v_src.subtotal,
    v_src.tax_amount,
    v_src.total_amount,
    COALESCE(v_src.currency, 'INR'),
    v_src.notes,
    'seller',
    v_expires,
    v_src.buyer_po_ref,
    coalesce(v_src.discount_flat, 0),
    coalesce(v_src.freight, 0),
    coalesce(v_src.round_off, 0),
    coalesce(v_src.valid_until, (v_expires AT TIME ZONE 'Asia/Kolkata')::date),
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
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
      disc_pct,
      tax_pct,
      scheme_tag,
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
      COALESCE(v_item.disc_pct, v_item.discount_pct, 0),
      COALESCE(v_item.tax_pct, v_item.tax_rate, 0),
      v_item.scheme_tag,
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

CREATE OR REPLACE FUNCTION app.estimate_void(
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
BEGIN
  PERFORM app._estimate_assert_seller_admin(p_tenant_id, p_actor_user_id);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;

  UPDATE app.estimates
  SET
    status = 'void',
    voided_at = now(),
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
    jsonb_build_object('to', 'void'),
    now()
  );

  RETURN jsonb_build_object('ok', true, 'estimate_id', p_estimate_id);
END;
$$;

GRANT EXECUTE ON FUNCTION app.estimate_send(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_accept(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_decline(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(uuid, uuid, uuid, uuid[], date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_invoice(uuid, uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_duplicate(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_void(uuid, uuid, uuid) TO authenticated, service_role;

-- ── Order confirmation + inventory stub ─────────────────────────────────────

CREATE OR REPLACE FUNCTION app.confirm_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_short_lines jsonb := '[]'::jsonb;
  v_line record;
  v_on_hand integer;
BEGIN
  SELECT *
  INTO STRICT v_order
  FROM app.orders o
  WHERE o.id = p_order_id
    AND o.deleted_at IS NULL;

  IF v_order.tenant_id <> app.jwt_tenant_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_seller() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT oi.id, oi.tenant_product_id, oi.qty
    FROM app.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    SELECT COALESCE(SUM(ti.qty_available), 0)::integer
    INTO v_on_hand
    FROM app.tenant_inventory ti
    WHERE ti.tenant_product_id = v_line.tenant_product_id;

    UPDATE app.order_items
    SET
      on_hand_at_confirm = v_on_hand,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = v_line.id;

    IF v_line.qty > v_on_hand THEN
      v_short_lines := v_short_lines || jsonb_build_object(
        'line_id', v_line.id,
        'tenant_product_id', v_line.tenant_product_id,
        'qty', v_line.qty,
        'on_hand', v_on_hand,
        'shortfall', GREATEST(v_line.qty - v_on_hand, 0)
      );
    END IF;
  END LOOP;

  UPDATE app.orders
  SET
    status = 'received',
    placed_at = COALESCE(placed_at, now()),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_order_id;

  INSERT INTO app.audit_log (
    tenant_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    diff,
    ts
  )
  VALUES (
    v_order.tenant_id,
    auth.uid(),
    'order',
    p_order_id,
    'status_change',
    jsonb_build_object(
      'to', 'received',
      'has_backorder', COALESCE(jsonb_array_length(v_short_lines), 0) > 0
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'short_lines', v_short_lines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.confirm_order(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.release_order_reservation(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM app.orders o
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND o.status = 'cancelled'
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'order_not_cancelled_or_missing' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'reservation_not_implemented');
END;
$$;

REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM anon;
REVOKE ALL ON FUNCTION app.release_order_reservation(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.release_order_reservation(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.reserve_inventory_for_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM 1 FROM app.invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.reserve_inventory_for_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_inventory_for_invoice(uuid) TO service_role;
