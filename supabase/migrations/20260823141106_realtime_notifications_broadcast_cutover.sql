-- Perf: cut app.realtime_notifications delivery over from postgres_changes to
-- Realtime Broadcast.
--
-- Root cause (confirmed live this session): realtime.list_changes -- the WAL-poll
-- RPC behind postgres_changes -- runs continuously (0.8+ calls/sec, reconfirmed
-- with a fresh pg_stat_statements_reset()) regardless of active subscriber count.
-- It's a fixed background poll tied to having Realtime enabled at all, not to
-- table/subscriber count -- the earlier 8-tables-to-1 consolidation
-- (20260727044613) never touched this, because it was never the driver. This
-- was the single largest cumulative DB-time consumer found in this session's
-- audit, larger than the metrics-refresh cron.
--
-- Fix: Broadcast pushes messages directly over the already-open WebSocket at
-- insert-time (via realtime.send()) instead of Realtime polling the WAL to
-- decide who's listening -- cost becomes proportional to actual message
-- volume (~2716/month per the Vercel/Supabase dashboard), not a fixed poll tax.
--
-- Topic design: all three client hooks (useSellerRealtime, useBuyerRealtime,
-- useDocumentWhatsAppRealtime) filter postgres_changes with the SAME server-side
-- predicate (tenant_id=eq.<tenantId>) -- the per-hook channel names
-- (seller:<id>, buyer:<tenantId>:<buyerId>, document-whatsapp:<kind>:<docId>)
-- are just client-side connection labels, not actual server-side scopes; every
-- hook already does its own entity/buyer/document filtering client-side after
-- receiving a tenant-wide event. So Broadcast uses ONE shared topic per tenant
-- (tenant-notifications:<tenantId>) that all three hook types subscribe to --
-- this is the same security boundary as today's filter (tenant-wide, not
-- buyer- or document-scoped), just a different transport.

CREATE OR REPLACE FUNCTION app.broadcast_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'realtime'
AS $function$
BEGIN
  PERFORM realtime.send(
    to_jsonb(NEW),
    'notification',
    'tenant-notifications:' || NEW.tenant_id::text,
    true
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_broadcast_realtime_notification
AFTER INSERT ON app.realtime_notifications
FOR EACH ROW EXECUTE FUNCTION app.broadcast_realtime_notification();

-- realtime.messages has RLS enabled with zero existing policies (confirmed live
-- this session) -- currently deny-all for any private channel, which is why
-- private Broadcast channels have never worked on this project until now.
-- One SELECT policy: caller (seller or buyer) may read a topic iff it's their
-- own tenant's topic string -- same tenant boundary as today's
-- tenant_id=eq.<tenantId> postgres_changes filter, not a widened surface.
-- No INSERT policy: realtime.send() is only ever called from the SECURITY
-- DEFINER trigger above (elevated context, not RLS-gated); clients must never
-- be able to broadcast spoofed messages directly via realtime.send() RPC.
CREATE POLICY tenant_notifications_broadcast_select ON realtime.messages
FOR SELECT
TO authenticated
USING (
  topic = 'tenant-notifications:' || (select app.jwt_tenant_id())::text
  AND ((select app.is_seller()) OR (select app.is_buyer()))
);
