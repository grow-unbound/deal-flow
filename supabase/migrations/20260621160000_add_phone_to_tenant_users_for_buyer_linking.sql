-- Add phone to tenant_users so seller-to-buyer linking is reliable.
-- Previously the code fell back to auth.users.raw_user_meta_data which had
-- format mismatches (+91 prefix vs bare 10-digit) causing silent failures.
ALTER TABLE app.tenant_users
  ADD COLUMN IF NOT EXISTS phone text;

-- Backfill from auth.users.raw_user_meta_data for existing seller users
UPDATE app.tenant_users tu
SET phone = u.raw_user_meta_data->>'phone'
FROM auth.users u
WHERE tu.user_id = u.id
  AND u.raw_user_meta_data->>'phone' IS NOT NULL
  AND tu.phone IS NULL;
