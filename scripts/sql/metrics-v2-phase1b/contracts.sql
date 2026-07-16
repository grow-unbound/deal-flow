BEGIN;

CREATE TEMP TABLE metrics_v2_phase1b_expected_contract (
  object_kind text NOT NULL,
  object_name text NOT NULL,
  phase_owner text NOT NULL,
  required_contract text NOT NULL
) ON COMMIT DROP;

INSERT INTO metrics_v2_phase1b_expected_contract (object_kind, object_name, phase_owner, required_contract)
VALUES
  ('table', 'app.metrics_dirty_work', 'Phase 2', 'distributed dirty source rows; no hot tenant/domain upsert row'),
  ('table', 'app.metrics_runtime_control', 'Phase 2', 'database-local dispatch kill switch; capture remains enabled'),
  ('table', 'app.metrics_refresh_state', 'Phase 2', 'source-to-snapshot freshness and stale metadata'),
  ('table', 'app.metrics_refresh_leases', 'Phase 2', 'durable global and tenant/domain leases'),
  ('table', 'app.metrics_execution_history', 'Phase 2', 'bounded tick history and dead-letter evidence'),
  ('function', 'app.metrics_dispatch_enabled(uuid)', 'Phase 2', 'runtime-control read helper; no app feature flag'),
  ('function', 'app.metrics_mark_dirty(...)', 'Phase 3', 'typed dirty source marking with scalar dependency keys'),
  ('function', 'app.metrics_claim_dirty_work(...)', 'Phase 3', 'budgeted claim respecting source/entity/group limits'),
  ('function', 'app.metrics_refresh_tick(...)', 'Phase 3', 'manual/Cron-compatible bounded refresh tick');

DO $$
DECLARE
  v_missing_phase2 text[];
  v_missing_phase3 text[];
BEGIN
  SELECT array_agg(expected.object_name ORDER BY expected.object_name)
    INTO v_missing_phase2
  FROM metrics_v2_phase1b_expected_contract expected
  WHERE expected.phase_owner = 'Phase 2'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND ('app.' || c.relname) = expected.object_name
        AND expected.object_kind = 'table'
      UNION ALL
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'metrics_dispatch_enabled'
        AND expected.object_name = 'app.metrics_dispatch_enabled(uuid)'
        AND expected.object_kind = 'function'
    );

  IF v_missing_phase2 IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 objects must exist before this contract fixture passes: %', v_missing_phase2;
  END IF;

  SELECT array_agg(expected.object_name ORDER BY expected.object_name)
    INTO v_missing_phase3
  FROM metrics_v2_phase1b_expected_contract expected
  WHERE expected.phase_owner = 'Phase 3'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND ('app.' || p.proname || '(...)') = expected.object_name
        AND expected.object_kind = 'function'
    );

  IF v_missing_phase3 IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 3 runtime functions must exist before this contract fixture passes: %', v_missing_phase3;
  END IF;
END $$;

DO $$
DECLARE
  v_bad_count integer;
BEGIN
  SELECT count(*)
    INTO v_bad_count
  FROM metrics_v2_phase1b_expected_contract
  WHERE object_name LIKE '%df_metrics_v2%'
     OR object_name LIKE '%read_model_version%';

  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'Phase 1B contract must not include a runtime Metrics V2 flag or read-model selector';
  END IF;
END $$;

SELECT * FROM metrics_v2_phase1b_expected_contract ORDER BY object_kind, object_name;

ROLLBACK;
