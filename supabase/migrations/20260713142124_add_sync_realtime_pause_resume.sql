-- Automates the manual "drop sync-heavy tables from supabase_realtime before
-- a sync run, add them back after" workaround. The realtime logical-
-- replication WAL-decode consumer was the single biggest cumulative DB cost
-- observed during an initial Zoho sync (pg_stat_statements: 13k+ calls, 315s
-- total exec time) — every row change on a published table gets decoded to
-- JSON and pushed to the realtime service, and sync writes heavily to
-- exactly these tables.
--
-- Infra-internal only (called by integrations-sync/sync-coordinator edge
-- functions with the service-role client), so no actor/tenant permission
-- check like app._tenant_integrations_assert_seller_admin — granted to
-- service_role only, not authenticated, matching that these aren't
-- user-facing operations.
--
-- Idempotent both ways: ALTER PUBLICATION ... ADD/DROP TABLE errors if the
-- table is already in the requested state, so each function only touches
-- tables not already in that state (checked via pg_publication_tables).

CREATE OR REPLACE FUNCTION "app"."pause_sync_realtime"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_table text;
  v_dropped text[] := '{}';
BEGIN
  FOREACH v_table IN ARRAY ARRAY['campaigns', 'estimates', 'integration_sync_jobs', 'invoices', 'orders', 'tenant_integrations']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE app.%I', v_table);
      v_dropped := array_append(v_dropped, v_table);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'action', 'paused', 'tables_dropped', to_jsonb(v_dropped));
END;
$$;

ALTER FUNCTION "app"."pause_sync_realtime"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."pause_sync_realtime"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app"."pause_sync_realtime"() TO "service_role";

CREATE OR REPLACE FUNCTION "app"."resume_sync_realtime"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_table text;
  v_added text[] := '{}';
BEGIN
  FOREACH v_table IN ARRAY ARRAY['campaigns', 'estimates', 'integration_sync_jobs', 'invoices', 'orders', 'tenant_integrations']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE app.%I', v_table);
      v_added := array_append(v_added, v_table);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'action', 'resumed', 'tables_added', to_jsonb(v_added));
END;
$$;

ALTER FUNCTION "app"."resume_sync_realtime"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "app"."resume_sync_realtime"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app"."resume_sync_realtime"() TO "service_role";
