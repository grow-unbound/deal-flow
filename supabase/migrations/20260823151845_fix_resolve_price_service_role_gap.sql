-- Fix: app.resolve_price's ownership check (added in
-- 20260823105736_harden_security_definer_functions_and_grants.sql) only
-- accounted for two caller contexts -- a buyer's own JWT (app.jwt_buyer_id())
-- or a seller's JWT (app.jwt_role() LIKE 'seller_%') -- and RAISEd 'forbidden'
-- for anything else. It missed the third real caller: this app's own backend
-- calling via the service_role client (supabaseAdmin) on a buyer's behalf,
-- after already verifying that buyer's identity at the app layer
-- (requireBuyerAccessProfile / getVerifiedClaims). For a service-role
-- connection, auth.jwt()->>'role' is literally 'service_role' -- it never
-- matches 'seller_%', so every such call fell through to the else branch.
--
-- Live production impact (confirmed via Supabase logs + pg_proc source scan
-- for callers of resolve_price(), 2026-08-23): app.search_products_scoped
-- calls resolve_price() per row and is used by both the buyer catalog page
-- (category/brand product listings) and buyer search -- both broke the
-- moment this function was redeployed. 26+ "forbidden" errors logged on
-- GET /api/buyer/catalog before this fix.
--
-- Fix: trust the service_role caller the same way the rest of that migration
-- already trusts it for the other 157 functions -- add it as an explicit
-- bypass branch, ahead of the buyer/seller checks. Everything else in this
-- function (the three price-list tiers, cohort join, all_buyers fallback,
-- base_selling_price fallback) is unchanged.

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
  ORDER BY pl.priority DESC, pli.min_qty DESC
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
  ORDER BY pl.priority DESC, pli.min_qty DESC
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
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;
END;
$function$;
