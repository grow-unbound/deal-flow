-- F20 (see specs/db-perf-recovery-2026-09-20.md), migration B of 2 -- TIGHTENING.
--
-- APPLY ONLY AFTER the buyer client that subscribes to `buyer-notifications:<tenant>:<buyer>` and
-- `catalog-updates:<tenant>` (useBuyerRealtime) is deployed and cached buyer PWAs have refreshed.
-- Until then, buyers on a stale client would lose live updates (they fall back to normal refetch).
--
-- Restricts the tenant-wide topic (full-row payloads of every buyer's documents, campaign scope and
-- share tokens, integration job rows) to sellers. Buyers can no longer join it.
-- Idempotent.

DROP POLICY IF EXISTS tenant_notifications_broadcast_select ON realtime.messages;
CREATE POLICY tenant_notifications_broadcast_select ON realtime.messages
FOR SELECT
TO authenticated
USING (
  topic = 'tenant-notifications:' || (SELECT app.jwt_tenant_id())::text
  AND (SELECT app.is_seller())
);
