-- app.realtime_notifications stored (and broadcast) the FULL previous row as
-- old_payload on every UPDATE. The only consumers (useSellerRealtime,
-- useBuyerRealtime) diff just the fields below to decide whether an update is
-- notification-worthy, so keep only those. On prod ~9.4k estimate updates/day
-- (8 of them relevant) each carried a ~1.5 KB old_payload.
--
-- Only the trigger function changes; payload (full NEW row) is untouched because
-- useDocumentWhatsAppRealtime patches document caches from it.

CREATE OR REPLACE FUNCTION app.emit_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_buyer_id uuid;
  c_ignore constant text[] := ARRAY['updated_at', 'updated_by', 'source_watermark', 'generation_id'];
  -- Keys the realtime clients read from old_payload. Add here if a new client
  -- starts diffing another field.
  c_old_keys constant text[] := ARRAY['status', 'estimate_number', 'order_number', 'invoice_number'];
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - c_ignore) IS NOT DISTINCT FROM (to_jsonb(OLD) - c_ignore) THEN
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
    CASE
      WHEN TG_OP = 'UPDATE' THEN (
        SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        FROM jsonb_each(to_jsonb(OLD)) e
        WHERE e.key = ANY (c_old_keys)
      )
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$function$;
