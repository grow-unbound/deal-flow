-- Follow-up to 20260823052945_rewrite_resolve_prices_batch_set_based.sql.
--
-- Verification against live data found 119 mismatches vs the old scalar
-- app.resolve_price(), all for one buyer (9aa22fa1-b22b-4d75-8a80-68183f018ab3)
-- across all of that buyer's products. Root cause: this buyer has two
-- buyer-tier price lists both at priority=0 ("Error" price_list_id
-- 0329143c..., and "General" price_list_id 3afc3bdf...) covering the same
-- products at the same min_qty=1 -- a genuine tie on every column the old
-- function ordered by (tier, priority DESC, min_qty DESC). The old
-- scalar resolve_price() broke that tie arbitrarily based on physical scan
-- order (stable in practice for its plan, but not a real SQL guarantee --
-- any index rebuild or planner change could have flipped it; this was a
-- latent bug, not intentional behavior). The set-based rewrite's different
-- query shape broke the same tie differently, which would have been a
-- real, silent, buyer-visible price change (7400 -> 7900 for this buyer).
--
-- Fix: make the tie-break explicit and deterministic instead of leaving it
-- to plan-dependent row order. Chose lowest price wins on a full tie --
-- buyer-favorable default, and happens to match today's live (accidental)
-- behavior for the one buyer this affects, so this migration causes zero
-- observable price changes on top of the previous migration.
--
-- Separately flagged to the user: a price list literally named "Error" is
-- live and assigned to a real buyer at priority 0 -- that's a data-quality
-- issue independent of this perf fix and is not resolved here.

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
    ORDER BY c.tenant_product_id, c.tier ASC, c.priority DESC, c.min_qty DESC, c.price ASC
  )
  SELECT
    ids.tenant_product_id,
    COALESCE(best.price, tp.base_selling_price) AS unit_price
  FROM ids
  LEFT JOIN best ON best.tenant_product_id = ids.tenant_product_id
  LEFT JOIN app.tenant_products tp ON tp.id = ids.tenant_product_id;
$function$;
