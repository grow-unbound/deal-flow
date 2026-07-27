-- Realtime Postgres Changes on private schemas still requires row visibility for
-- the subscribed role. app.realtime_notifications already has SELECT granted to
-- authenticated, but RLS was enabled with no SELECT policy, so authenticated
-- clients received zero events despite rows being inserted into the publication.
--
-- Mirror the existing source-table access model:
-- - sellers can receive any same-tenant notification row
-- - buyers can receive same-tenant rows for their own buyer-scoped documents
--   plus published/active campaign rows, which are buyer-visible even though
--   those queue rows have buyer_id = null

BEGIN;

DROP POLICY IF EXISTS realtime_notifications_select ON app.realtime_notifications;

CREATE POLICY realtime_notifications_select ON app.realtime_notifications
  FOR SELECT
  TO authenticated
  USING (
    (app.is_seller() AND tenant_id = app.jwt_tenant_id())
    OR (
      app.is_buyer()
      AND tenant_id = app.jwt_tenant_id()
      AND (
        buyer_id = app.jwt_buyer_id()
        OR (
          entity_type = 'campaigns'
          AND (payload ->> 'status') = 'published'
          AND (
            (payload ->> 'valid_to') IS NULL
            OR ((payload ->> 'valid_to')::timestamptz > now())
          )
        )
      )
    )
  );

COMMIT;
