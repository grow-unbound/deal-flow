-- F20 (see specs/db-perf-recovery-2026-09-20.md), migration A of 2 -- ADDITIVE.
--
-- Problem: every authenticated buyer of a tenant could join `tenant-notifications:<tenant>`, which
-- carries the FULL new/old row of every buyer's orders, invoices and estimates, campaign rows
-- (incl. share_token and the buyer_ids/cohort_ids scope), and integration job rows. Only the browser
-- filtered by buyer_id.
--
-- This migration adds server-enforced buyer-scoped topics and routes to them; the tenant topic keeps
-- receiving the same full message so already-deployed clients keep working. Migration B
-- (20260920133939) then restricts the tenant topic to sellers once the new client is live.
--
--   buyer-notifications:<tenant>:<buyer>   only that buyer (jwt tenant_id + buyer_id must match)
--       orders / estimates / invoices of THAT buyer, slim whitelisted payload
--       campaigns published with scope_type='buyer': one message per targeted buyer (cap 200)
--   catalog-updates:<tenant>               buyers of the tenant
--       campaigns published with scope_type='all' (already visible to every buyer): slim payload
--   campaigns scoped to cohort/geography are NOT pushed (buyers see them on the next refetch);
--   every other entity type (integration jobs, ...) goes to the tenant/seller topic only.
--
-- Cost: one extra realtime.send per buyer-scoped event (the tenant-topic send is unchanged).
-- Idempotent.

CREATE OR REPLACE FUNCTION app.realtime_pick_keys(p_src jsonb, p_keys text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $$
  SELECT COALESCE(jsonb_object_agg(k, p_src -> k), '{}'::jsonb)
  FROM unnest(p_keys) AS k
  WHERE p_src IS NOT NULL AND p_src ? k
$$;

CREATE OR REPLACE FUNCTION app.broadcast_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'realtime'
AS $function$
DECLARE
  v_keys text[];
  v_old_keys constant text[] := ARRAY['status', 'estimate_number', 'order_number', 'invoice_number'];
  v_slim jsonb;
  v_buyer text;
BEGIN
  -- Seller / tenant topic: unchanged full message (tightened to sellers by migration B).
  PERFORM realtime.send(to_jsonb(NEW), 'notification', 'tenant-notifications:' || NEW.tenant_id::text, true);

  IF NEW.entity_type IN ('orders', 'estimates', 'invoices') AND NEW.buyer_id IS NOT NULL THEN
    v_keys := CASE NEW.entity_type
      WHEN 'orders'    THEN ARRAY['id', 'order_number', 'status', 'updated_at']
      WHEN 'estimates' THEN ARRAY['id', 'estimate_number', 'status', 'created_at', 'updated_at']
      ELSE                  ARRAY['id', 'invoice_number', 'total_amount', 'updated_at']
    END;
    v_slim := jsonb_build_object(
      'entity_type', NEW.entity_type,
      'entity_id',   NEW.entity_id,
      'event_type',  NEW.event_type,
      'buyer_id',    NEW.buyer_id,
      'payload',     app.realtime_pick_keys(NEW.payload, v_keys),
      'old_payload', CASE WHEN NEW.old_payload IS NULL THEN NULL
                          ELSE app.realtime_pick_keys(NEW.old_payload, v_old_keys) END
    );
    PERFORM realtime.send(
      v_slim, 'notification',
      'buyer-notifications:' || NEW.tenant_id::text || ':' || NEW.buyer_id::text, true
    );

  ELSIF NEW.entity_type = 'campaigns' AND NEW.payload ->> 'status' = 'published' THEN
    v_slim := jsonb_build_object(
      'entity_type', 'campaigns',
      'entity_id',   NEW.entity_id,
      'event_type',  NEW.event_type,
      'buyer_id',    NULL,
      'payload',     app.realtime_pick_keys(
                       NEW.payload,
                       ARRAY['id', 'name', 'status', 'share_token', 'created_at', 'updated_at']),
      'old_payload', NULL
    );

    IF NEW.payload ->> 'scope_type' = 'all' THEN
      PERFORM realtime.send(v_slim, 'notification', 'catalog-updates:' || NEW.tenant_id::text, true);

    ELSIF NEW.payload ->> 'scope_type' = 'buyer'
          AND jsonb_typeof(NEW.payload #> '{scope_value,buyer_ids}') = 'array' THEN
      FOR v_buyer IN
        SELECT DISTINCT b FROM jsonb_array_elements_text(NEW.payload #> '{scope_value,buyer_ids}') AS b LIMIT 200
      LOOP
        PERFORM realtime.send(
          v_slim, 'notification',
          'buyer-notifications:' || NEW.tenant_id::text || ':' || v_buyer, true
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Buyer-scoped topic: the caller's own tenant AND own buyer id (both from the JWT).
DROP POLICY IF EXISTS buyer_notifications_broadcast_select ON realtime.messages;
CREATE POLICY buyer_notifications_broadcast_select ON realtime.messages
FOR SELECT
TO authenticated
USING (
  topic = 'buyer-notifications:' || (SELECT app.jwt_tenant_id())::text || ':' || (SELECT app.jwt_buyer_id())::text
  AND (SELECT app.is_buyer())
);

-- Tenant-wide catalog announcements for all-buyers campaigns: buyers of the tenant only.
DROP POLICY IF EXISTS catalog_updates_broadcast_select ON realtime.messages;
CREATE POLICY catalog_updates_broadcast_select ON realtime.messages
FOR SELECT
TO authenticated
USING (
  topic = 'catalog-updates:' || (SELECT app.jwt_tenant_id())::text
  AND (SELECT app.is_buyer())
);
