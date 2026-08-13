-- Orders/Invoices/Estimates number search bypasses its own trigram index:
-- idx_{orders,invoices,estimates}_number_trgm is built on lower(<number>),
-- but the app filters the raw column with ILIKE '%term%' — Postgres does not
-- rewrite a raw-column ILIKE to use a lower()-expression index, so every
-- search does a seq scan today. These RPCs filter on lower(<number>) LIKE
-- directly, matching the indexed expression exactly.

CREATE FUNCTION app.search_orders_number_ids(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
STABLE
AS $$
  SELECT o.id
  FROM app.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND lower(o.order_number) LIKE '%' || lower(p_query) || '%'
  LIMIT LEAST(GREATEST(p_limit, 1), 2000);
$$;

CREATE FUNCTION app.search_invoices_number_ids(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
STABLE
AS $$
  SELECT i.id
  FROM app.invoices i
  WHERE i.tenant_id = p_tenant_id
    AND i.deleted_at IS NULL
    AND lower(i.invoice_number) LIKE '%' || lower(p_query) || '%'
  LIMIT LEAST(GREATEST(p_limit, 1), 2000);
$$;

CREATE FUNCTION app.search_estimates_number_ids(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
STABLE
AS $$
  SELECT e.id
  FROM app.estimates e
  WHERE e.tenant_id = p_tenant_id
    AND e.deleted_at IS NULL
    AND e.estimate_number IS NOT NULL
    AND lower(e.estimate_number) LIKE '%' || lower(p_query) || '%'
  LIMIT LEAST(GREATEST(p_limit, 1), 2000);
$$;

REVOKE ALL ON FUNCTION app.search_orders_number_ids(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_orders_number_ids(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_orders_number_ids(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION app.search_invoices_number_ids(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_invoices_number_ids(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_invoices_number_ids(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION app.search_estimates_number_ids(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.search_estimates_number_ids(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.search_estimates_number_ids(uuid, text, integer) TO service_role;
