-- Fix: app.otp_sessions.otp stored the 6-digit code in plaintext. Now that RLS
-- locks this table to service_role only (fix_otp_sessions_rls migration), plaintext
-- storage is no longer directly exploitable via PostgREST, but hashing at rest is
-- still the correct defense-in-depth default for any credential-like value — add
-- otp_hash and stop writing the plaintext column going forward. Column is left in
-- place (nullable, unused) rather than dropped, since dropping a column live
-- requires more care around in-flight rows than this pass needs to take on.

ALTER TABLE "app"."otp_sessions" ADD COLUMN IF NOT EXISTS "otp_hash" "text";
ALTER TABLE "app"."otp_sessions" ALTER COLUMN "otp" DROP NOT NULL;
