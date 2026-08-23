-- Fix: /api/auth/signin had no app-level throttle on failed password attempts,
-- relying solely on default Supabase GoTrue rate limits. Add a minimal
-- failed-attempt lockout table. Only touched on the failure path (checked before
-- attempting sign-in, written only after a failed attempt, cleared on success) so
-- it adds zero cost to the common-case successful-login hot path.

CREATE TABLE IF NOT EXISTS "app"."auth_signin_attempts" (
    "identifier" "text" PRIMARY KEY,
    "failed_count" integer NOT NULL DEFAULT 0,
    "locked_until" timestamptz,
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "app"."auth_signin_attempts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_signin_attempts_service_role_only" ON "app"."auth_signin_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "app"."auth_signin_attempts" FROM "authenticated", "anon";
GRANT ALL ON TABLE "app"."auth_signin_attempts" TO "service_role";
