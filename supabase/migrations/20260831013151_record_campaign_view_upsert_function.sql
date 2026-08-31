-- recordCampaignView (src/lib/server/campaign-engagement.ts) did an UPDATE-then-
-- INSERT-if-not-found against app.campaign_views. idx_campaign_views_daily_unique
-- is a partial unique index (WHERE deleted_at IS NULL), which PostgREST's
-- .upsert() can't target directly -- hence the manual two-step. Two concurrent
-- requests for the same buyer/campaign/day (e.g. two catalog page loads racing)
-- both see zero rows on the UPDATE, both fall through to INSERT, and the second
-- hits "duplicate key value violates unique constraint idx_campaign_views_daily_unique".
-- A real INSERT ... ON CONFLICT (...) WHERE deleted_at IS NULL DO UPDATE closes
-- the race atomically -- Postgres supports a predicate on ON CONFLICT even though
-- PostgREST's upsert helper doesn't expose one.

CREATE OR REPLACE FUNCTION app.record_campaign_view(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_campaign_id uuid,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_view_date date := (v_now AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO app.campaign_views (tenant_id, buyer_id, campaign_id, view_date, viewed_at, source)
  VALUES (p_tenant_id, p_buyer_id, p_campaign_id, v_view_date, v_now, p_source)
  ON CONFLICT (tenant_id, buyer_id, campaign_id, view_date) WHERE deleted_at IS NULL
  DO UPDATE SET viewed_at = v_now, source = p_source, updated_at = v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION app.record_campaign_view(uuid, uuid, uuid, text) TO authenticated, anon, service_role;
