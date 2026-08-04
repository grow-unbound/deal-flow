-- v4 "value created"/demand flow metrics (estimate_value, app_estimate_value,
-- primary_demand_value, and the buyer/location/campaign period-summary demand
-- existence checks) currently filter estimates with
-- `app.estimate_status_is_open(status) OR status = 'accepted'` -- i.e. only
-- draft/sent/accepted count. That silently drops declined/expired/invoiced/
-- converted estimates out of the period total, even though they were real
-- demand created in that period. Per spec (specs/metrics-v4-final-2026-07.md),
-- these are flow metrics -- date-windowed, no status filter beyond excluding
-- dead/void records. The only estimate status that should be excluded is
-- 'void' (the estimate-side equivalent of an order's 'cancelled').
--
-- app.order_status_in_flow is unaffected by this fix -- it already reduces to
-- "not cancelled" among real order statuses (its other excluded literals --
-- archived/rejected/void/closed -- are dead, never-matching values under the
-- actual app.orders.status CHECK constraint).
CREATE OR REPLACE FUNCTION "app"."estimate_status_counts_as_demand"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') <> 'void';
$$;
