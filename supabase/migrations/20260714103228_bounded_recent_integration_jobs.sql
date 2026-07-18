CREATE OR REPLACE FUNCTION app.list_recent_integration_sync_jobs(
  p_tenant_id uuid,
  p_per_integration_limit integer DEFAULT 60
)
RETURNS SETOF app.integration_sync_jobs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  SELECT recent.*
  FROM app.tenant_integrations integration
  CROSS JOIN LATERAL (
    SELECT j.*
    FROM app.integration_sync_jobs j
    WHERE j.tenant_id = p_tenant_id
      AND j.tenant_integration_id = integration.id
      AND j.deleted_at IS NULL
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_per_integration_limit, 60), 1), 100)
  ) recent
  WHERE integration.tenant_id = p_tenant_id
    AND integration.deleted_at IS NULL
  ORDER BY recent.created_at DESC, recent.id DESC;
$$;

REVOKE ALL ON FUNCTION app.list_recent_integration_sync_jobs(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_recent_integration_sync_jobs(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION app.list_recent_integration_sync_jobs(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.list_recent_integration_sync_jobs(uuid, integer) TO service_role;
