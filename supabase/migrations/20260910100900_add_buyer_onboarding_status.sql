-- Add buyer onboarding/approval status tracking to app.buyers.
--
-- Per specs/Yukti_Public-Signup_Backend-Plan_v1.md §1.1 and its §0b addendum:
-- reuse the existing geography/billing_address jsonb columns (already carry
-- state/address) instead of adding new full_address/state columns.

ALTER TABLE app.buyers
  ADD COLUMN onboarding_status text NOT NULL DEFAULT 'approved'
    CONSTRAINT buyers_onboarding_status_check
    CHECK (onboarding_status IN ('pending_approval', 'needs_more_info', 'approved', 'declined')),
  ADD COLUMN declined_at timestamptz NULL,
  ADD COLUMN declined_reason text NULL;

CREATE INDEX buyers_tenant_onboarding_status_idx
  ON app.buyers (tenant_id, onboarding_status)
  WHERE deleted_at IS NULL;
