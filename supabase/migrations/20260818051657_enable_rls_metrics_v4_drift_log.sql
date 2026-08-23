-- Fix: app.metrics_v4_period_drift_log was the only app.* table without RLS
-- enabled. It's a cron/internal diagnostic table (no app code references it at
-- all — confirmed via repo-wide grep), so lock it to service_role only.

ALTER TABLE "app"."metrics_v4_period_drift_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metrics_v4_period_drift_log_service_role_only" ON "app"."metrics_v4_period_drift_log"
  AS RESTRICTIVE
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "app"."metrics_v4_period_drift_log" FROM "authenticated", "anon";
GRANT ALL ON TABLE "app"."metrics_v4_period_drift_log" TO "service_role";
