-- SQL tests: buyer access-request approval (group + price list, atomic, idempotent, admin-only, Zoho state).
-- Migration under test: 20260926013239_approval_assignment_admin_only_zoho_push.sql
--
-- Run against the DEV project only (yukti-dev, hcpzbnmumbykdqveyjhr), e.g. via the Supabase MCP
-- execute_sql or `supabase db query --linked --file` from a workdir verified to be linked to dev.
-- Everything happens inside one DO block whose LAST statement raises
--   'approval_assignment tests passed (N assertions)'
-- so all fixtures are rolled back. Any failed assertion raises 'ASSERT FAILED: <label>' instead.

DO $test$
DECLARE
  n int := 0;
  ta uuid := gen_random_uuid();  tb uuid := gen_random_uuid();
  admin_a uuid := gen_random_uuid(); asst_a uuid := gen_random_uuid(); admin_b uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  e1 uuid; e2 uuid; e3 uuid;
  c_manual uuid := gen_random_uuid(); c_auto uuid := gen_random_uuid(); c_b uuid := gen_random_uuid();
  pl_ok uuid := gen_random_uuid(); pl_off uuid := gen_random_uuid(); pl_b uuid := gen_random_uuid();
  pl_group uuid := gen_random_uuid();
  r jsonb; r2 jsonb; msg text; cnt int; st text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (admin_a, 'appr-admin-a@test.local', 'x', now(), now(), now(), '{}', '{}'),
         (asst_a,  'appr-asst-a@test.local',  'x', now(), now(), now(), '{}', '{}'),
         (admin_b, 'appr-admin-b@test.local', 'x', now(), now(), now(), '{}', '{}');
  INSERT INTO app.tenants (id, slug, business_name) VALUES (ta, 'appr-a-' || left(ta::text, 8), 'Appr A'), (tb, 'appr-b-' || left(tb::text, 8), 'Appr B');
  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, location_ids) VALUES
    (ta, admin_a, 'seller_admin', true, NULL),
    (tb, admin_b, 'seller_admin', true, NULL);
  -- assistants need a location (chk_assistant_has_location); use a throwaway location if the table allows, else skip RLS parts
  INSERT INTO app.locations (id, tenant_id, name) VALUES ('11111111-1111-1111-1111-111111111111'::uuid, ta, 'L1') ON CONFLICT DO NOTHING;
  INSERT INTO app.tenant_users (tenant_id, user_id, role, is_active, location_ids)
  VALUES (ta, asst_a, 'seller_assistant', true, ARRAY['11111111-1111-1111-1111-111111111111'::uuid]);

  INSERT INTO app.buyers (id, tenant_id, business_name, onboarding_status, buyer_app_enabled) VALUES
    (b1, ta, 'Buyer One', 'pending_approval', false), (b2, ta, 'Buyer Two', 'pending_approval', false), (b3, ta, 'Buyer Three', 'pending_approval', false);
  INSERT INTO app.cohorts (id, tenant_id, name, membership_mode) VALUES
    (c_manual, ta, 'Retailers', 'manual'), (c_auto, ta, 'Auto', 'automatic'), (c_b, tb, 'Other tenant', 'manual');
  INSERT INTO app.price_lists (id, tenant_id, name, valid_from, is_active) VALUES
    (pl_ok, ta, 'Retail list', now() - interval '1 day', true),
    (pl_off, ta, 'Off list', now() - interval '1 day', false),
    (pl_b, tb, 'Other tenant list', now() - interval '1 day', true),
    (pl_group, ta, 'Group list', now() - interval '1 day', true);
  INSERT INTO app.price_list_assignments (price_list_id, target_type, target_id) VALUES (pl_group, 'cohort', c_manual);

  -- entries (a buyer trigger may already have created them)
  FOR st IN SELECT unnest(ARRAY[b1::text, b2::text, b3::text]) LOOP
    INSERT INTO app.entries (tenant_id, buyer_id, entry_type, source_channel, source_entity_type, source_entity_id, dedupe_key, status)
    SELECT ta, st::uuid, 'business_approval', 'storefront', 'buyer', st::uuid, 'appr-test:' || st, 'new'
    WHERE NOT EXISTS (SELECT 1 FROM app.entries WHERE tenant_id = ta AND source_entity_id = st::uuid AND entry_type = 'business_approval' AND deleted_at IS NULL);
  END LOOP;
  SELECT id INTO e1 FROM app.entries WHERE tenant_id = ta AND source_entity_id = b1 AND entry_type = 'business_approval' AND deleted_at IS NULL;
  SELECT id INTO e2 FROM app.entries WHERE tenant_id = ta AND source_entity_id = b2 AND entry_type = 'business_approval' AND deleted_at IS NULL;
  SELECT id INTO e3 FROM app.entries WHERE tenant_id = ta AND source_entity_id = b3 AND entry_type = 'business_approval' AND deleted_at IS NULL;
  UPDATE app.entries SET status = 'new', resolution_reason = NULL WHERE id IN (e1, e2, e3);

  -- ── admin-only ────────────────────────────────────────────────────────────────────────
  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, asst_a, NULL, NULL, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: assistant cannot approve (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_b, NULL, NULL, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: other-tenant admin cannot approve (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.apply_entry_action(ta, e1, asst_a, 'add_note', 'x'); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: assistant cannot add_note on approval entry (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.apply_entry_action(ta, e1, asst_a, 'decline', 'no'); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: assistant cannot decline (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.apply_entry_action(ta, e1, admin_a, 'approve'); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'approval_assignment_required' THEN RAISE EXCEPTION 'ASSERT FAILED: bare approve refused (got %)', msg; END IF;

  -- ── validation ────────────────────────────────────────────────────────────────────────
  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, NULL, NULL, false); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'assignment_confirmation_required' THEN RAISE EXCEPTION 'ASSERT FAILED: confirmation required (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, c_b, NULL, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'invalid_cohort' THEN RAISE EXCEPTION 'ASSERT FAILED: cross-tenant cohort rejected (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, NULL, pl_b, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'invalid_price_list' THEN RAISE EXCEPTION 'ASSERT FAILED: cross-tenant price list rejected (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, c_auto, NULL, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'cohort_not_manual' THEN RAISE EXCEPTION 'ASSERT FAILED: automatic cohort rejected (got %)', msg; END IF;

  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, c_manual, pl_off, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'price_list_inactive' THEN RAISE EXCEPTION 'ASSERT FAILED: inactive price list rejected (got %)', msg; END IF;

  -- soft-deleted price list
  UPDATE app.price_lists SET deleted_at = now() WHERE id = pl_off;
  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, c_manual, pl_off, true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'invalid_price_list' THEN RAISE EXCEPTION 'ASSERT FAILED: deleted price list rejected (got %)', msg; END IF;

  -- nothing changed after all the failed attempts
  SELECT count(*) INTO cnt FROM app.cohort_members WHERE buyer_id = b1;
  n := n + 1; IF cnt <> 0 OR (SELECT onboarding_status FROM app.buyers WHERE id = b1) = 'approved' THEN RAISE EXCEPTION 'ASSERT FAILED: failed validation leaves no side effects'; END IF;

  -- ── atomic rollback: failure AFTER buyer/cohort/assignment writes (forced at entry_events insert) ──
  EXECUTE $t$CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF NEW.note = 'boom' THEN RAISE EXCEPTION 'forced_failure'; END IF; RETURN NEW; END $f$$t$;
  EXECUTE 'CREATE TRIGGER zz_boom BEFORE INSERT ON app.entry_events FOR EACH ROW EXECUTE FUNCTION pg_temp.boom()';
  msg := NULL;
  BEGIN PERFORM app.approve_buyer_access_entry(ta, e1, admin_a, c_manual, pl_ok, true, 'boom'); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'forced_failure' THEN RAISE EXCEPTION 'ASSERT FAILED: forced failure surfaced (got %)', msg; END IF;
  SELECT count(*) INTO cnt FROM app.cohort_members WHERE buyer_id = b1;
  n := n + 1; IF cnt <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: rollback - no cohort member'; END IF;
  SELECT count(*) INTO cnt FROM app.price_list_assignments WHERE target_type = 'buyer' AND target_id = b1;
  n := n + 1; IF cnt <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: rollback - no price list assignment'; END IF;
  n := n + 1; IF (SELECT onboarding_status FROM app.buyers WHERE id = b1) = 'approved' OR (SELECT buyer_app_enabled FROM app.buyers WHERE id = b1) IS TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: rollback - buyer untouched'; END IF;
  n := n + 1; IF (SELECT status FROM app.entries WHERE id = e1) <> 'new' THEN RAISE EXCEPTION 'ASSERT FAILED: rollback - entry untouched'; END IF;
  EXECUTE 'DROP TRIGGER zz_boom ON app.entry_events';

  -- ── happy path ────────────────────────────────────────────────────────────────────────
  r := app.approve_buyer_access_entry(ta, e1, admin_a, c_manual, pl_ok, true, 'ok');
  n := n + 1; IF (r->>'applied')::boolean IS NOT TRUE OR (r->>'zoho_sync_status') <> 'not_required' THEN RAISE EXCEPTION 'ASSERT FAILED: applied, non-Zoho tenant -> not_required (%)', r; END IF;
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.buyers WHERE id = b1 AND onboarding_status = 'approved' AND buyer_app_enabled AND default_cohort_id = c_manual) THEN RAISE EXCEPTION 'ASSERT FAILED: buyer approved with default group'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.cohort_members_active WHERE cohort_id = c_manual AND buyer_id = b1) <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: cohort membership'; END IF;
  n := n + 1; IF (SELECT cached_member_count FROM app.cohorts WHERE id = c_manual) <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: cached_member_count'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.price_list_assignments WHERE target_type = 'buyer' AND target_id = b1 AND price_list_id = pl_ok AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: buyer-level price list assignment'; END IF;
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.entries WHERE id = e1 AND status = 'resolved' AND resolution_reason = 'approved' AND metadata #>> '{approval_assignment,cohort_name}' = 'Retailers' AND metadata #>> '{approval_assignment,price_list_name}' = 'Retail list') THEN RAISE EXCEPTION 'ASSERT FAILED: entry metadata records chosen group/list'; END IF;
  n := n + 1; IF (r #>> '{price_source,name}') <> 'Retail list' OR (r #>> '{price_source,source}') <> 'buyer' THEN RAISE EXCEPTION 'ASSERT FAILED: price source = buyer override (%)', r; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.entry_events WHERE entry_id = e1 AND action = 'approve' AND metadata #>> '{approval_assignment,cohort_id}' = c_manual::text) <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: entry_events audit row'; END IF;

  -- idempotent replay
  r2 := app.approve_buyer_access_entry(ta, e1, admin_a, c_manual, pl_ok, true);
  n := n + 1; IF (r2->>'applied')::boolean IS NOT FALSE OR (r2->>'replay')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: replay flagged (%)', r2; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.entry_events WHERE entry_id = e1 AND action = 'approve') <> 1
               OR (SELECT count(*) FROM app.cohort_members WHERE buyer_id = b1) <> 1
               OR (SELECT count(*) FROM app.price_list_assignments WHERE target_id = b1 AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: replay writes nothing'; END IF;

  -- group-only: preview falls to the group's price list; no buyer override
  r := app.approve_buyer_access_entry(ta, e2, admin_a, c_manual, NULL, true);
  n := n + 1; IF (r #>> '{price_source,name}') <> 'Group list' OR (r #>> '{price_source,source}') <> 'group' THEN RAISE EXCEPTION 'ASSERT FAILED: price source = group list (%)', r; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.price_list_assignments WHERE target_type = 'buyer' AND target_id = b2 AND deleted_at IS NULL) <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: no buyer override when none chosen'; END IF;

  -- "no group" approval is allowed once confirmed; no all_buyers list -> headline null
  r := app.approve_buyer_access_entry(ta, e3, admin_a, NULL, NULL, true);
  n := n + 1; IF (r->>'applied')::boolean IS NOT TRUE OR r->'price_source' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'ASSERT FAILED: no-group approval (%)', r; END IF;
  n := n + 1; IF EXISTS (SELECT 1 FROM app.cohort_members WHERE buyer_id = b3) THEN RAISE EXCEPTION 'ASSERT FAILED: no-group adds no membership'; END IF;

  -- ── preview / options RPCs ────────────────────────────────────────────────────────────
  r := app.get_approval_assignment_options(ta, admin_a);
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'cohorts') c WHERE c->>'id' = c_auto::text AND (c->>'eligible')::boolean IS FALSE)
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'cohorts') c WHERE c->>'id' = c_b::text)
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'price_lists') p WHERE p->>'id' IN (pl_off::text, pl_b::text))
               OR (r->>'default_cohort_id') <> c_manual::text THEN RAISE EXCEPTION 'ASSERT FAILED: options tenant-scoped, automatic ineligible, default = most-used manual (%)', r; END IF;
  msg := NULL;
  BEGIN PERFORM app.get_approval_assignment_options(ta, asst_a); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: options admin-only'; END IF;
  r := app.preview_approval_price_source(ta, admin_a, NULL, pl_b);
  n := n + 1; IF r->'headline' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'ASSERT FAILED: preview ignores other tenant list (%)', r; END IF;

  -- ── visibility ────────────────────────────────────────────────────────────────────────
  n := n + 1; IF (SELECT count(*) FROM app.list_entries(ta, NULL, 'all', NULL, NULL, 100, NULL, NULL, admin_a) WHERE entry_type = 'business_approval') <> 3 THEN RAISE EXCEPTION 'ASSERT FAILED: admin sees approval entries'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.list_entries(ta, NULL, 'all', NULL, NULL, 100, NULL, NULL, asst_a) WHERE entry_type IN ('business_approval','new_user_login')) <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: assistant list hides approval entries'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.list_entries(ta, NULL, 'all', NULL, 'Buyer One', 100, NULL, NULL, asst_a)) <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: assistant search hides approval entries'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.list_entries(ta, NULL, 'all', NULL, NULL, 100, NULL, NULL, NULL) WHERE entry_type = 'business_approval') <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: default-closed without actor'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.list_entries(ta, NULL, 'all', NULL, NULL, 100, NULL, NULL, admin_b) WHERE entry_type = 'business_approval') <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: other tenant admin sees nothing'; END IF;
  n := n + 1; IF (SELECT count(*) FROM app.list_entry_events_for_buyer(ta, b1, 200, admin_a)) = 0
               OR (SELECT count(*) FROM app.list_entry_events_for_buyer(ta, b1, 200, asst_a)) <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: buyer history visibility'; END IF;

  -- ── Zoho state machine (tenant with an active Zoho integration) ───────────────────────
  INSERT INTO app.tenant_integrations (tenant_id, integration_type_id, status) VALUES (ta, 'zoho_books', 'connected');
  INSERT INTO app.buyers (id, tenant_id, business_name, onboarding_status, buyer_app_enabled) VALUES ('22222222-2222-2222-2222-222222222222'::uuid, ta, 'Zoho Buyer', 'pending_approval', false);
  INSERT INTO app.entries (tenant_id, buyer_id, entry_type, source_channel, source_entity_type, source_entity_id, dedupe_key, status)
  VALUES (ta, '22222222-2222-2222-2222-222222222222'::uuid, 'business_approval', 'storefront', 'buyer', '22222222-2222-2222-2222-222222222222'::uuid, 'appr-test:zoho', 'new')
  ON CONFLICT DO NOTHING;
  SELECT id INTO e1 FROM app.entries WHERE tenant_id = ta AND source_entity_id = '22222222-2222-2222-2222-222222222222'::uuid AND entry_type = 'business_approval' AND deleted_at IS NULL;
  UPDATE app.entries SET status = 'new', resolution_reason = NULL WHERE id = e1;

  r := app.approve_buyer_access_entry(ta, e1, admin_a, NULL, NULL, true);
  n := n + 1; IF (r->>'zoho_sync_status') <> 'pending' OR NOT EXISTS (SELECT 1 FROM app.entries WHERE id = e1 AND external_system = 'zoho' AND external_sync_status = 'pending' AND external_sync_attempts = 0) THEN RAISE EXCEPTION 'ASSERT FAILED: Zoho tenant -> pending'; END IF;

  r := app.claim_buyer_zoho_push(e1);
  n := n + 1; IF (r->>'claimed')::boolean IS NOT TRUE OR (r->>'attempts')::int <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: first claim (%)', r; END IF;
  r := app.claim_buyer_zoho_push(e1);
  n := n + 1; IF (r->>'claimed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'ASSERT FAILED: lease blocks concurrent claim'; END IF;

  PERFORM app.record_buyer_zoho_push_result(e1, 'failed', 'Zoho down');
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.entries WHERE id = e1 AND external_sync_status = 'failed' AND external_sync_error = 'Zoho down' AND external_sync_next_attempt_at > now()) THEN RAISE EXCEPTION 'ASSERT FAILED: failure recorded with backoff'; END IF;
  -- approval itself is NOT rolled back by a Zoho failure
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.buyers WHERE id = '22222222-2222-2222-2222-222222222222'::uuid AND onboarding_status = 'approved') THEN RAISE EXCEPTION 'ASSERT FAILED: approval independent of Zoho'; END IF;

  msg := NULL;
  BEGIN PERFORM app.retry_buyer_zoho_sync(ta, e1, asst_a); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  n := n + 1; IF msg IS DISTINCT FROM 'admin_only_entry_action' THEN RAISE EXCEPTION 'ASSERT FAILED: assistant cannot retry Zoho sync'; END IF;
  PERFORM app.retry_buyer_zoho_sync(ta, e1, admin_a);
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.entries WHERE id = e1 AND external_sync_status = 'pending' AND external_sync_attempts = 0 AND external_sync_error IS NULL) THEN RAISE EXCEPTION 'ASSERT FAILED: admin retry resets state'; END IF;

  r := app.claim_buyer_zoho_push(e1);
  PERFORM app.record_buyer_zoho_push_result(e1, 'synced', NULL, 'zoho-123');
  n := n + 1; IF NOT EXISTS (SELECT 1 FROM app.entries WHERE id = e1 AND external_sync_status = 'synced' AND external_sync_next_attempt_at IS NULL) THEN RAISE EXCEPTION 'ASSERT FAILED: synced'; END IF;
  r := app.claim_buyer_zoho_push(e1);
  n := n + 1; IF (r->>'claimed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'ASSERT FAILED: synced entries are not re-claimed'; END IF;

  RAISE EXCEPTION 'approval_assignment tests passed (% assertions)', n;
END
$test$;
