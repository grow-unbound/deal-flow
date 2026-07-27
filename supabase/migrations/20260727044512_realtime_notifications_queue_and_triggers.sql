CREATE TABLE app.realtime_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  buyer_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  old_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_realtime_notifications_tenant_created ON app.realtime_notifications (tenant_id, created_at DESC);
CREATE INDEX idx_realtime_notifications_buyer_created ON app.realtime_notifications (buyer_id, created_at DESC) WHERE buyer_id IS NOT NULL;
-- Purge target for run_storage_maintenance — this table is a short-lived event log, not
-- a record of truth (the source tables already are), so it never needs long retention.
CREATE INDEX idx_realtime_notifications_created_at ON app.realtime_notifications (created_at);

ALTER TABLE app.realtime_notifications ENABLE ROW LEVEL SECURITY;
-- No client-facing policies: rows are only ever produced by SECURITY DEFINER triggers
-- and consumed via the Realtime broadcast stream (which reads through the replication
-- slot, not RLS-gated PostgREST), matching how the source tables' own realtime access
-- already worked (Realtime broadcasts don't apply table RLS either).

CREATE OR REPLACE FUNCTION app.emit_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_buyer_id uuid;
BEGIN
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

CREATE TRIGGER trg_emit_realtime_notification
AFTER INSERT OR UPDATE ON app.estimates
FOR EACH ROW EXECUTE FUNCTION app.emit_realtime_notification();

CREATE TRIGGER trg_emit_realtime_notification
AFTER INSERT OR UPDATE ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.emit_realtime_notification();

CREATE TRIGGER trg_emit_realtime_notification
AFTER INSERT OR UPDATE ON app.invoices
FOR EACH ROW EXECUTE FUNCTION app.emit_realtime_notification();

CREATE TRIGGER trg_emit_realtime_notification
AFTER INSERT OR UPDATE ON app.campaigns
FOR EACH ROW EXECUTE FUNCTION app.emit_realtime_notification();
