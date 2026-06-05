ALTER TABLE app.price_lists
ADD COLUMN IF NOT EXISTS pricing_strategy text NOT NULL DEFAULT 'edit_each',
ADD COLUMN IF NOT EXISTS strategy_value numeric,
ADD COLUMN IF NOT EXISTS filters jsonb NOT NULL DEFAULT '{"brand_names":[],"category_names":[]}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'price_lists_pricing_strategy_check'
      AND conrelid = 'app.price_lists'::regclass
  ) THEN
    ALTER TABLE app.price_lists
    ADD CONSTRAINT price_lists_pricing_strategy_check
    CHECK (pricing_strategy IN ('edit_each', 'margin_from_mrp', 'flat_off_base'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.price_list_duplicate(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS app.price_lists
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source app.price_lists;
  v_copy app.price_lists;
BEGIN
  SELECT * INTO v_source
  FROM app.price_lists
  WHERE id = p_price_list_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.price_lists (
    tenant_id,
    name,
    currency,
    valid_from,
    valid_to,
    priority,
    is_active,
    pricing_strategy,
    strategy_value,
    filters,
    created_at,
    updated_at,
    created_by,
    updated_by,
    deleted_at
  )
  VALUES (
    v_source.tenant_id,
    v_source.name || ' (copy)',
    v_source.currency,
    now() + interval '1 day',
    v_source.valid_to,
    v_source.priority,
    false,
    v_source.pricing_strategy,
    v_source.strategy_value,
    COALESCE(v_source.filters, '{"brand_names":[],"category_names":[]}'::jsonb),
    now(),
    now(),
    p_actor_user_id,
    p_actor_user_id,
    NULL
  )
  RETURNING * INTO v_copy;

  INSERT INTO app.price_list_items (
    price_list_id,
    tenant_product_id,
    price,
    min_qty,
    max_qty,
    created_at,
    updated_at,
    created_by,
    updated_by,
    deleted_at
  )
  SELECT
    v_copy.id,
    pli.tenant_product_id,
    pli.price,
    pli.min_qty,
    pli.max_qty,
    now(),
    now(),
    p_actor_user_id,
    p_actor_user_id,
    NULL
  FROM app.price_list_items pli
  WHERE pli.price_list_id = p_price_list_id
    AND pli.deleted_at IS NULL;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    v_copy.id,
    'create',
    jsonb_build_object('event', 'price_list_duplicated', 'source_price_list_id', p_price_list_id),
    now()
  );

  RETURN v_copy;
END;
$$;
