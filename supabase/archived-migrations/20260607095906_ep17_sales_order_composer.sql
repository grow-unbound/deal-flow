ALTER TABLE app.orders
  ALTER COLUMN buyer_id DROP NOT NULL;

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES app.estimates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_backorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_note text,
  ADD COLUMN IF NOT EXISTS expected_delivery date;

ALTER TABLE app.order_items
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS scheme_tag text,
  ADD COLUMN IF NOT EXISTS on_hand_at_confirm integer;

CREATE INDEX IF NOT EXISTS idx_orders_estimate_id_ep17_sales_orders
  ON app.orders(estimate_id)
  WHERE deleted_at IS NULL AND estimate_id IS NOT NULL;

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
    SET on_hand_at_confirm = v_on_hand,
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
  SET status = 'received',
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
