-- Add per-phase tracking columns to integration_sync_jobs.
-- Supports the sequential wineyard-pattern sync: one job row per entity phase,
-- with explicit phase name, record count, resume cursor, and paused status.

ALTER TABLE app.integration_sync_jobs
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS records_synced integer;

-- Widen the status constraint to include 'paused' (page-limit resume) and 'pending' (not yet started).
ALTER TABLE app.integration_sync_jobs
  DROP CONSTRAINT IF EXISTS integration_sync_jobs_status_check;

ALTER TABLE app.integration_sync_jobs
  ADD CONSTRAINT integration_sync_jobs_status_check CHECK (
    status IN ('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled')
  );

-- Index to quickly find all phase jobs for a given sync run (grouped by parent job id via external_ref).
CREATE INDEX IF NOT EXISTS integration_sync_jobs_phase_idx
  ON app.integration_sync_jobs (tenant_integration_id, phase, created_at DESC);
