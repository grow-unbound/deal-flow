-- Persist seller dashboard welcome/setup banner dismiss across devices.
-- NULL = still show for the tenant creator; non-null = acknowledged.

ALTER TABLE app.tenants
  ADD COLUMN IF NOT EXISTS onboarding_banner_dismissed_at timestamptz;

COMMENT ON COLUMN app.tenants.onboarding_banner_dismissed_at IS
  'When the tenant creator dismissed the dashboard welcome/setup banner. NULL means still show for creator.';
