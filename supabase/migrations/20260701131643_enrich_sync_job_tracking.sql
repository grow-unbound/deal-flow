-- Add since_date column to integration_sync_jobs.
-- Makes the date filter used for a sync explicitly queryable without
-- parsing the progress JSON, fixing "SINCE NOT SET" in the History tab.
ALTER TABLE app.integration_sync_jobs
  ADD COLUMN IF NOT EXISTS since_date timestamptz;
