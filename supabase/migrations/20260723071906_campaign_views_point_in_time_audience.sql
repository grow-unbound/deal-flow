-- Point-in-time audience filter for campaign opens (requirement 7: "opens can be attributed
-- to membership state at order/view time"). A view only counts if the viewing buyer was
-- actually part of the campaign's target audience at the moment they viewed it, not just
-- currently. Handles all of this codebase's overlapping audience shapes in one pass since
-- campaigns.scope_type is constant per campaign (branches per-row, not per-buyer):
--   'all'        -- always in audience, no time dimension.
--   'buyer'      -- static buyer_id/buyer_ids list in scope_value; no history tracked for
--                   this list today, so current value is the best available signal.
--   'geography'  -- matched against the buyer's CURRENT geography (buyers.geography has no
--                   history either); same best-effort caveat.
--   'cohort'     -- matched against app.cohort_members' SCD2 window as of viewed_at.
-- Independently of scope_type, also matches app.campaign_buyer_members' SCD2 window as of
-- viewed_at, covering the new buyer_target_mode = 'manual'|'automatic' campaigns.

CREATE OR REPLACE FUNCTION "app"."filter_campaign_views_by_audience_at_view_time"("p_campaign_id" "uuid") RETURNS TABLE("buyer_id" "uuid", "campaign_id" "uuid", "viewed_at" timestamp with time zone, "view_date" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
  SELECT cv.buyer_id, cv.campaign_id, cv.viewed_at, cv.view_date
  FROM app.campaign_views cv
  JOIN app.campaigns c ON c.id = cv.campaign_id
  LEFT JOIN app.buyers b ON b.id = cv.buyer_id
  WHERE cv.campaign_id = p_campaign_id
    AND cv.deleted_at IS NULL
    AND (
      c.scope_type = 'all'
      OR (c.scope_type = 'buyer' AND (
        cv.buyer_id::text = c.scope_value ->> 'buyer_id'
        OR cv.buyer_id::text IN (SELECT jsonb_array_elements_text(COALESCE(c.scope_value -> 'buyer_ids', '[]'::jsonb)))
      ))
      OR (c.scope_type = 'geography' AND b.id IS NOT NULL AND (
        COALESCE(b.geography ->> 'city', '') = COALESCE(c.scope_value ->> 'city', c.scope_value ->> 'value', '')
        OR COALESCE(b.geography ->> 'state', '') = COALESCE(c.scope_value ->> 'state', c.scope_value ->> 'value', '')
      ))
      OR (c.scope_type = 'cohort' AND EXISTS (
        SELECT 1 FROM app.cohort_members cm
        WHERE cm.cohort_id::text = c.scope_value ->> 'cohort_id'
          AND cm.buyer_id = cv.buyer_id
          AND cm.valid_from <= cv.viewed_at
          AND (cm.valid_until IS NULL OR cm.valid_until > cv.viewed_at)
      ))
      OR EXISTS (
        SELECT 1 FROM app.campaign_buyer_members cbm
        WHERE cbm.campaign_id = c.id
          AND cbm.buyer_id = cv.buyer_id
          AND cbm.valid_from <= cv.viewed_at
          AND (cbm.valid_until IS NULL OR cbm.valid_until > cv.viewed_at)
      )
    );
$$;

ALTER FUNCTION "app"."filter_campaign_views_by_audience_at_view_time"("uuid") OWNER TO "postgres";

REVOKE EXECUTE ON FUNCTION "app"."filter_campaign_views_by_audience_at_view_time"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "app"."filter_campaign_views_by_audience_at_view_time"("uuid") TO "service_role";
