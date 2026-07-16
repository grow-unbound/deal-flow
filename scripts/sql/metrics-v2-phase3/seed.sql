\set ON_ERROR_STOP on

BEGIN;

INSERT INTO app.tenants (
  id,
  slug,
  business_name,
  subdomain,
  plan,
  settings,
  created_at,
  updated_at
)
VALUES (
  :'tenant_id'::uuid,
  'metrics-phase3-' || replace(:'run_id', '-', ''),
  'Metrics V2 Phase 3 Concurrency ' || :'run_id',
  'metrics-phase3-' || replace(:'run_id', '-', ''),
  'starter',
  jsonb_build_object('metrics_v2_phase3_run_id', :'run_id'),
  clock_timestamp(),
  clock_timestamp()
);

SELECT app.metrics_set_dispatch_enabled(true, NULL, NULL, NULL);

SELECT work_id, dirty_version
FROM app.metrics_mark_dirty(
  :'tenant_id'::uuid,
  'setup',
  'repair',
  :'source_id'::uuid
);

-- Make this isolated fixture the oldest due work without touching other rows.
UPDATE app.metrics_dirty_work
SET next_attempt_at = '2000-01-01 00:00:00+00'::timestamptz,
    updated_at = clock_timestamp()
WHERE tenant_id = :'tenant_id'::uuid
  AND domain = 'setup'
  AND source_type = 'repair'
  AND source_id = :'source_id'::uuid;

COMMIT;
