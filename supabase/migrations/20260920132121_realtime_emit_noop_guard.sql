-- Phase 7 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
--
-- app.emit_realtime_notification() fired on EVERY UPDATE of orders/invoices/estimates/campaigns,
-- including updates that changed nothing a client can observe (touch-only writes, denormalised
-- column rewrites that produce identical values, updated_at/updated_by bumps). Each firing wrote
-- the full new row AND full old row into app.realtime_notifications, whose AFTER INSERT trigger
-- then re-serialised it into realtime.messages (a third copy) and pushed it through the logical
-- replication slot to every subscriber of the tenant topic: ~4 row images of WAL plus a broadcast
-- per no-op update.
--
-- Guard: on UPDATE, skip when the row is identical apart from audit/bookkeeping columns. Every
-- real change (any other column) is still emitted, with an unchanged payload shape. No change
-- to the trigger definitions, topics, policies or client contract.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION app.emit_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_buyer_id uuid;
  c_ignore constant text[] := ARRAY['updated_at', 'updated_by', 'source_watermark', 'generation_id'];
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
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;
