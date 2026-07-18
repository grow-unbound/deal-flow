\set ON_ERROR_STOP on

BEGIN;

-- Release only leases owned by this run. Never disturb another worker.
UPDATE app.metrics_refresh_leases
SET owner_token = NULL,
    lease_until = NULL,
    heartbeat_at = NULL,
    updated_at = clock_timestamp()
WHERE owner_token = ANY (ARRAY[:'owner_a'::uuid, :'owner_b'::uuid]);

DELETE FROM app.metrics_refresh_leases
WHERE lease_scope = 'global'
  AND owner_token IS NULL
  AND NOT :'previous_global_lease_exists'::boolean;

DELETE FROM app.metrics_execution_history WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_refresh_state WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_dirty_work WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_runtime_control WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_refresh_leases WHERE tenant_id = :'tenant_id'::uuid;

DELETE FROM app.metrics_location_daily WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_tenant_daily WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_product_location_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_product_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_buyer_location_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_buyer_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_location_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_tenant_setup_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_tenant_buyer_app_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_tenant_inventory_snapshot WHERE tenant_id = :'tenant_id'::uuid;
DELETE FROM app.metrics_tenant_commercial_snapshot WHERE tenant_id = :'tenant_id'::uuid;

DELETE FROM app.tenants
WHERE id = :'tenant_id'::uuid
  AND settings ->> 'metrics_v2_phase3_run_id' = :'run_id';

-- Restore the exact dispatch state observed before seed. The Phase 2 default is
-- no row/disabled, so delete the harness-created global row in that case.
UPDATE app.metrics_runtime_control
SET dispatch_enabled = :'previous_dispatch_enabled'::boolean,
    pause_reason = CASE
      WHEN :'previous_pause_reason_is_null'::boolean THEN NULL
      ELSE :'previous_pause_reason'
    END,
    updated_at = clock_timestamp()
WHERE control_scope = 'global'
  AND :'previous_control_exists'::boolean;

DELETE FROM app.metrics_runtime_control
WHERE control_scope = 'global'
  AND NOT :'previous_control_exists'::boolean;

COMMIT;
