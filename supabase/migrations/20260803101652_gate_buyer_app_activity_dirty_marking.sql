-- app.metrics_capture_buyer_app_activity() marked 'buyer_app' domain dirty
-- for every route/page-view event from ANY buyer, regardless of
-- app.buyers.buyer_app_enabled -- app.record_buyer_app_activity's only
-- guards are buyer-exists/not-deleted and tenant/location match, no
-- enablement check. This inflated the buyer_app domain's dirty-work queue
-- with events from buyers who aren't real app users, contributing to the
-- volume behind metrics_v4_buyer_key_budget_exceeded (see the migration
-- fixing that). Only mark dirty for real, qualifying, app-enabled activity:
-- NEW/OLD.qualifies_for_engagement AND a join confirming
-- app.buyers.buyer_app_enabled = true for the relevant buyer_id. Does not
-- touch app.record_buyer_app_activity (the app-facing RPC) or the activity
-- table itself -- only whether the metrics pipeline gets told to recompute.
--
-- Body below is otherwise a verbatim copy of the current live definition
-- (20260717091741_metrics_v2_capture_buyer_app_activity.sql) -- only the new
-- gate was added, nothing else changed.
CREATE OR REPLACE FUNCTION app.metrics_capture_buyer_app_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_buyer_id uuid := COALESCE(NEW.buyer_id, OLD.buyer_id);
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF NOT COALESCE(NEW.qualifies_for_engagement, OLD.qualifies_for_engagement, false) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.buyers b
    WHERE b.id = v_buyer_id AND b.tenant_id = v_tenant_id AND b.buyer_app_enabled = true
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'buyer_app_activity', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.occurred_day ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.occurred_day ELSE NULL END
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyer_app_activity ON app.buyer_app_activity;
CREATE TRIGGER trg_metrics_v2_capture_buyer_app_activity
AFTER INSERT OR DELETE OR UPDATE OF buyer_id, location_id, occurred_day, qualifies_for_engagement, deleted_at
ON app.buyer_app_activity
FOR EACH ROW EXECUTE FUNCTION app.metrics_capture_buyer_app_activity();
