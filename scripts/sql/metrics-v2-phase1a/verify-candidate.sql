WITH function_bodies AS (
  SELECT
    p.proname,
    pg_get_functiondef(p.oid) AS body
  FROM pg_proc p
  JOIN pg_namespace n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'app'
    AND p.proname IN (
      'dispatch_from_orders',
      'dispatch_from_invoices',
      'dispatch_from_estimates',
      'record_buyer_app_activity',
      'trg_post_sync_rebuild',
      'refresh_buyers_snapshot_for_buyer',
      'refresh_buyer_current_snapshot_for_buyer'
    )
)
SELECT
  proname,
  position('refresh_buyers_snapshot(v_tenant)' IN body) > 0 AS calls_tenant_buyers_refresh,
  position('refresh_buyer_current_snapshot(v_tenant)' IN body) > 0 AS calls_tenant_current_refresh,
  position('refresh_buyer_app_snapshot(v_tenant)' IN body) > 0 AS calls_tenant_buyer_app_refresh,
  position('refresh_buyers_snapshot_for_buyer' IN body) > 0 AS calls_buyer_scoped_buyers_refresh,
  position('refresh_buyer_current_snapshot_for_buyer' IN body) > 0 AS calls_buyer_scoped_current_refresh,
  position('post_sync_rebuild_deferred' IN body) > 0 AS records_deferred_post_sync_rebuild
FROM function_bodies
ORDER BY proname;
