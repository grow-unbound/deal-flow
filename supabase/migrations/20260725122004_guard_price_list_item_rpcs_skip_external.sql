-- Externally-sourced (Zoho-imported) price lists must have their item membership
-- and pricing driven exclusively by the sync (persistPricelists in
-- integrations-persist.ts). price_list_update_item_price is called from the
-- seller-app's manual item-edit UI with no check for this — a seller could edit
-- a Zoho item's price by hand, only to have it silently reverted on the next
-- sync (or worse, permanently orphaned if the edit adds a row the sync doesn't
-- recognize). Reject the edit outright instead.

CREATE OR REPLACE FUNCTION "app"."price_list_update_item_price"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_item_id" "uuid", "p_list_price" numeric, "p_actor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "app"."price_list_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item app.price_list_items;
  v_external_ref text;
BEGIN
  IF p_list_price IS NULL OR p_list_price <= 0 THEN
    RAISE EXCEPTION 'List price must be positive';
  END IF;

  SELECT external_ref INTO v_external_ref
  FROM app.price_lists
  WHERE id = p_price_list_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF v_external_ref IS NOT NULL THEN
    RAISE EXCEPTION 'This price list is managed by your Zoho integration. Products and prices sync automatically — edit them in Zoho.';
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

ALTER FUNCTION "app"."price_list_update_item_price"("p_tenant_id" "uuid", "p_price_list_id" "uuid", "p_item_id" "uuid", "p_list_price" numeric, "p_actor_user_id" "uuid") OWNER TO "postgres";
