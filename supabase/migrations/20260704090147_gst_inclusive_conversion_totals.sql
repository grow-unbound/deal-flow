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
  v_gst_inclusive boolean := false;
  v_policy_rate numeric := 18;
  v_taxable numeric := 0;
  v_item_tax_rate numeric := 0;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  SELECT
    COALESCE((settings->'business_policy'->>'gst_inclusive')::boolean, false),
    COALESCE((settings->'business_policy'->>'gst_rate')::numeric, 18)
  INTO v_gst_inclusive, v_policy_rate
  FROM app.tenant_settings
  WHERE tenant_id = p_tenant_id;
  v_gst_inclusive := COALESCE(v_gst_inclusive, false);
  v_policy_rate := COALESCE(v_policy_rate, 18);

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
    v_taxable := v_item.qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_sub := v_sub + v_taxable;
    IF NOT v_gst_inclusive THEN
      v_tax := v_tax + (v_taxable * v_item_tax_rate / 100);
    END IF;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);

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
    v_est.campaign_id,
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
      coalesce(v_item.tax_rate, v_item.tax_pct, v_policy_rate),
      v_item.line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate),
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
  v_gst_inclusive boolean := false;
  v_policy_rate numeric := 18;
  v_taxable numeric := 0;
  v_item_tax_rate numeric := 0;
BEGIN
  PERFORM app._estimate_assert_seller_member(p_tenant_id, p_actor_user_id);

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'due_date required' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE((settings->'business_policy'->>'gst_inclusive')::boolean, false),
    COALESCE((settings->'business_policy'->>'gst_rate')::numeric, 18)
  INTO v_gst_inclusive, v_policy_rate
  FROM app.tenant_settings
  WHERE tenant_id = p_tenant_id;
  v_gst_inclusive := COALESCE(v_gst_inclusive, false);
  v_policy_rate := COALESCE(v_policy_rate, 18);

  SELECT * INTO STRICT v_est
  FROM app.estimates e
  WHERE e.id = p_estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  IF v_est.status <> 'accepted' THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '23514';
  END IF;
  IF v_est.converted_to_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_invoiced' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT ei.*
    FROM app.estimate_items ei
    WHERE ei.estimate_id = p_estimate_id AND ei.deleted_at IS NULL
  LOOP
    v_taxable := v_item.qty * v_item.unit_price * (1 - coalesce(v_item.disc_pct, v_item.discount_pct, 0) / 100);
    v_item_tax_rate := coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate);
    v_sub := v_sub + v_taxable;
    IF NOT v_gst_inclusive THEN
      v_tax := v_tax + (v_taxable * v_item_tax_rate / 100);
    END IF;
  END LOOP;

  v_total := greatest(v_sub - coalesce(v_est.discount_flat, 0), 0) + v_tax + coalesce(v_est.freight, 0) + coalesce(v_est.round_off, 0);
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
      coalesce(v_item.tax_rate, v_item.tax_pct, v_policy_rate),
      v_item.line_total,
      coalesce(v_item.disc_pct, v_item.discount_pct, 0),
      coalesce(v_item.tax_pct, v_item.tax_rate, v_policy_rate),
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

GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(uuid, uuid, uuid, uuid[], date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_invoice(uuid, uuid, uuid, timestamptz) TO authenticated, service_role;
