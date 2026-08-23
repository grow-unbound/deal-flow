-- Perf: app.resolve_prices_batch looked batched (one array param, one RPC call)
-- but its body was `SELECT unnest(ids), app.resolve_price(id, buyer, qty)` --
-- Postgres evaluates the scalar app.resolve_price() once per array element,
-- and resolve_price() itself does up to 3 sequential JOINs (buyer price-list
-- -> cohort price-list -> all-buyers price-list -> base price). A true N+1
-- hidden inside a single RPC call. Confirmed via pg_stat_user_tables:
-- cohort_members (62 rows) had 4.8M seq_scans / 113M tuples read; price_lists
-- (17 rows) 1.6M seq_scans / 19M tuples; tenants (16 rows) 1.85M seq_scans /
-- 7.2M tuples -- all tiny tables, hammered by scalar-per-row execution on
-- every buyer catalog page load (N products x 3 JOINs, all in-DB).
--
-- Rewrite as one set-based query: UNION ALL the three price-list tiers
-- (buyer-specific, cohort, all-buyers) tagged with a tier rank, pick the
-- winning row per tenant_product_id via DISTINCT ON ordered by
-- (tier ASC, priority DESC, min_qty DESC) -- this is the exact same
-- precedence app.resolve_price() used sequentially (return on first
-- non-null tier, break ties within a tier by priority then min_qty) -- then
-- fall back to tenant_products.base_selling_price when no price-list row
-- matched at all. app.resolve_price() itself is left in place (still used
-- ad-hoc by the single-lookup seller pricing tool), only the batch RPC's
-- internals change; its signature and grants are unchanged by
-- CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION app.resolve_prices_batch(p_tenant_product_ids uuid[], p_buyer_id uuid, p_qty numeric DEFAULT 1)
 RETURNS TABLE(tenant_product_id uuid, unit_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'catalog', 'public'
AS $function$
  WITH ids AS (
    SELECT DISTINCT u.id AS tenant_product_id
    FROM unnest(p_tenant_product_ids) AS u(id)
  ),
  candidates AS (
    SELECT
      pli.tenant_product_id,
      pli.price,
      pl.priority,
      pli.min_qty,
      1 AS tier
    FROM app.price_list_items pli
    JOIN app.price_lists pl ON pl.id = pli.price_list_id
    JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
    WHERE pli.tenant_product_id = ANY (p_tenant_product_ids)
      AND pli.deleted_at IS NULL
      AND pli.min_qty <= p_qty
      AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
      AND pla.target_type = 'buyer'
      AND pla.target_id = p_buyer_id
      AND pl.is_active = true
      AND pl.valid_from <= now()
      AND (pl.valid_to IS NULL OR pl.valid_to > now())

    UNION ALL

    SELECT
      pli.tenant_product_id,
      pli.price,
      pl.priority,
      pli.min_qty,
      2 AS tier
    FROM app.price_list_items pli
    JOIN app.price_lists pl ON pl.id = pli.price_list_id
    JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
    JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id AND cm.valid_until IS NULL
    WHERE pli.tenant_product_id = ANY (p_tenant_product_ids)
      AND pli.deleted_at IS NULL
      AND pli.min_qty <= p_qty
      AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
      AND pla.target_type = 'cohort'
      AND cm.buyer_id = p_buyer_id
      AND pl.is_active = true
      AND pl.valid_from <= now()
      AND (pl.valid_to IS NULL OR pl.valid_to > now())

    UNION ALL

    SELECT
      pli.tenant_product_id,
      pli.price,
      pl.priority,
      pli.min_qty,
      3 AS tier
    FROM app.price_list_items pli
    JOIN app.price_lists pl ON pl.id = pli.price_list_id
    JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
    WHERE pli.tenant_product_id = ANY (p_tenant_product_ids)
      AND pli.deleted_at IS NULL
      AND pli.min_qty <= p_qty
      AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
      AND pla.target_type = 'all_buyers'
      AND pl.is_active = true
      AND pl.valid_from <= now()
      AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ),
  best AS (
    SELECT DISTINCT ON (c.tenant_product_id)
      c.tenant_product_id,
      c.price
    FROM candidates c
    ORDER BY c.tenant_product_id, c.tier ASC, c.priority DESC, c.min_qty DESC
  )
  SELECT
    ids.tenant_product_id,
    COALESCE(best.price, tp.base_selling_price) AS unit_price
  FROM ids
  LEFT JOIN best ON best.tenant_product_id = ids.tenant_product_id
  LEFT JOIN app.tenant_products tp ON tp.id = ids.tenant_product_id;
$function$;
