-- dispatch_from_buyers still called refresh_buyers_snapshot_for_buyer /
-- refresh_buyer_current_snapshot_for_buyer which were dropped by the v1
-- retirement migration. Remove those calls; keep refresh_buyer_app_snapshot
-- (writes to buyer_app_snapshot, a live table unrelated to the v1 tables).

CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;
