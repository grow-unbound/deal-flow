-- Add requester linkage to OAuth state rows so the callback can populate audit fields.
ALTER TABLE app.integration_oauth_states
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);
