-- Avoid duplicate metrics marking at the end of coordinator sync runs.
--
-- Child phase rows already call app.metrics_mark_sync_completion(...) from
-- app.trg_post_sync_rebuild(), with the phase's since_date and domain mapping.
-- The master sync_run row previously also called
-- app.metrics_mark_daily_reconciliation(tenant_id), which marks every domain
-- again from refresh-state watermarks. On active tenants that turns one sync
-- into both phase-specific work and a broad all-domain reconciliation.
--
-- Preserve the fallback for direct/single-row jobs without child phases.

CREATE OR REPLACE FUNCTION app.trg_metrics_v4_post_sync_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed'
     AND NEW.master_job_id IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM app.integration_sync_jobs child
       WHERE child.master_job_id = NEW.id
     ) THEN
    PERFORM app.metrics_mark_daily_reconciliation(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app.trg_metrics_v4_post_sync_reconciliation() OWNER TO postgres;
