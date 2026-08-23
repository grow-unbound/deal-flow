-- Perf: merge app.campaign_buyer_members's two permissive SELECT policies
-- into one OR'd policy. Postgres evaluates every permissive policy per query
-- and ORs the results -- two separate policies for the same role/action pair
-- is pure duplicate planning/exec work, flagged by the Supabase performance
-- advisor as multiple_permissive_policies (6 rows, one per role variant,
-- confirmed live this session via get_advisors -- the only remaining
-- multiple_permissive_policies finding in the whole DB).
--
-- Policy bodies pulled live via pg_policies before writing this (not
-- hand-guessed):
--   campaign_buyer_members_buyer_select: is_buyer() AND buyer_id = jwt_buyer_id()
--     AND campaign is published, for that buyer's own tenant.
--   campaign_buyer_members_seller_select: is_seller() AND campaign belongs to
--     the seller's own tenant (no buyer_id/published-status restriction --
--     sellers see all members of their own campaigns regardless of status).
-- Both already use the (select app.fn()) wrapped form from the earlier RLS
-- perf pass (20260823053838_wrap_rls_helper_calls_in_select.sql) -- preserved
-- as-is in the merge, this migration only changes policy *count*, not
-- semantics or per-row function-call behavior.

DROP POLICY IF EXISTS campaign_buyer_members_buyer_select ON app.campaign_buyer_members;
DROP POLICY IF EXISTS campaign_buyer_members_seller_select ON app.campaign_buyer_members;

CREATE POLICY campaign_buyer_members_select ON app.campaign_buyer_members
  FOR SELECT
  USING (
    (
      (select app.is_buyer())
      AND buyer_id = (select app.jwt_buyer_id())
      AND EXISTS (
        SELECT 1 FROM app.campaigns c
        WHERE c.id = campaign_buyer_members.campaign_id
          AND c.tenant_id = (select app.jwt_tenant_id())
          AND c.status = 'published'
      )
    )
    OR
    (
      (select app.is_seller())
      AND EXISTS (
        SELECT 1 FROM app.campaigns c
        WHERE c.id = campaign_buyer_members.campaign_id
          AND c.tenant_id = (select app.jwt_tenant_id())
      )
    )
  );
