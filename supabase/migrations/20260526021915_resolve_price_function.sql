CREATE OR REPLACE FUNCTION app.resolve_price(
  p_tenant_product_id uuid,
  p_buyer_id uuid,
  p_qty numeric DEFAULT 1
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
DECLARE
  v_price numeric;
BEGIN
  -- Step 1: catalog price_override (most specific published catalog)
  SELECT pci.price_override INTO v_price
  FROM app.published_catalog_items pci
  JOIN app.published_catalogs pc ON pc.id = pci.catalog_id
  WHERE pci.tenant_product_id = p_tenant_product_id
    AND pc.status = 'published'
    AND pci.price_override IS NOT NULL
    AND (
      (pc.scope_type = 'all')
      OR (pc.scope_type = 'buyer' AND (pc.scope_value->>'buyer_id')::uuid = p_buyer_id)
      OR (pc.scope_type = 'cohort' AND EXISTS (
            SELECT 1 FROM app.cohort_members cm
            WHERE cm.cohort_id = (pc.scope_value->>'cohort_id')::uuid
              AND cm.buyer_id = p_buyer_id
         ))
    )
  ORDER BY pci.price_override ASC  -- lowest override price wins
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  -- Step 2: buyer-specific price lists
  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
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

  -- Step 3: cohort price lists (static cohort membership)
  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id
  WHERE pli.tenant_product_id = p_tenant_product_id
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

  -- Step 4: all_buyers price lists
  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'all_buyers'
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  -- Step 5: base_selling_price fallback
  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;  -- NULL if product not found or price not set
END;
$$;

COMMENT ON FUNCTION app.resolve_price IS
  'Resolves effective price for a buyer+product+qty. Resolution order: '
  '(1) catalog price_override, (2) buyer price list, (3) cohort price list, '
  '(4) all_buyers price list, (5) base_selling_price. Returns NULL if none set.';
