-- Fix invoice/order status eligibility helpers used by metrics v2:
--
-- 1. app.invoice_status_gmv_included previously included 'draft', which
--    contradicts specs/metrics-definitions-2026-07.md's stated accounting-practice
--    definition (sent/issued, partially-paid, paid, overdue) and inflates
--    invoices_gmv/invoice_count relative to any accounting system (e.g. Zoho)
--    that never records a draft invoice as revenue. Dropping 'draft' here.
--
-- 2. Several helpers reference status literals that are not legal values under
--    the actual CHECK constraints (dead branches that can never match):
--    - app.invoices.status legal set: draft, sent, paid, overdue, void, unpaid,
--      partially_paid, viewed (no 'issued', no 'cancelled')
--    - app.orders.status legal set: draft, received, confirmed,
--      partially_dispatched, dispatched, delivered, cancelled, open, invoiced,
--      partially_invoiced, overdue (no 'accepted', no 'paid', no 'completed')
--    Removing the dead literals for clarity; behavior is unchanged since they
--    never matched any real row.
--
-- Downstream snapshots (metrics_tenant_commercial_snapshot, metrics_buyer_snapshot,
-- metrics_tenant_daily, metrics_location_snapshot, metrics_product_snapshot, etc.)
-- read through these functions at refresh time, so their invoice-GMV/count figures
-- will drop by whatever value currently sits in 'draft' status once the next
-- refresh runs for each tenant.

CREATE OR REPLACE FUNCTION "app"."invoice_status_gmv_included"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'sent',
    'viewed',
    'unpaid',
    'partially_paid',
    'paid',
    'overdue'
  );
$$;

CREATE OR REPLACE FUNCTION "app"."invoice_status_has_receivable"("p_status" "text", "p_outstanding_balance" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_outstanding_balance, 0) > 0
    AND COALESCE(p_status, '') IN ('sent', 'viewed', 'unpaid', 'partially_paid', 'overdue');
$$;

CREATE OR REPLACE FUNCTION "app"."invoice_status_in_flow"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') NOT IN ('void');
$$;

CREATE OR REPLACE FUNCTION "app"."order_status_is_open"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'draft',
    'open',
    'received',
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'partially_invoiced',
    'overdue'
  );
$$;

CREATE OR REPLACE FUNCTION "app"."order_status_is_downstream_quality"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(p_status, '') IN (
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'delivered',
    'invoiced',
    'partially_invoiced'
  );
$$;
