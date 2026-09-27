-- Phase 9 (see specs/db-perf-recovery-2026-09-20.md): HOT-friendly storage for the public edge state.
--
-- Both tables are pure UPDATE churn on non-indexed columns (counter + window bookkeeping keyed by a
-- primary key), so a lower fillfactor keeps updates on the same page (HOT) and aggressive autovacuum
-- keeps dead tuples bounded. Split from 20260920145507 because the tables only exist once the public
-- storefront migrations (20260902055517, 20260902125009) have run; this is a guarded no-op before that.
--
-- Idempotent.

DO $$
BEGIN
  IF to_regclass('app.public_catalog_rate_limits') IS NOT NULL THEN
    ALTER TABLE app.public_catalog_rate_limits
      SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 50);
  END IF;
  IF to_regclass('app.ip_challenge_state') IS NOT NULL THEN
    ALTER TABLE app.ip_challenge_state
      SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 50);
  END IF;
END;
$$;
