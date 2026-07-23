-- Stock-status bucket for product automatic-membership filters (Pricelists, Campaign-products).
-- Evaluated against the latest app.tenant_inventory snapshot only, per requirement 3.
-- Precedence: New stock wins over Low/Out, even if the restock qty is still at/below reorder_point.

CREATE OR REPLACE FUNCTION "app"."derive_stock_status_bucket"(
    "p_qty_available" numeric,
    "p_reorder_point" numeric,
    "p_is_new_today" boolean
) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_is_new_today THEN 'new_stock'
    WHEN p_qty_available IS NULL OR p_qty_available <= 0 THEN 'out_of_stock'
    WHEN p_reorder_point IS NOT NULL AND p_qty_available <= p_reorder_point THEN 'low_stock'
    ELSE 'in_stock'
  END;
$$;

ALTER FUNCTION "app"."derive_stock_status_bucket"(numeric, numeric, boolean) OWNER TO "postgres";

-- Helper: has this product had a stock_in_events row in the last day (mirrors the existing
-- new_in_stock_today concept used by evaluate_product_for_price_lists/campaigns).
CREATE OR REPLACE FUNCTION "app"."product_is_new_stock_today"("p_tenant_product_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "app"."stock_in_events" sie
    WHERE sie.tenant_product_id = p_tenant_product_id
      AND sie.event_at >= now() - INTERVAL '1 day'
  );
$$;

ALTER FUNCTION "app"."product_is_new_stock_today"("uuid") OWNER TO "postgres";
