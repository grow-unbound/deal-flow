-- Phase 9 follow-up (see specs/db-perf-recovery-2026-09-20.md).
--
-- The atomic limiter returned only (allowed, hit_count), so every 429 had to say "retry in 60 s" even
-- when the fixed window was about to reset. That made a graceful client retry impossible. Return the
-- seconds remaining in the current window too, so `Retry-After` is accurate (typically a few seconds).
--
-- A function's RETURNS TABLE shape cannot change with CREATE OR REPLACE, hence DROP + CREATE. The extra
-- column is additive for callers: code that reads only `allowed` keeps working, so this migration and
-- the app deploy can land in either order (the app falls back to a default when the column is absent).
--
-- Idempotent.

DROP FUNCTION IF EXISTS app.consume_public_catalog_rate_limit(text, integer, integer);

CREATE FUNCTION app.consume_public_catalog_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE (allowed boolean, hit_count integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
DECLARE
  v_hits integer;
  v_window_start timestamptz;
  v_window interval := make_interval(secs => GREATEST(p_window_seconds, 1));
BEGIN
  INSERT INTO app.public_catalog_rate_limits AS r (key, hit_count, window_start, updated_at)
  VALUES (p_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE
    SET hit_count    = CASE WHEN r.window_start > now() - v_window THEN r.hit_count + 1 ELSE 1 END,
        window_start = CASE WHEN r.window_start > now() - v_window THEN r.window_start ELSE now() END,
        updated_at   = now()
  RETURNING r.hit_count, r.window_start INTO v_hits, v_window_start;

  RETURN QUERY SELECT
    (v_hits <= p_limit),
    v_hits,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_start + v_window - now())))::integer);
END;
$$;

REVOKE ALL ON FUNCTION app.consume_public_catalog_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.consume_public_catalog_rate_limit(text, integer, integer) TO service_role;
