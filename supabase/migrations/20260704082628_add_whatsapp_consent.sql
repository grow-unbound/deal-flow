-- WhatsApp Broadcast — Phase C: consent
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.8
--
-- Buyers: explicit checkbox consent, stamped once at first OTP login.
-- Seller users (app.tenant_users): implicit consent, stamped silently on
-- first successful login — no UI, mirrors the buyer pattern at a lighter
-- tier per §4.8. app.tenant_users currently only carries the location_ids
-- addition (20260614045147_seller_assistant_location_scope.sql); this is a
-- clean additive migration on top of that, no shape conflicts.
--
-- No RLS policy changes: app.buyers and app.tenant_users RLS (see
-- 20260524041418_rls_policies.sql) scopes rows by tenant_id / buyer_id only
-- — Postgres RLS is row-level, not column-level, so existing SELECT/UPDATE
-- policies already cover these new columns implicitly.

-- ── app.buyers — explicit checkbox consent + opt-out tracking ──────────────
ALTER TABLE app.buyers
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_method text DEFAULT 'explicit_checkbox_first_login',
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz NULL;

-- ── app.tenant_users — implicit consent (seller-side, lighter tier) ────────
ALTER TABLE app.tenant_users
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_method text DEFAULT 'implicit_first_login';
