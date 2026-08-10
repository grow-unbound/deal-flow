-- The prior migration (20260809070025) added p_error_text to
-- metrics_refresh_tick via CREATE OR REPLACE, but Postgres treated the new
-- parameter list as a distinct overload rather than replacing the original
-- 5-arg function in place, leaving both signatures live:
--   app.metrics_refresh_tick(text, uuid, bigint, uuid, text)
--   app.metrics_refresh_tick(text, uuid, bigint, uuid, text, text)
-- PostgREST/supabase-js resolve RPC calls by matching named parameters, so
-- the metrics-refresh-tick edge function's calls (which now always pass
-- p_error_text) became ambiguous between the two overloads. Drop the stale
-- 5-arg original; the 6-arg version (p_error_text defaults to NULL) is a
-- strict superset and remains the only entry point.

DROP FUNCTION IF EXISTS app.metrics_refresh_tick(text, uuid, bigint, uuid, text);
