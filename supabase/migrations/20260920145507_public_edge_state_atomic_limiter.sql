-- Phase 9 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
--
-- Public-catalog edge state (rate limiter + IP challenge escalation) lives in Postgres and is hit
-- by middleware.ts on EVERY guest request, before ISR/CDN can serve anything:
--   * public_catalog_rate_limits: SELECT then UPSERT = 2 PostgREST round trips + 1 write per request,
--     non-atomic (two concurrent requests both read N and both write N+1: lost updates under load),
--   * ip_challenge_state: same read-then-upsert shape on the escalation path,
--   * neither table is ever pruned: one row per (ip, slug, kind) / per ip accumulates forever,
--   * default fillfactor (100) leaves no room for HOT updates on a table that is pure UPDATE churn.
--
-- This migration adds one-statement atomic RPCs (1 round trip, 1 upsert, race-free) and an hourly
-- bounded prune job. The app code switches to the RPCs (fail-open behaviour unchanged). The tables
-- come from 20260902055517 / 20260902125009; plpgsql does not resolve table names at CREATE time,
-- so this migration applies cleanly even before those tables exist (prod, pre-release), and the
-- prune function no-ops until they do. HOT-friendly storage settings live in 20260920151921.
--
-- Idempotent.

-- ---------------------------------------------------------------------------------------------
-- 1. Atomic rate-limit counter: fixed window per key, returns whether the request is allowed
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.consume_public_catalog_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE (allowed boolean, hit_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
DECLARE
  v_hits integer;
  v_window interval := make_interval(secs => GREATEST(p_window_seconds, 1));
BEGIN
  INSERT INTO app.public_catalog_rate_limits AS r (key, hit_count, window_start, updated_at)
  VALUES (p_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE
    SET hit_count    = CASE WHEN r.window_start > now() - v_window THEN r.hit_count + 1 ELSE 1 END,
        window_start = CASE WHEN r.window_start > now() - v_window THEN r.window_start ELSE now() END,
        updated_at   = now()
  RETURNING r.hit_count INTO v_hits;

  RETURN QUERY SELECT (v_hits <= p_limit), v_hits;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Atomic challenge-escalation counter
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.record_ip_challenge_violation(
  p_ip             text,
  p_window_seconds integer DEFAULT 900,
  p_threshold      integer DEFAULT 3
)
RETURNS TABLE (challenge_required boolean, violation_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
DECLARE
  v_count integer;
  v_window interval := make_interval(secs => GREATEST(p_window_seconds, 1));
BEGIN
  INSERT INTO app.ip_challenge_state AS s (ip, violation_count, window_start, updated_at)
  VALUES (p_ip, 1, now(), now())
  ON CONFLICT (ip) DO UPDATE
    SET violation_count = CASE WHEN s.window_start > now() - v_window THEN s.violation_count + 1 ELSE 1 END,
        window_start    = CASE WHEN s.window_start > now() - v_window THEN s.window_start ELSE now() END,
        updated_at      = now()
  RETURNING s.violation_count INTO v_count;

  RETURN QUERY SELECT (v_count >= p_threshold), v_count;
END;
$$;

REVOKE ALL ON FUNCTION app.consume_public_catalog_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.record_ip_challenge_violation(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.consume_public_catalog_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.record_ip_challenge_violation(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Bounded retention (windows are 60 s / 15 min; keep generous slack)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prune_public_edge_state(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
DECLARE
  v_total integer := 0;
  v_n integer;
BEGIN
  IF to_regclass('app.public_catalog_rate_limits') IS NULL OR to_regclass('app.ip_challenge_state') IS NULL THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT key FROM app.public_catalog_rate_limits
    WHERE updated_at < now() - interval '1 hour'
    ORDER BY updated_at LIMIT LEAST(GREATEST(p_limit, 1), 20000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.public_catalog_rate_limits r USING doomed d WHERE r.key = d.key;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH doomed AS (
    SELECT ip FROM app.ip_challenge_state
    WHERE updated_at < now() - interval '2 hours'
    ORDER BY updated_at LIMIT LEAST(GREATEST(p_limit, 1), 20000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.ip_challenge_state s USING doomed d WHERE s.ip = d.ip;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION app.prune_public_edge_state(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.prune_public_edge_state(integer) TO service_role;

-- Create-if-absent (never touches an existing job), hourly at :47 (clear of the tick / prune minutes).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-public-edge-state') THEN
    PERFORM cron.schedule('prune-public-edge-state', '47 * * * *', $job$SELECT app.prune_public_edge_state(5000)$job$);
  END IF;
END;
$$;
