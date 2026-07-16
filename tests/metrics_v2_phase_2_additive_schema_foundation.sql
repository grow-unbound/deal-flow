-- Executable contract checks for Metrics V2 Phase 2 additive schema foundation.
--
-- Run against a database where the Phase 2 migration is applied. For linked
-- remote validation before a persistent push, concatenate the migration and
-- this file inside one BEGIN/ROLLBACK wrapper.

BEGIN;

CREATE TEMP TABLE _phase2_required_tables (table_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _phase2_required_tables (table_name)
VALUES
  ('metrics_tenant_commercial_snapshot'),
  ('metrics_tenant_inventory_snapshot'),
  ('metrics_tenant_buyer_app_snapshot'),
  ('metrics_tenant_setup_snapshot'),
  ('metrics_location_snapshot'),
  ('metrics_buyer_snapshot'),
  ('metrics_buyer_location_snapshot'),
  ('metrics_product_snapshot'),
  ('metrics_product_location_snapshot'),
  ('metrics_tenant_daily'),
  ('metrics_location_daily'),
  ('metrics_dirty_work'),
  ('metrics_runtime_control'),
  ('metrics_refresh_state'),
  ('metrics_refresh_leases'),
  ('metrics_execution_history');

CREATE TEMP TABLE _phase2_authenticated_select_tables (table_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _phase2_authenticated_select_tables (table_name)
VALUES
  ('metrics_tenant_commercial_snapshot'),
  ('metrics_tenant_inventory_snapshot'),
  ('metrics_tenant_buyer_app_snapshot'),
  ('metrics_tenant_setup_snapshot'),
  ('metrics_location_snapshot'),
  ('metrics_buyer_snapshot'),
  ('metrics_buyer_location_snapshot'),
  ('metrics_product_snapshot'),
  ('metrics_product_location_snapshot'),
  ('metrics_tenant_daily'),
  ('metrics_location_daily'),
  ('metrics_runtime_control'),
  ('metrics_refresh_state'),
  ('metrics_execution_history');

DO $$
DECLARE
  v_missing text[];
  v_bad text[];
BEGIN
  SELECT array_agg(r.table_name ORDER BY r.table_name)
    INTO v_missing
  FROM _phase2_required_tables r
  LEFT JOIN information_schema.tables t
    ON t.table_schema = 'app'
   AND t.table_name = r.table_name
  WHERE t.table_name IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing Phase 2 tables: %', v_missing;
  END IF;

  SELECT array_agg(r.table_name ORDER BY r.table_name)
    INTO v_bad
  FROM _phase2_required_tables r
  JOIN pg_class c ON c.relname = r.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
  WHERE NOT c.relrowsecurity;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 tables without RLS: %', v_bad;
  END IF;

  SELECT array_agg(r.table_name ORDER BY r.table_name)
    INTO v_bad
  FROM _phase2_required_tables r
  WHERE NOT has_table_privilege('service_role', format('app.%I', r.table_name), 'INSERT, SELECT, UPDATE, DELETE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 tables missing service_role grants: %', v_bad;
  END IF;

  SELECT array_agg(r.table_name ORDER BY r.table_name)
    INTO v_bad
  FROM _phase2_authenticated_select_tables r
  WHERE NOT has_table_privilege('authenticated', format('app.%I', r.table_name), 'SELECT');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 read tables missing authenticated SELECT grants: %', v_bad;
  END IF;
END $$;

DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(format('%I.%I', schemaname, tablename) ORDER BY tablename)
    INTO v_bad
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'app'
    AND tablename IN (SELECT table_name FROM _phase2_required_tables);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 tables must not be added to supabase_realtime: %', v_bad;
  END IF;
END $$;

DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(table_name ORDER BY table_name)
    INTO v_bad
  FROM information_schema.tables
  WHERE table_schema = 'app'
    AND table_name ~ '^metrics_.*_(buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily$';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Prohibited high-cardinality Metrics V2 daily tables exist: %', v_bad;
  END IF;

  SELECT array_agg(format('%I.%I', table_name, column_name) ORDER BY table_name, column_name)
    INTO v_bad
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name LIKE 'metrics_%'
    AND (data_type IN ('ARRAY', 'json', 'jsonb') OR udt_name LIKE '\_%');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Metrics V2 tables must not store arrays or JSON membership payloads: %', v_bad;
  END IF;
END $$;

DO $$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(format('%I.%I', table_name, column_name) ORDER BY table_name, column_name)
    INTO v_bad
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name IN (
      'metrics_dirty_work',
      'metrics_runtime_control',
      'metrics_refresh_state',
      'metrics_refresh_leases',
      'metrics_execution_history'
    )
    AND column_name IN ('external_ref', 'created_by', 'deleted_at');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Operational metrics tables violated approved convention exception: %', v_bad;
  END IF;
END $$;

DO $$
DECLARE
  v_missing text[];
BEGIN
  CREATE TEMP TABLE _phase2_required_unique_indexes (index_name text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _phase2_required_unique_indexes (index_name)
  VALUES
    ('metrics_tenant_commercial_snapshot_tenant_key'),
    ('metrics_tenant_inventory_snapshot_tenant_key'),
    ('metrics_tenant_buyer_app_snapshot_tenant_key'),
    ('metrics_tenant_setup_snapshot_tenant_key'),
    ('metrics_location_snapshot_grain_key'),
    ('metrics_buyer_snapshot_grain_key'),
    ('metrics_buyer_location_snapshot_grain_key'),
    ('metrics_product_snapshot_grain_key'),
    ('metrics_product_location_snapshot_grain_key'),
    ('metrics_tenant_daily_grain_key'),
    ('metrics_location_daily_grain_key'),
    ('metrics_dirty_work_active_source_key'),
    ('metrics_runtime_control_global_key'),
    ('metrics_runtime_control_tenant_domain_key'),
    ('metrics_refresh_state_tenant_domain_key'),
    ('metrics_refresh_leases_global_key'),
    ('metrics_refresh_leases_tenant_domain_key');

  SELECT array_agg(i.index_name ORDER BY i.index_name)
    INTO v_missing
  FROM _phase2_required_unique_indexes i
  LEFT JOIN pg_indexes p
    ON p.schemaname = 'app'
   AND p.indexname = i.index_name
  WHERE p.indexname IS NULL
     OR p.indexdef NOT ILIKE 'CREATE UNIQUE%';

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing unique-grain indexes: %', v_missing;
  END IF;
END $$;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_buyer_a uuid := gen_random_uuid();
  v_buyer_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_user_a, 'metrics-phase2-a@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_user_b, 'metrics-phase2-b@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant_a, 'metrics-phase2-a', 'Metrics Phase 2 A', now(), now()),
    (v_tenant_b, 'metrics-phase2-b', 'Metrics Phase 2 B', now(), now());

  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, created_at, updated_at)
  VALUES
    (v_tenant_a, v_user_a, 'seller_admin', true, now(), now()),
    (v_tenant_b, v_user_b, 'seller_admin', true, now(), now());

  INSERT INTO app.buyers (id, tenant_id, business_name, phone, created_at, updated_at)
  VALUES
    (v_buyer_a, v_tenant_a, 'Phase 2 Buyer A', '9999999201', now(), now()),
    (v_buyer_b, v_tenant_b, 'Phase 2 Buyer B', '9999999202', now(), now());

  INSERT INTO app.metrics_buyer_snapshot (tenant_id, buyer_id, external_ref)
  VALUES
    (v_tenant_a, v_buyer_a, 'phase2-buyer-a'),
    (v_tenant_b, v_buyer_b, 'phase2-buyer-b');

  INSERT INTO app.metrics_runtime_control (control_scope, dispatch_enabled)
  VALUES ('global', true);

  INSERT INTO app.metrics_runtime_control (control_scope, tenant_id, dispatch_enabled, pause_reason)
  VALUES ('tenant', v_tenant_a, false, 'phase2 test pause');

  CREATE TEMP TABLE _phase2_fixture (key text PRIMARY KEY, val uuid) ON COMMIT DROP;
  INSERT INTO _phase2_fixture (key, val)
  VALUES
    ('tenant_a', v_tenant_a),
    ('tenant_b', v_tenant_b),
    ('user_a', v_user_a),
    ('user_b', v_user_b),
    ('buyer_a', v_buyer_a),
    ('buyer_b', v_buyer_b);
END $$;

GRANT SELECT ON TABLE _phase2_fixture TO authenticated;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (SELECT val::text FROM _phase2_fixture WHERE key = 'user_a'),
    'tenant_id', (SELECT val::text FROM _phase2_fixture WHERE key = 'tenant_a'),
    'role', 'seller_admin'
  )::text,
  true
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_own_count integer;
  v_other_count integer;
  v_dispatch_a boolean;
  v_dispatch_b boolean;
BEGIN
  SELECT count(*)::int
    INTO v_own_count
  FROM app.metrics_buyer_snapshot
  WHERE tenant_id = (SELECT val FROM _phase2_fixture WHERE key = 'tenant_a');

  SELECT count(*)::int
    INTO v_other_count
  FROM app.metrics_buyer_snapshot
  WHERE tenant_id = (SELECT val FROM _phase2_fixture WHERE key = 'tenant_b');

  IF v_own_count <> 1 OR v_other_count <> 0 THEN
    RAISE EXCEPTION 'Metrics buyer snapshot RLS failed, own %, other %', v_own_count, v_other_count;
  END IF;

  SELECT app.metrics_dispatch_enabled((SELECT val FROM _phase2_fixture WHERE key = 'tenant_a'))
    INTO v_dispatch_a;
  SELECT app.metrics_dispatch_enabled((SELECT val FROM _phase2_fixture WHERE key = 'tenant_b'))
    INTO v_dispatch_b;

  IF v_dispatch_a IS DISTINCT FROM false OR v_dispatch_b IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'metrics_dispatch_enabled tenant override failed, tenant_a %, tenant_b %', v_dispatch_a, v_dispatch_b;
  END IF;
END $$;

RESET ROLE;

DELETE FROM app.metrics_runtime_control;

DO $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT app.metrics_dispatch_enabled((SELECT val FROM _phase2_fixture WHERE key = 'tenant_a'))
    INTO v_enabled;

  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'metrics_dispatch_enabled must default off without global control row, got %', v_enabled;
  END IF;
END $$;

SELECT 'metrics_v2_phase_2_additive_schema_foundation checks passed' AS result;

ROLLBACK;
