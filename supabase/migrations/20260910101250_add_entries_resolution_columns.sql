-- Task 2: additive resolution/sync/versioning columns on app.entries
-- Purely additive: all new columns are nullable or defaulted, no backfill required.
-- Does not touch existing columns, RLS policies, or entry_type/status CHECK constraints.

alter table app.entries
  add column resolution_reason text null,
  add column resolved_at timestamptz null,
  add column resolved_by uuid null references auth.users(id) on delete restrict,
  add column severity_tier text null,
  add column external_system text null,
  add column external_sync_attempted_at timestamptz null,
  add column external_sync_error text null,
  add column version integer not null default 1;
