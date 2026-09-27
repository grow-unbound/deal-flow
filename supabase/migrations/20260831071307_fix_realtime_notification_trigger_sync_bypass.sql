-- app.emit_realtime_notification() (the trigger behind app.realtime_notifications,
-- the sole table in the supabase_realtime publication) is the one trigger on
-- estimates/orders/invoices/campaigns that never checks
-- app.sync_trigger_bypass_active() -- every other trigger on these tables does
-- (see the ~30 IF app.sync_trigger_bypass_active() THEN RETURN ... guards
-- across 20260709000001_prod_bootstrap.sql). Bulk syncs/restores set
-- app.integration_sync_bypass_triggers = 'on' specifically so a full-table
-- rewrite doesn't fan out into per-row side effects -- this trigger ignored
-- that flag and fired on every row anyway. Confirmed live: the yukti-prod
-- Mumbai migration's restore touched ~30k invoices/estimates and produced
-- 44k realtime_notifications rows (105MB) in a single 2-hour window.
CREATE OR REPLACE FUNCTION app.emit_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_buyer_id uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  v_buyer_id := CASE
    WHEN TG_TABLE_NAME = 'campaigns' THEN NULL
    ELSE (to_jsonb(NEW)->>'buyer_id')::uuid
  END;

  INSERT INTO app.realtime_notifications (tenant_id, buyer_id, entity_type, entity_id, event_type, payload, old_payload)
  VALUES (
    NEW.tenant_id,
    v_buyer_id,
    TG_TABLE_NAME,
    NEW.id,
    lower(TG_OP),
    to_jsonb(NEW),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;
