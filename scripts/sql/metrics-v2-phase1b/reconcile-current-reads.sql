BEGIN;

CREATE TEMP TABLE metrics_v2_phase1b_read_contract (
  surface text NOT NULL,
  source_family text NOT NULL,
  current_contract text NOT NULL,
  target_contract text NOT NULL,
  phase1b_status text NOT NULL
) ON COMMIT DROP;

INSERT INTO metrics_v2_phase1b_read_contract (surface, source_family, current_contract, target_contract, phase1b_status)
VALUES
  ('seller_dashboard', 'kpi_tenant_daily + bounded raw previews', 'current consumer retained', 'joined tenant snapshots plus bounded actions', 'contract-only'),
  ('transaction_landings', 'kpi_estimates_daily/kpi_orders_daily/kpi_invoices_daily', 'current consumer retained', 'commercial snapshot pulse plus raw paginated lists', 'contract-only'),
  ('customers', 'buyers_snapshot + kpi_buyers_daily', 'current consumer retained', 'metrics_buyer_snapshot and bounded callouts', 'contract-only'),
  ('products', 'products_snapshot + kpi_product_daily', 'current consumer retained', 'metrics_product_snapshot and bounded explore RPC', 'contract-only'),
  ('buyer_app', 'buyer_app_snapshot + buyer_app_activity', 'current consumer retained', 'metrics_tenant_buyer_app_snapshot plus action queries', 'contract-only'),
  ('brands_categories_locations_warehouses', 'V1 snapshots + low-cardinality daily facts', 'current consumer retained', 'reshaped scalar snapshots and sparse location facts only where consumed', 'contract-only'),
  ('cohorts_pricelists_campaigns', 'bounded aggregate RPCs', 'current consumer retained', 'current validity/coverage snapshots plus bounded callouts', 'contract-only');

DO $$
DECLARE
  v_missing_tables text[];
BEGIN
  SELECT COALESCE(array_agg(table_name ORDER BY table_name), ARRAY[]::text[])
    INTO v_missing_tables
  FROM (
    VALUES
      ('buyers_snapshot'),
      ('products_snapshot'),
      ('buyer_app_snapshot'),
      ('kpi_tenant_daily'),
      ('kpi_product_daily'),
      ('kpi_buyers_daily'),
      ('kpi_orders_daily'),
      ('kpi_estimates_daily'),
      ('kpi_invoices_daily')
  ) AS required(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'app'
      AND t.table_name = required.table_name
  );

  IF array_length(v_missing_tables, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Required current read family missing during Phase 1B contract freeze: %', v_missing_tables;
  END IF;
END $$;

DO $$
DECLARE
  v_missing_phase2 text[];
  v_unexpected_phase3 text[];
BEGIN
  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO v_missing_phase2
  FROM (
    VALUES
      ('metrics_dirty_work'),
      ('metrics_runtime_control'),
      ('metrics_refresh_state'),
      ('metrics_refresh_leases'),
      ('metrics_execution_history')
  ) AS required(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'app'
      AND t.table_name = required.table_name
  );

  IF v_missing_phase2 IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 coordination tables must exist before this reconciliation fixture passes: %', v_missing_phase2;
  END IF;

  SELECT array_agg(p.proname ORDER BY p.proname)
    INTO v_unexpected_phase3
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app'
    AND p.proname IN ('metrics_mark_dirty', 'metrics_claim_dirty_work', 'metrics_refresh_tick');

  IF v_unexpected_phase3 IS NOT NULL THEN
    RAISE EXCEPTION 'Current-read reconciliation must not depend on Phase 3 runtime functions: %', v_unexpected_phase3;
  END IF;
END $$;

SELECT * FROM metrics_v2_phase1b_read_contract ORDER BY surface;

ROLLBACK;
