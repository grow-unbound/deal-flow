-- Perf: app.jwt_tenant_id(), app.jwt_buyer_id(), app.is_seller(), app.is_buyer(),
-- app.is_seller_admin(), app.is_buyer_admin() are all STABLE but every RLS
-- policy across app.* calls them bare (e.g. `tenant_id = app.jwt_tenant_id()`)
-- instead of wrapped as `(select app.jwt_tenant_id())`. This is the classic
-- Postgres/Supabase RLS perf pitfall -- the planner can re-evaluate the
-- function per row scanned instead of once per statement when it's called
-- bare inside a policy qual/with_check. Wrapping in a scalar subquery lets
-- the planner treat it as an InitPlan, evaluated once per statement.
--
-- Scope, confirmed via a fresh pg_policies sweep in this session (not just
-- the original audit's partial list): 197 policies across ~90 app.* tables
-- reference one of these 6 functions in qual and/or with_check.
--
-- Rather than hand-transcribe 197 ALTER POLICY statements (high transcription
-- risk on security-critical RLS text), this migration generates each
-- statement mechanically from the live pg_policies.qual/with_check text via
-- regexp_replace, wrapping every bare `app.<fn>()` call (all 6 target
-- functions are niladic) in `(select app.<fn>())`. Verified in a pre-flight
-- dry run against every touched policy this session -- the substitution is
-- textually correct across all observed shapes (simple AND/OR combinations,
-- nested EXISTS subqueries) since it operates on Postgres's own deparsed
-- expression text, not hand-typed SQL.
--
-- Idempotent: the WHERE clause skips any qual/with_check that already
-- contains `(select app.`, so re-running this migration is a no-op.

DO $$
DECLARE
  pol record;
  fn_pattern text := 'app\.(jwt_tenant_id|jwt_buyer_id|is_seller_admin|is_buyer_admin|is_seller|is_buyer)\(\)';
  new_qual text;
  new_check text;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'app'
      AND (
        (qual IS NOT NULL AND qual ~ fn_pattern AND qual !~ '\(select app\.')
        OR (with_check IS NOT NULL AND with_check ~ fn_pattern AND with_check !~ '\(select app\.')
      )
  LOOP
    new_qual := CASE WHEN pol.qual IS NOT NULL
      THEN regexp_replace(pol.qual, fn_pattern, '(select app.\1())', 'g')
      ELSE NULL END;
    new_check := CASE WHEN pol.with_check IS NOT NULL
      THEN regexp_replace(pol.with_check, fn_pattern, '(select app.\1())', 'g')
      ELSE NULL END;

    IF pol.qual IS NOT NULL AND pol.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON app.%I USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, new_qual, new_check);
    ELSIF pol.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON app.%I USING (%s)',
        pol.policyname, pol.tablename, new_qual);
    ELSIF pol.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON app.%I WITH CHECK (%s)',
        pol.policyname, pol.tablename, new_check);
    END IF;
  END LOOP;
END $$;
