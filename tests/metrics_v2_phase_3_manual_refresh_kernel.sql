-- Rollback-only behavioral checks for the Metrics V2 Phase 3 manual refresh kernel.
--
-- Prerequisite: the Phase 0A, Phase 2, and Phase 3 migrations are applied in
-- order. This fixture intentionally exercises only the manual dispatcher; it
-- does not install capture triggers, deploy an Edge Function, or schedule Cron.

BEGIN;

SET LOCAL ROLE service_role;

-- Deterministic, tenant-isolated source fixtures. Keep this set deliberately
-- small: Phase 3 must refresh exact keys and must not require a full-tenant
-- high-cardinality fixture to prove setup-count correctness.
INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
VALUES (
  '31000000-0000-4000-8000-000000000001'::uuid,
  'metrics-phase3-kernel',
  'Metrics Phase 3 Kernel',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.buyers (
  id, tenant_id, business_name, phone, is_active, external_ref, created_at, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000002'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  'Metrics Phase 3 Buyer',
  '9999999301',
  true,
  'metrics-phase3-buyer',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.locations (
  id, tenant_id, name, status, is_default, external_ref, created_at, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000003'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  'Metrics Phase 3 Location',
  'active',
  true,
  'metrics-phase3-location',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.warehouses (
  id, tenant_id, location_id, name, status, is_default, external_ref, created_at, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000004'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  '31000000-0000-4000-8000-000000000003'::uuid,
  'Metrics Phase 3 Warehouse',
  'active',
  true,
  'metrics-phase3-warehouse',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.tenant_brands (
  id, tenant_id, display_name_override, is_active, external_ref, created_at, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000005'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  'Metrics Phase 3 Brand',
  true,
  'metrics-phase3-brand',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.tenant_products (
  id, tenant_id, tenant_brand_id, internal_sku, name_override,
  is_active, external_ref, created_at, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000006'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  '31000000-0000-4000-8000-000000000005'::uuid,
  'METRICS-PHASE3-SKU',
  'Metrics Phase 3 Product',
  true,
  'metrics-phase3-product',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.tenant_inventory (
  id, tenant_product_id, warehouse_id, qty_available, qty_reserved,
  reorder_point, updated_at
)
VALUES (
  '31000000-0000-4000-8000-000000000007'::uuid,
  '31000000-0000-4000-8000-000000000006'::uuid,
  '31000000-0000-4000-8000-000000000004'::uuid,
  12,
  2,
  5,
  '2026-07-16 00:00:00+00'::timestamptz
);

SELECT app.metrics_set_dispatch_enabled(true, NULL, NULL, NULL);

-- Invalid domain/source pairs must be rejected before any dirty row is stored.
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM app.metrics_mark_dirty(
      '31000000-0000-4000-8000-000000000001'::uuid,
      'setup',
      'order',
      '31000000-0000-4000-8000-000000000010'::uuid
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'invalid setup/order source pair was accepted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app.metrics_dirty_work
    WHERE source_id = '31000000-0000-4000-8000-000000000010'::uuid
  ) THEN
    RAISE EXCEPTION 'invalid source created dirty work';
  END IF;
END $$;

-- Re-delivery of the same active source coalesces scalar bounds and increments
-- the version rather than creating a tenant/domain hot row.
DO $$
DECLARE
  v_first record;
  v_second record;
  v_work app.metrics_dirty_work%ROWTYPE;
BEGIN
  SELECT * INTO v_first
  FROM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'buyer',
    '31000000-0000-4000-8000-000000000011'::uuid,
    p_new_buyer_id => '31000000-0000-4000-8000-000000000002'::uuid,
    p_dirty_from => '2026-07-10'::date,
    p_dirty_to => '2026-07-12'::date
  );

  SELECT * INTO v_second
  FROM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'buyer',
    '31000000-0000-4000-8000-000000000011'::uuid,
    p_old_buyer_id => '31000000-0000-4000-8000-000000000002'::uuid,
    p_dirty_from => '2026-07-01'::date,
    p_dirty_to => '2026-07-15'::date
  );

  SELECT * INTO STRICT v_work
  FROM app.metrics_dirty_work
  WHERE id = v_first.work_id;

  IF v_second.work_id IS DISTINCT FROM v_first.work_id
     OR v_first.dirty_version <> 1
     OR v_second.dirty_version <> 2
     OR v_work.dirty_version <> 2
     OR v_work.dirty_from <> '2026-07-01'::date
     OR v_work.dirty_to <> '2026-07-15'::date
     OR v_work.old_buyer_id IS DISTINCT FROM '31000000-0000-4000-8000-000000000002'::uuid
     OR v_work.new_buyer_id IS DISTINCT FROM '31000000-0000-4000-8000-000000000002'::uuid
  THEN
    RAISE EXCEPTION 'duplicate dirty mark did not coalesce/version correctly: %', row_to_json(v_work);
  END IF;
END $$;

-- Claim one bounded tenant/domain batch, prove global exclusion, then compute
-- and acknowledge the setup snapshot.
DO $$
DECLARE
  v_claim record;
  v_busy record;
  v_compute record;
  v_ack record;
BEGIN
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000101'::uuid);

  IF v_claim.status <> 'claimed'
     OR v_claim.tenant_id IS DISTINCT FROM '31000000-0000-4000-8000-000000000001'::uuid
     OR v_claim.domain <> 'setup'
     OR v_claim.dirty_sources NOT BETWEEN 1 AND 100
     OR v_claim.refresh_keys NOT BETWEEN 1 AND 100
     OR v_claim.statement_groups NOT BETWEEN 0 AND 25
     OR v_claim.fencing_epoch IS NULL
     OR v_claim.lease_until IS NULL
  THEN
    RAISE EXCEPTION 'bounded setup claim failed: %', row_to_json(v_claim);
  END IF;

  SELECT * INTO STRICT v_busy
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000102'::uuid);
  IF v_busy.status <> 'busy' THEN
    RAISE EXCEPTION 'second owner was not excluded by global lease: %', row_to_json(v_busy);
  END IF;

  SELECT * INTO STRICT v_compute
  FROM app.metrics_refresh_tick(
    'compute', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
  IF v_compute.status <> 'computed' OR v_compute.statement_groups NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'setup compute failed: %', row_to_json(v_compute);
  END IF;

  SELECT * INTO STRICT v_ack
  FROM app.metrics_refresh_tick(
    'acknowledge', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
  IF v_ack.status <> 'acknowledged' THEN
    RAISE EXCEPTION 'setup acknowledge failed: %', row_to_json(v_ack);
  END IF;
END $$;

DO $$
DECLARE
  v_snapshot app.metrics_tenant_setup_snapshot%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM app.metrics_tenant_setup_snapshot
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND deleted_at IS NULL;

  IF v_snapshot.active_buyer_count <> 1
     OR v_snapshot.active_product_count <> 1
     OR v_snapshot.active_brand_count <> 1
     OR v_snapshot.active_category_count <> 0
     OR v_snapshot.active_location_count <> 1
     OR v_snapshot.active_warehouse_count <> 1
     OR v_snapshot.active_campaign_count <> 0
     OR v_snapshot.active_cohort_count <> 0
     OR v_snapshot.active_price_list_count <> 0
  THEN
    RAISE EXCEPTION 'setup snapshot counts are incorrect: %', row_to_json(v_snapshot);
  END IF;
END $$;

-- A replay with an identical source watermark and values must not rewrite the
-- snapshot's updated_at/computed_at/generation tuple.
DO $$
DECLARE
  v_before app.metrics_tenant_setup_snapshot%ROWTYPE;
  v_after app.metrics_tenant_setup_snapshot%ROWTYPE;
  v_claim record;
BEGIN
  SELECT * INTO STRICT v_before
  FROM app.metrics_tenant_setup_snapshot
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND deleted_at IS NULL;

  PERFORM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'repair',
    '31000000-0000-4000-8000-000000000012'::uuid
  );
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000103'::uuid);
  PERFORM app.metrics_refresh_tick(
    'compute', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
  PERFORM app.metrics_refresh_tick(
    'acknowledge', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );

  SELECT * INTO STRICT v_after
  FROM app.metrics_tenant_setup_snapshot
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND deleted_at IS NULL;

  IF v_after.updated_at IS DISTINCT FROM v_before.updated_at
     OR v_after.computed_at IS DISTINCT FROM v_before.computed_at
     OR v_after.generation_id IS DISTINCT FROM v_before.generation_id
  THEN
    RAISE EXCEPTION 'identical replay rewrote setup snapshot';
  END IF;
END $$;

-- A newer mark on an active failed version resets attempts/backoff and returns
-- the work to pending. Complete it so the dead-letter scenario stays isolated.
DO $$
DECLARE
  v_claim record;
  v_mark record;
  v_work app.metrics_dirty_work%ROWTYPE;
BEGIN
  PERFORM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'repair',
    '31000000-0000-4000-8000-000000000013'::uuid
  );
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000104'::uuid);
  PERFORM app.metrics_refresh_tick(
    'fail', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );

  SELECT * INTO STRICT v_mark
  FROM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'repair',
    '31000000-0000-4000-8000-000000000013'::uuid
  );
  SELECT * INTO STRICT v_work
  FROM app.metrics_dirty_work
  WHERE id = v_mark.work_id;

  IF v_mark.dirty_version <> 2
     OR v_work.state <> 'pending'
     OR v_work.attempts <> 0
     OR v_work.claimed_version IS NOT NULL
     OR v_work.lease_owner IS NOT NULL
     OR v_work.last_error IS NOT NULL
  THEN
    RAISE EXCEPTION 'newer dirty version inherited failure state: %', row_to_json(v_work);
  END IF;

  -- The previous fail retains compare-and-release leases. The same owner can
  -- reclaim the reset work without opening a second concurrent dispatcher.
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000104'::uuid);
  PERFORM app.metrics_refresh_tick(
    'compute', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
  PERFORM app.metrics_refresh_tick(
    'acknowledge', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
END $$;

-- Three failures dead-letter only the same claimed version. Backoff is made due
-- explicitly between attempts so the fixture remains deterministic and fast.
DO $$
DECLARE
  v_claim record;
  v_fail record;
  v_attempt integer;
  v_work app.metrics_dirty_work%ROWTYPE;
BEGIN
  PERFORM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'repair',
    '31000000-0000-4000-8000-000000000014'::uuid
  );

  FOR v_attempt IN 1..3 LOOP
    UPDATE app.metrics_dirty_work
    SET next_attempt_at = clock_timestamp()
    WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
      AND domain = 'setup'
      AND source_type = 'repair'
      AND source_id = '31000000-0000-4000-8000-000000000014'::uuid;

    SELECT * INTO STRICT v_claim
    FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000105'::uuid);
    IF v_claim.status <> 'claimed' THEN
      RAISE EXCEPTION 'failure attempt % was not claimed: %', v_attempt, row_to_json(v_claim);
    END IF;

    SELECT * INTO STRICT v_fail
    FROM app.metrics_refresh_tick(
      'fail', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
    );

    IF (v_attempt < 3 AND v_fail.status <> 'retry')
       OR (v_attempt = 3 AND v_fail.status <> 'dead_letter')
    THEN
      RAISE EXCEPTION 'failure attempt % returned wrong state: %', v_attempt, row_to_json(v_fail);
    END IF;
  END LOOP;

  SELECT * INTO STRICT v_work
  FROM app.metrics_dirty_work
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND domain = 'setup'
    AND source_type = 'repair'
    AND source_id = '31000000-0000-4000-8000-000000000014'::uuid
    AND state = 'dead_letter';

  IF v_work.attempts <> 3 OR v_work.dirty_version <> 1 OR v_work.claimed_version IS NOT NULL THEN
    RAISE EXCEPTION 'same-version dead-letter state is incorrect: %', row_to_json(v_work);
  END IF;

  PERFORM app.metrics_refresh_tick(
    'release', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
  );
END $$;

-- Expired claims return to pending in a bounded recovery pass, and their lease
-- rows are compare-released once no claimed work remains for the owner.
DO $$
DECLARE
  v_claim record;
  v_recovered integer;
  v_work app.metrics_dirty_work%ROWTYPE;
BEGIN
  PERFORM app.metrics_mark_dirty(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup',
    'repair',
    '31000000-0000-4000-8000-000000000015'::uuid
  );
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000106'::uuid);

  UPDATE app.metrics_dirty_work
  SET lease_until = clock_timestamp() - interval '1 second'
  WHERE lease_owner = v_claim.owner_token AND state = 'claimed';
  UPDATE app.metrics_refresh_leases
  SET lease_until = clock_timestamp() - interval '1 second'
  WHERE owner_token = v_claim.owner_token;

  SELECT app.metrics_release_expired_leases(100) INTO v_recovered;
  IF v_recovered <> 1 THEN
    RAISE EXCEPTION 'expired-claim recovery count was %, expected 1', v_recovered;
  END IF;

  SELECT * INTO STRICT v_work
  FROM app.metrics_dirty_work
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND source_id = '31000000-0000-4000-8000-000000000015'::uuid;
  IF v_work.state <> 'pending'
     OR v_work.lease_owner IS NOT NULL
     OR v_work.lease_until IS NOT NULL
     OR v_work.claimed_version IS NOT NULL
  THEN
    RAISE EXCEPTION 'expired dirty claim was not reset: %', row_to_json(v_work);
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.metrics_refresh_leases
    WHERE owner_token = v_claim.owner_token
  ) THEN
    RAISE EXCEPTION 'expired refresh lease owner was not released';
  END IF;
END $$;

-- Dispatch defaults can be changed independently of capture. Pending work must
-- remain pending while the global dispatcher is paused.
SELECT app.metrics_set_dispatch_enabled(false, NULL, NULL, 'phase 3 fixture pause');

DO $$
DECLARE
  v_claim record;
  v_state text;
BEGIN
  SELECT * INTO STRICT v_claim
  FROM app.metrics_claim_dirty_work('31000000-0000-4000-8000-000000000107'::uuid);
  IF v_claim.status <> 'disabled' THEN
    RAISE EXCEPTION 'dispatch-off claim was not disabled: %', row_to_json(v_claim);
  END IF;

  SELECT state INTO STRICT v_state
  FROM app.metrics_dirty_work
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid
    AND source_id = '31000000-0000-4000-8000-000000000015'::uuid;
  IF v_state <> 'pending' THEN
    RAISE EXCEPTION 'dispatch-off mutated pending work to %', v_state;
  END IF;
END $$;

-- Exercise the operational inspection and bounded-pruning interfaces. Use a
-- zero-result cutoff so this signature check cannot affect earlier assertions.
DO $$
DECLARE
  v_inspect record;
  v_prune record;
BEGIN
  SELECT * INTO STRICT v_inspect
  FROM app.metrics_inspect(
    '31000000-0000-4000-8000-000000000001'::uuid,
    'setup'
  );
  IF v_inspect.pending_count < 1
     OR v_inspect.dead_letter_count < 1
     OR v_inspect.dispatch_enabled IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'metrics inspection returned unexpected state: %', row_to_json(v_inspect);
  END IF;

  SELECT * INTO STRICT v_prune
  FROM app.metrics_prune_operational_history(
    '-infinity'::timestamptz,
    '-infinity'::timestamptz,
    1000
  );
  IF v_prune.dirty_deleted <> 0 OR v_prune.history_deleted <> 0 THEN
    RAISE EXCEPTION 'zero-result prune unexpectedly deleted rows: %', row_to_json(v_prune);
  END IF;
END $$;

-- Composite cursor acceptance: 101 products stocked in two locations produces
-- 202 product/location keys. A range marker must page every pair without
-- advancing the parent product cursor past unprocessed location fan-out.
RESET ROLE;
SET LOCAL session_replication_role = replica;
SET LOCAL ROLE service_role;
DELETE FROM app.metrics_dirty_work
WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid;
DELETE FROM app.metrics_execution_history
WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid;
DELETE FROM app.metrics_refresh_state
WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid;
DELETE FROM app.metrics_refresh_leases WHERE lease_scope = 'tenant_domain';
UPDATE app.metrics_refresh_leases
SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL
WHERE lease_scope = 'global';

INSERT INTO app.locations (
  id, tenant_id, name, status, is_default, external_ref, created_at, updated_at
) VALUES (
  '31000000-0000-4000-8000-000000000020'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  'Metrics Phase 3 Location Two', 'active', false, 'metrics-phase3-location-two',
  '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'
);
INSERT INTO app.warehouses (
  id, tenant_id, location_id, name, status, is_default, external_ref, created_at, updated_at
) VALUES (
  '31000000-0000-4000-8000-000000000021'::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  '31000000-0000-4000-8000-000000000020'::uuid,
  'Metrics Phase 3 Warehouse Two', 'active', false, 'metrics-phase3-warehouse-two',
  '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'
);
INSERT INTO app.tenant_products (
  id, tenant_id, tenant_brand_id, internal_sku, name_override,
  is_active, external_ref, created_at, updated_at
)
SELECT md5('metrics-phase3-product-' || g)::uuid,
  '31000000-0000-4000-8000-000000000001'::uuid,
  '31000000-0000-4000-8000-000000000005'::uuid,
  'METRICS-PHASE3-BULK-' || g, 'Metrics Phase 3 Bulk ' || g,
  true, 'metrics-phase3-bulk-' || g,
  '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'
FROM generate_series(1, 101) g;
INSERT INTO app.tenant_inventory (
  id, tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point, updated_at
)
SELECT md5('metrics-phase3-inventory-' || g || '-' || w.n)::uuid,
  md5('metrics-phase3-product-' || g)::uuid, w.warehouse_id,
  10, 1, 3, '2026-07-16 00:00:00+00'
FROM generate_series(1, 101) g
CROSS JOIN (VALUES
  (1, '31000000-0000-4000-8000-000000000004'::uuid),
  (2, '31000000-0000-4000-8000-000000000021'::uuid)
) w(n, warehouse_id);

RESET ROLE;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;

SELECT app.metrics_set_dispatch_enabled(true, NULL, NULL, NULL);
SELECT * FROM app.metrics_mark_reconciliation(
  '31000000-0000-4000-8000-000000000001'::uuid,
  'inventory', '2026-07-16', '2026-07-16',
  '31000000-0000-4000-8000-000000000022'::uuid
);

DO $$
DECLARE
  v_claim record;
  v_result record;
  v_ticks integer := 0;
  v_state text;
  v_pairs integer;
BEGIN
  LOOP
    v_ticks := v_ticks + 1;
    IF v_ticks > 20 THEN RAISE EXCEPTION 'composite cursor did not converge'; END IF;
    SELECT * INTO STRICT v_claim
    FROM app.metrics_claim_dirty_work(gen_random_uuid());
    EXIT WHEN v_claim.status = 'idle';
    IF v_claim.status <> 'claimed' THEN
      RAISE EXCEPTION 'unexpected composite claim: %', row_to_json(v_claim);
    END IF;
    SELECT * INTO STRICT v_result FROM app.metrics_refresh_tick(
      'compute', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
    );
    SELECT * INTO STRICT v_result FROM app.metrics_refresh_tick(
      'acknowledge', v_claim.owner_token, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
    );
  END LOOP;

  SELECT state INTO STRICT v_state FROM app.metrics_dirty_work
  WHERE source_id = '31000000-0000-4000-8000-000000000022'::uuid;
  SELECT COUNT(*) INTO v_pairs FROM app.metrics_product_location_snapshot
  WHERE tenant_id = '31000000-0000-4000-8000-000000000001'::uuid AND deleted_at IS NULL;
  IF v_state <> 'completed' OR v_pairs < 202 THEN
    RAISE EXCEPTION 'composite cursor lost pairs: state %, pairs %, ticks %', v_state, v_pairs, v_ticks;
  END IF;
END $$;

RESET ROLE;

SELECT 'metrics_v2_phase_3_manual_refresh_kernel checks passed' AS result;

ROLLBACK;
