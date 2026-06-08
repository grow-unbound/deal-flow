CREATE OR REPLACE FUNCTION app.price_list_update_item_price(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_item_id uuid,
  p_list_price numeric,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS app.price_list_items
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item app.price_list_items;
BEGIN
  IF p_list_price IS NULL OR p_list_price <= 0 THEN
    RAISE EXCEPTION 'List price must be positive';
  END IF;

  UPDATE app.price_list_items pli
  SET price = p_list_price,
      updated_at = now(),
      updated_by = p_actor_user_id
  FROM app.price_lists pl
  WHERE pli.id = p_item_id
    AND pli.price_list_id = p_price_list_id
    AND pl.id = pli.price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
    AND pli.deleted_at IS NULL
  RETURNING pli.* INTO v_item;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Price list item not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'update',
    jsonb_build_object('event', 'item_price_updated', 'item_id', p_item_id, 'list_price', p_list_price),
    now()
  );

  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION app.price_list_extend_validity(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_valid_to timestamptz,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS app.price_lists
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_list app.price_lists;
BEGIN
  UPDATE app.price_lists pl
  SET valid_to = p_valid_to,
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE pl.id = p_price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
  RETURNING pl.* INTO v_price_list;

  IF v_price_list.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'update',
    jsonb_build_object('event', 'validity_extended', 'valid_to', p_valid_to),
    now()
  );

  RETURN v_price_list;
END;
$$;

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
    true,
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

CREATE OR REPLACE FUNCTION app.price_list_archive(
  p_tenant_id uuid,
  p_price_list_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS app.price_lists
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_list app.price_lists;
BEGIN
  UPDATE app.price_lists pl
  SET deleted_at = now(),
      updated_at = now(),
      updated_by = p_actor_user_id
  WHERE pl.id = p_price_list_id
    AND pl.tenant_id = p_tenant_id
    AND pl.deleted_at IS NULL
  RETURNING pl.* INTO v_price_list;

  IF v_price_list.id IS NULL THEN
    RAISE EXCEPTION 'Price list not found';
  END IF;

  INSERT INTO app.audit_log (tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'price_list',
    p_price_list_id,
    'delete',
    jsonb_build_object('event', 'price_list_archived'),
    now()
  );

  RETURN v_price_list;
END;
$$;
