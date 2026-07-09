-- Performance: batch price resolution — replaces N calls to resolve_price()
-- with a single RPC call from the buyer catalog API.
--
-- Usage:
--   SELECT * FROM app.resolve_prices_batch(
--     ARRAY['uuid1','uuid2']::uuid[],
--     'buyer-uuid',
--     1
--   );

CREATE OR REPLACE FUNCTION app.resolve_prices_batch(
  p_tenant_product_ids uuid[],
  p_buyer_id           uuid,
  p_qty                numeric DEFAULT 1
)
RETURNS TABLE (tenant_product_id uuid, unit_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
  SELECT
    unnested.id,
    app.resolve_price(unnested.id, p_buyer_id, p_qty)
  FROM unnest(p_tenant_product_ids) AS unnested(id);
$$;
