ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS associated_users jsonb;

ALTER TABLE app.locations
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN associated_users SET DEFAULT '[]'::jsonb;

DO $$
BEGIN
  BEGIN
    ALTER TABLE app.locations
      ADD CONSTRAINT locations_status_check
      CHECK (status IN ('active', 'inactive'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

UPDATE app.locations
SET
  status = COALESCE(status, 'active'),
  associated_users = COALESCE(associated_users, '[]'::jsonb),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE app.locations
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN associated_users SET NOT NULL;
