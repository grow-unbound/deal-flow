-- Drop buyer_contacts (created in prior migration) and repurpose buyer_users
-- to store both authenticated buyers AND Zoho-imported contact persons.
-- user_id becomes nullable: NULL = not yet authenticated via OTP.

-- ── 1. Drop buyer_contacts (entire table, all its policies/indices/triggers) ──

DROP TABLE IF EXISTS app.buyer_contacts CASCADE;

-- ── 2. Make user_id nullable on buyer_users ───────────────────────────────────
-- Zoho contact persons don't have auth accounts until they complete OTP.

ALTER TABLE app.buyer_users
  ALTER COLUMN user_id DROP NOT NULL;

-- ── 3. Add contact-person fields to buyer_users ───────────────────────────────

ALTER TABLE app.buyer_users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── 4. Unique index for Supabase upsert: contact person per buyer ──────────────
-- Used during Zoho sync to upsert by (buyer_id, external_ref).
-- Partial so it only covers Zoho-imported rows (external_ref IS NOT NULL)
-- and doesn't conflict with existing authenticated-user rows.

CREATE UNIQUE INDEX IF NOT EXISTS buyer_users_buyer_external_ref_upsert
  ON app.buyer_users (buyer_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- Note: the existing (buyer_id, user_id) unique constraint covers authenticated
-- users. The two constraints are complementary: external_ref-keyed for Zoho
-- contacts, user_id-keyed for OTP-authenticated buyers.
