-- sync-coordinator's live-flip gate was a project-wide SYNC_COORDINATOR_LIVE
-- env secret (see supabase/functions/sync-coordinator/index.ts). That's the
-- wrong scope for a per-run concern: one flip affects every tenant's
-- in-flight master at once, has no audit trail, isn't guaranteed to
-- propagate instantly to warm function containers, and can be silently
-- wiped by any deploy or `supabase secrets set` that doesn't include it.
--
-- Move the flag onto the master job row itself. It's read fresh by
-- sync-coordinator on every tick anyway (loadJob), so this is free — no
-- extra query. Defaults true: the coordinator should execute its decisions
-- by default; ops flip a single run's flag to false as a per-run kill
-- switch (e.g. pause auto-dispatch for one misbehaving run without
-- touching every other tenant's active sync).
ALTER TABLE app.integration_sync_jobs
  ADD COLUMN coordinator_live boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN app.integration_sync_jobs.coordinator_live IS
  'Per-run live-flip gate for sync-coordinator. false = shadow mode (decide + record progress.meta.shadow_decision, execute nothing) for this run only. Replaces the old project-wide SYNC_COORDINATOR_LIVE env secret.';
