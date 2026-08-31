-- Same root cause as the public-schema gap (20260830150649): the DB
-- colocation pg_dump was scoped to --schema=app --schema=catalog only,
-- so the `realtime` schema and publication membership never crossed
-- over either. Found via user report: "tenant_notifications_broadcast_
-- select" policy missing on yukti-prod. Investigation found 3 gaps, all
-- fixed directly on yukti-prod, tracked here (guarded no-ops on yukti,
-- which already has all three):
--   1. supabase_realtime_messages_publication didn't exist at all on
--      yukti-prod (platform-managed, owned by supabase_admin on yukti --
--      created here as postgres instead, functionally equivalent).
--   2. app.realtime_notifications wasn't a member of supabase_realtime
--      (Broadcast for that table was silently not firing).
--   3. The tenant_notifications_broadcast_select RLS policy on
--      realtime.messages (Realtime Authorization) didn't exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime_messages_publication') THEN
    CREATE PUBLICATION supabase_realtime_messages_publication FOR TABLE realtime.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'realtime_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.realtime_notifications;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'tenant_notifications_broadcast_select' AND c.relname = 'messages'
  ) THEN
    CREATE POLICY tenant_notifications_broadcast_select ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      (topic = ('tenant-notifications:'::text || ((SELECT app.jwt_tenant_id() AS jwt_tenant_id))::text))
      AND ((SELECT app.is_seller() AS is_seller) OR (SELECT app.is_buyer() AS is_buyer))
    );
  END IF;
END $$;
