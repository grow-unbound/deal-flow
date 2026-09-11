-- Fix: account-takeover via switch-context -> select-context.
--
-- switch-context wrote a "verified candidates" record (app.otp_sessions,
-- kind='verified') with no binding to who created it. select-context then
-- let the caller pick ANY candidate inside that record's `candidates` array
-- and minted a real session for it, with no check that the caller's own
-- authenticated identity matched either the record's creator or the
-- selected candidate. Combined with switch-context deriving its phone via
-- a mutable app.buyers.phone lookup (resolveCallerPhone), an attacker could
-- rewrite their own phone to a victim's phone (PATCH /api/buyer/me, same-
-- tenant-only uniqueness check), call switch-context to get back the
-- victim's real login candidates, then call select-context selecting the
-- victim's candidate to mint a full session as the victim -- zero fresh OTP.
--
-- This migration adds the creator-identity column; the corresponding TS
-- fix stamps it at write time (switch-context only -- the real OTP-verify
-- flow has no authenticated caller yet, so it stays NULL there) and
-- enforces it at select-context time.
ALTER TABLE "app"."otp_sessions"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid NULL;

COMMENT ON COLUMN "app"."otp_sessions"."created_by_user_id" IS
  'auth.uid() of the authenticated session that created this verified-candidates record via /api/auth/switch-context. NULL for records written by the unauthenticated phone-otp/verify flow (real OTP hash check is the authorization there). When set, /api/auth/phone-otp/select-context must require the redeeming caller''s own session to match this user id.';
