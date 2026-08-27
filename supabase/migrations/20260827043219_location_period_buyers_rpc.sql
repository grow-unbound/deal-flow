-- Per-buyer invoice breakdown for a location within a date range, used by the
-- Location Details "Buyers" tab. Mirrors the invoice_buyer_count predicate in
-- metrics_location_period_summary (app.invoice_status_gmv_included, invoice_date
-- range) so the tab's buyer count matches the Locations landing "Active Buyers"
-- column for the same location/period.
CREATE OR REPLACE FUNCTION app.get_location_period_buyers(
  p_tenant_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end_exclusive date
)
RETURNS TABLE (
  buyer_id uuid,
  business_name text,
  invoice_value numeric,
  invoice_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.buyer_id,
    b.business_name,
    SUM(i.total_amount)::numeric AS invoice_value,
    COUNT(*)::bigint AS invoice_count
  FROM app.invoices i
  JOIN app.buyers b ON b.id = i.buyer_id AND b.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id
    AND i.location_id = p_location_id
    AND i.deleted_at IS NULL
    AND app.invoice_status_gmv_included(i.status)
    AND i.invoice_date >= p_period_start
    AND i.invoice_date < p_period_end_exclusive
  GROUP BY i.buyer_id, b.business_name
  ORDER BY invoice_value DESC;
$$;

ALTER FUNCTION app.get_location_period_buyers(uuid, uuid, date, date) OWNER TO postgres;

REVOKE ALL ON FUNCTION app.get_location_period_buyers(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_location_period_buyers(uuid, uuid, date, date) TO service_role;
