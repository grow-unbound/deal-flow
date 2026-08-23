-- Fix: app.otp_sessions was readable/writable by any authenticated user across all
-- tenants (policy was `USING (true) WITH CHECK (true)` with no `TO` clause, plus
-- blanket SELECT/INSERT/UPDATE/DELETE grants to `authenticated`). Combined with the
-- `app` schema being PostgREST-exposed, this let any signed-up user read/hijack any
-- other user's OTP session via a direct REST call. The app only ever accesses this
-- table via the service-role client (supabaseAdmin), so lock it to service_role only.

DROP POLICY IF EXISTS "otp_sessions_public" ON "app"."otp_sessions";

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."otp_sessions" FROM "authenticated";
REVOKE ALL ON TABLE "app"."otp_sessions" FROM "anon";

CREATE POLICY "otp_sessions_service_role_only" ON "app"."otp_sessions"
  AS RESTRICTIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

-- Supports the new per-phone send-cooldown lookup added to /api/auth/phone-otp/send
-- (rate-limit fix) — that route now does one indexed SELECT by phone/kind/deleted_at
-- before issuing a new OTP.
CREATE INDEX IF NOT EXISTS "idx_otp_sessions_phone_kind" ON "app"."otp_sessions" USING "btree" ("phone", "kind") WHERE "deleted_at" IS NULL;
