-- =============================================================================
-- FIX: metrics_location_daily ON CONFLICT soft-delete collision
--
-- Root cause:
--   _metrics_refresh_location_scopes inserts into metrics_location_daily with:
--     ON CONFLICT (tenant_id, location_id, day) WHERE deleted_at IS NULL
--   This is a PARTIAL unique index -- it doesn't cover rows where deleted_at
--   IS NOT NULL. When a prior run soft-deleted a row, the partial index doesn't
--   fire; instead the non-partial UNIQUE (tenant_id, external_ref) constraint
--   fires and raises a duplicate-key error, crashing the metrics worker.
--
-- Fix:
--   BEFORE INSERT trigger that deletes any soft-deleted row with the same
--   (tenant_id, external_ref) before the new row lands. The trigger fires only
--   when needed (soft-deleted predecessors are rare), the DELETE uses the
--   existing unique index on (tenant_id, external_ref), and no function
--   rewrite is required.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.metrics_location_daily_purge_soft_deleted_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app
AS $$
BEGIN
  DELETE FROM app.metrics_location_daily
  WHERE tenant_id = NEW.tenant_id
    AND external_ref = NEW.external_ref
    AND deleted_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_metrics_location_daily_purge_soft_deleted
  ON app.metrics_location_daily;

CREATE TRIGGER trg_metrics_location_daily_purge_soft_deleted
BEFORE INSERT ON app.metrics_location_daily
FOR EACH ROW EXECUTE FUNCTION app.metrics_location_daily_purge_soft_deleted_on_insert();
