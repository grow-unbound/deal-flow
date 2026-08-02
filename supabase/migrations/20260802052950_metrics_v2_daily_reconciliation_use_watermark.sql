-- Daily reconciliation: switch from a blind fixed trailing-2-day re-mark to
-- a watermark-based mark (from the day after the last successful run, to
-- today), capped at a bounded 7-day safety window for the multi-day-outage
-- case.
--
-- Why: the original 20260717094820 migration marked `today-1, today` every
-- single night, for every tenant, unconditionally -- a permanent 2x cost
-- paid forever as a safety margin that's only actually needed on the rare
-- day (A)'s post-sync trigger or (B)'s fallback cron didn't fire. For a
-- high-volume tenant this trailing-2-day window is what pushed the v4
-- buyer-key budget check into needing an oversized ceiling to accommodate
-- what was mostly redundant re-work, not real new work.
--
-- app.metrics_refresh_state.last_successful_computation_at already exists
-- per (tenant_id, domain) -- reused here as the watermark, no new column
-- needed. Steady state (yesterday's run succeeded): marks exactly today (1
-- day). Gap case (a run was missed): marks from the day after the last
-- success, capped at 7 days back, so it self-heals without reintroducing an
-- unbounded window.
--
-- metrics_mark_age_out calls are untouched -- separate concern (90-day
-- trailing-window boundary correction), not part of this bug.

CREATE OR REPLACE FUNCTION app.metrics_mark_daily_reconciliation(p_tenant_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_domains text[] := ARRAY['commercial', 'inventory', 'buyer_app', 'setup'];
  v_domain text;
  v_last_date date;
  v_from date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Correct the 90-day trailing-window boundary for the three age-out-eligible domains.
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'commercial', 90);
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'inventory', 90);
  PERFORM app.metrics_mark_age_out(p_tenant_id, 'buyer_app', 90);

  FOREACH v_domain IN ARRAY v_domains LOOP
    SELECT (rs.last_successful_computation_at AT TIME ZONE 'Asia/Kolkata')::date
    INTO v_last_date
    FROM app.metrics_refresh_state rs
    WHERE rs.tenant_id = p_tenant_id AND rs.domain = v_domain;

    v_from := GREATEST(COALESCE(v_last_date, v_today - 7) + 1, v_today - 7);

    IF v_from <= v_today THEN
      PERFORM app.metrics_mark_reconciliation(p_tenant_id, v_domain, v_from, v_today);
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION app.metrics_mark_daily_reconciliation(uuid) OWNER TO postgres;
