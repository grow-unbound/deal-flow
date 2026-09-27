-- Harden app.resolve_price against three gaps found in the pending-buyer price-leak audit:
--   1. A `buyer_pending` session (has buyer_id + tenant_id claims, but is NOT approved for the
--      buyer app) passed the ownership check and could read its own buyer-specific prices. Deny.
--   2. Nothing tied the target product to the caller's tenant, so any JWT holder (and, with
--      p_buyer_id NULL, ANY caller, even anon) could read another tenant's base/all_buyers price
--      by guessing a tenant_product_id. Non-service callers now must hold a tenant claim and the
--      product must belong to it.
--   3. anon had EXECUTE. Nothing legitimate calls it as anon: the seller price-lookup hooks
--      (useResolvedPrice / useResolvePrice) run with an authenticated seller session, and the
--      buyer/guest storefront reaches it only via app.search_products_scoped / load_products_scoped,
--      which the server calls with the service role. Revoke from anon.
-- service_role behaviour is unchanged (trusted backend, validated by the app layer).
-- Callers checked: src/hooks/useResolvedPrice.ts, src/hooks/usePriceLists.ts (authenticated seller),
-- app.search_products_scoped / app.load_products_scoped (service_role, only when buyer_id IS NOT NULL).

CREATE OR REPLACE FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric DEFAULT 1)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'catalog', 'public'
AS $function$
DECLARE
  v_price numeric;
  v_role text := app.jwt_role();
BEGIN
  IF v_role = 'service_role' THEN
    -- Trusted backend call, already validated by the app layer before
    -- invoking this RPC -- no client-supplied JWT to check a claim against.
    NULL;
  ELSE
    -- Self-registered / not-yet-approved buyers never get buyer-specific pricing.
    IF v_role = 'buyer_pending' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- The product must belong to the caller's own tenant.
    IF app.jwt_tenant_id() IS NULL OR NOT EXISTS (
      SELECT 1 FROM app.tenant_products tp
      WHERE tp.id = p_tenant_product_id AND tp.tenant_id = app.jwt_tenant_id()
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    IF p_buyer_id IS NOT NULL THEN
      IF app.jwt_buyer_id() IS NOT NULL THEN
        IF p_buyer_id IS DISTINCT FROM app.jwt_buyer_id() THEN
          RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
        END IF;
      ELSIF v_role LIKE 'seller_%' THEN
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

REVOKE ALL ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.resolve_price(p_tenant_product_id uuid, p_buyer_id uuid, p_qty numeric) TO authenticated, service_role;
