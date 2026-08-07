-- ============================================================
-- Demo tenants — metrics backfill (materializes KPI tiles/landing pages)
--
-- NOT run automatically as part of writing these seed scripts — this
-- file is provided for you to review and run explicitly once you've
-- checked 00..90 and are ready. See README.md.
--
-- app.post_sync_rebuild(tenant_id, days) is dead (calls dropped v1
-- functions — see README.md). The v4 replacement is the purpose-built
-- manual/seed backfill entrypoint: app._metrics_v4_backfill_driver.
-- ============================================================

-- Verify dispatch is on before relying on the drain loop; do not force-enable
-- a global control silently — if this warns, decide deliberately whether to
-- run `SELECT app.metrics_set_dispatch_enabled(true);` for this environment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.metrics_runtime_control
    WHERE control_scope = 'global' AND dispatch_enabled = true
  ) THEN
    RAISE WARNING 'metrics dispatch is disabled globally — the backfill drain loop below will idle without materializing anything. Enable via app.metrics_set_dispatch_enabled(true) if appropriate for this environment.';
  END IF;
END $$;

DO $$
DECLARE
  v_tenant_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_tenant_ids
  FROM app.tenants
  WHERE slug IN (
    'electricals-demo', 'mobiles-electronics-demo', 'automotive-spares-demo',
    'hardware-building-demo', 'cosmetics-salon-demo'
  );

  IF v_tenant_ids IS NULL OR array_length(v_tenant_ids, 1) < 5 THEN
    RAISE EXCEPTION 'Expected 5 demo tenants, found %. Run 01..05_*.sql first.', coalesce(array_length(v_tenant_ids, 1), 0);
  END IF;

  CALL app._metrics_v4_backfill_driver(
    p_tenant_ids => v_tenant_ids,
    p_backfill_start => (current_date - 14)
  );
END $$;

-- Post-run check — dead_letter_count should be 0 for all 5 tenants.
SELECT *
FROM app.metrics_inspect() mi
WHERE mi.tenant_id IN (
  SELECT id FROM app.tenants WHERE slug IN (
    'electricals-demo', 'mobiles-electronics-demo', 'automotive-spares-demo',
    'hardware-building-demo', 'cosmetics-salon-demo'
  )
);
