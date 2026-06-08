-- EP-17-004: estimate detail view — void status, delivery receipt fields, convert from sent with line selection

ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_by_name text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimate_version integer NOT NULL DEFAULT 1;

ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_status_check CHECK (
    status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'converted', 'invoiced', 'void')
  );

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

  v_total := v_sub + v_tax;

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
  SET deleted_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE ei.estimate_id = p_estimate_id
    AND ei.id = ANY (v_ids)
    AND ei.deleted_at IS NULL;

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

GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(uuid, uuid, uuid, uuid[], date, text) TO authenticated, service_role;

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
  SET status = 'void',
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

GRANT EXECUTE ON FUNCTION app.estimate_void(uuid, uuid, uuid) TO authenticated, service_role;
