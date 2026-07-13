-- Ensure the 2-param public wrapper exists regardless of prior migration state.
-- Phase7 migration may not have fully applied on the remote DB, leaving only the
-- 4-param private helper (_run_metrics_analysis_for_tenant_range) without this wrapper.

DROP FUNCTION IF EXISTS app.run_metrics_analysis_for_tenant(uuid, integer);

CREATE OR REPLACE FUNCTION app.run_metrics_analysis_for_tenant(
  p_tenant_id uuid,
  p_days integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_days integer := GREATEST(COALESCE(p_days, 90), 1);
  v_start_day date := v_today_ist - (v_days - 1);
BEGIN
  RETURN app._run_metrics_analysis_for_tenant_range(
    p_tenant_id,
    v_start_day,
    v_today_ist
  );
END;
$$;

COMMENT ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer)
  IS 'Public 2-param wrapper: runs metrics analysis for last N days (default 90). Delegates to _run_metrics_analysis_for_tenant_range.';

REVOKE ALL ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer) TO service_role;
