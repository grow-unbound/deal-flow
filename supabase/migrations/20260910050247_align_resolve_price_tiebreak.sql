-- Keep scalar app.resolve_price aligned with app.resolve_prices_batch.
--
-- Batch pricing was made deterministic in
-- 20260823053455_resolve_prices_batch_deterministic_tiebreak.sql with a final
-- price ASC tie-break when two candidates are otherwise identical within the
-- same tier. The scalar resolver is still used by seller/buyer single-price
-- lookup flows and by older scoped RPCs, so it must choose the same row.

CREATE OR REPLACE FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric DEFAULT 1)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'catalog', 'public'
AS $function$
DECLARE
  v_price numeric;
BEGIN
  IF p_buyer_id IS NOT NULL THEN
    IF app.jwt_role() = 'service_role' THEN
      -- Trusted backend call, already validated by the app layer before
      -- invoking this RPC -- no client-supplied JWT to check an ownership
      -- claim against.
      NULL;
    ELSIF app.jwt_buyer_id() IS NOT NULL THEN
      IF p_buyer_id IS DISTINCT FROM app.jwt_buyer_id() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSIF app.jwt_role() LIKE 'seller_%' THEN
      IF NOT EXISTS (
        SELECT 1 FROM app.buyers b
        WHERE b.id = p_buyer_id AND b.tenant_id = app.jwt_tenant_id() AND b.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'buyer'
    AND pla.target_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC, pli.price ASC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id AND cm.valid_until IS NULL
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'cohort'
    AND cm.buyer_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC, pli.price ASC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.deleted_at IS NULL
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'all_buyers'
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC, pli.price ASC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;
END;
$function$;

REVOKE ALL ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) TO anon, authenticated, service_role;
