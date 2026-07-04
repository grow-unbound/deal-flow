-- pgTAP tests for WhatsApp Broadcast (Phases A-F): cross-tenant RLS isolation
-- Spec requirement (.claude/CLAUDE.md): "5 cross-tenant isolation tests on
-- day 1 — run on every PR." This file covers the tables added across
-- Phases A-F that tests/rls_policies.sql (EP-11-002, pre-dates this feature)
-- does not exercise:
--   app.whatsapp_messages              (Phase A)
--   app.whatsapp_credit_pricing        (Phase B, global config, no tenant_id)
--   app.whatsapp_rate_card             (Phase B, global config, no tenant_id, no SELECT policy at all)
--   app.whatsapp_credit_transactions   (Phase B, tenant-scoped)
--   app.whatsapp_templates             (Phase D, tenant_id NULLable — platform rows global-readable)
--   app.whatsapp_broadcasts            (Phase E, tenant-scoped, seller_admin-write-only)
--   app.tenant_broadcast_limits        (Phase F, PK IS tenant_id)
--   app.whatsapp_send_queue            (Phase F, platform-infra, no seller/buyer SELECT at all)
--   app.whatsapp_platform_config       (Phase F, single global row, seller-readable, no client writes)
--
-- Run with: npx supabase test db --file=tests/rls_whatsapp_broadcast.sql

BEGIN;

SELECT plan(29);

-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures: two tenants, sellers of both roles in tenant A, a buyer in
-- tenant A, plus tenant-B counterpart rows for every WhatsApp table under
-- test. Mirrors tests/rls_policies.sql's fixture shape/helpers.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_seller_a uuid := gen_random_uuid(); -- seller_admin for tenant A
  v_seller_b uuid := gen_random_uuid(); -- seller_admin for tenant B
  v_asst_a   uuid := gen_random_uuid(); -- seller_assistant for tenant A
  v_buyer_a  uuid := gen_random_uuid();
  v_buyer_user_a uuid := gen_random_uuid();

  v_msg_a uuid := gen_random_uuid();
  v_msg_b uuid := gen_random_uuid();
  v_txn_a uuid := gen_random_uuid();
  v_txn_b uuid := gen_random_uuid();
  v_broadcast_a uuid := gen_random_uuid();
  v_broadcast_b uuid := gen_random_uuid();
  v_platform_template uuid := gen_random_uuid();
  v_tenant_template_b uuid := gen_random_uuid();
  v_queue_a uuid := gen_random_uuid();
  v_queue_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_seller_a, 'wa-seller-a@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_seller_b, 'wa-seller-b@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_asst_a,   'wa-asst-a@test.local',   'x', now(), now(), now(), '{}', '{}'),
    (v_buyer_user_a, 'wa-buyer-a@test.local', 'x', now(), now(), now(), '{}', '{}');

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant_a, 'wa-acme',   'WA Acme Dist.',   now(), now()),
    (v_tenant_b, 'wa-globex', 'WA Globex Dist.', now(), now());

  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, is_active, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_tenant_a, v_seller_a, 'seller_admin',     true, now(), now()),
    (gen_random_uuid(), v_tenant_a, v_asst_a,   'seller_assistant', true, now(), now()),
    (gen_random_uuid(), v_tenant_b, v_seller_b, 'seller_admin',     true, now(), now());

  INSERT INTO app.buyers (id, tenant_id, business_name, created_at, updated_at)
  VALUES (v_buyer_a, v_tenant_a, 'WA RetailCo', now(), now());

  INSERT INTO app.buyer_users (id, buyer_id, user_id, role, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), v_buyer_a, v_buyer_user_a, 'buyer_admin', true, now(), now());

  -- ── Phase A: whatsapp_messages, one row per tenant ─────────────────────────
  INSERT INTO app.whatsapp_messages (id, tenant_id, buyer_id, recipient_phone, meta_category, trigger_source, status, created_at, updated_at)
  VALUES
    (v_msg_a, v_tenant_a, v_buyer_a, '+919800000001', 'utility', 'order_placed', 'sent', now(), now()),
    (v_msg_b, v_tenant_b, NULL,      '+919800000002', 'utility', 'order_placed', 'sent', now(), now());

  -- ── Phase B: whatsapp_credit_transactions, one row per tenant ──────────────
  INSERT INTO app.whatsapp_credit_transactions (id, tenant_id, transaction_type, credits, balance_after, created_at, updated_at)
  VALUES
    (v_txn_a, v_tenant_a, 'topup', 100, 1100, now(), now()),
    (v_txn_b, v_tenant_b, 'topup', 100, 1100, now(), now());

  -- ── Phase D: one platform-managed template (tenant_id NULL, global) plus a
  --    hypothetical tenant-scoped template row for tenant B (future use,
  --    not created by any app code path yet, but the column IS nullable so
  --    RLS must still scope it correctly if/when one exists) ───────────────
  INSERT INTO app.whatsapp_templates (id, tenant_id, meta_template_name, meta_category, use_case, body, created_at, updated_at)
  VALUES
    (v_platform_template, NULL, 'wa_test_platform_template', 'utility', 'otp', 'Platform template body', now(), now()),
    (v_tenant_template_b, v_tenant_b, 'wa_test_tenant_b_template', 'utility', 'otp', 'Tenant B private template body', now(), now());

  -- ── Phase E: whatsapp_broadcasts, one row per tenant ───────────────────────
  INSERT INTO app.whatsapp_broadcasts (id, tenant_id, name, use_case, target_type, created_at, updated_at)
  VALUES
    (v_broadcast_a, v_tenant_a, 'WA Test Broadcast A', 'campaign_announcement', 'all_buyers', now(), now()),
    (v_broadcast_b, v_tenant_b, 'WA Test Broadcast B', 'campaign_announcement', 'all_buyers', now(), now());

  -- ── Phase F: tenant_broadcast_limits (PK = tenant_id) ──────────────────────
  INSERT INTO app.tenant_broadcast_limits (tenant_id, daily_broadcast_cap, created_at, updated_at)
  VALUES
    (v_tenant_a, 100, now(), now()),
    (v_tenant_b, 250, now(), now());

  -- ── Phase F: whatsapp_send_queue, one row per tenant ───────────────────────
  INSERT INTO app.whatsapp_send_queue (id, tenant_id, whatsapp_message_id, priority, created_at, updated_at)
  VALUES
    (v_queue_a, v_tenant_a, v_msg_a, 5, now(), now()),
    (v_queue_b, v_tenant_b, v_msg_b, 5, now(), now());

  CREATE TEMP TABLE _wa_fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _wa_fixture VALUES
    ('tenant_a',      v_tenant_a),
    ('tenant_b',      v_tenant_b),
    ('seller_a',      v_seller_a),
    ('seller_b',      v_seller_b),
    ('asst_a',        v_asst_a),
    ('buyer_a',       v_buyer_a),
    ('buyer_user_a',  v_buyer_user_a),
    ('msg_a',         v_msg_a),
    ('msg_b',         v_msg_b),
    ('txn_a',         v_txn_a),
    ('txn_b',         v_txn_b),
    ('platform_template', v_platform_template),
    ('tenant_template_b', v_tenant_template_b),
    ('broadcast_a',   v_broadcast_a),
    ('broadcast_b',   v_broadcast_b),
    ('queue_a',       v_queue_a),
    ('queue_b',       v_queue_b);
END $$;

-- Reuse the same mock-JWT helper convention as tests/rls_policies.sql. It's
-- (re)created here too, in case this file is ever run standalone rather than
-- after tests/rls_policies.sql in the same `supabase test db` batch.
CREATE OR REPLACE FUNCTION app._mock_jwt(
  p_tenant_id uuid,
  p_role text,
  p_buyer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',       p_tenant_id::text,
      'tenant_id', p_tenant_id::text,
      'role',      p_role,
      'buyer_id',  p_buyer_id::text
    )::text,
    true
  );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 1 — app.whatsapp_messages: tenant A cannot SELECT tenant B rows
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_messages m
    WHERE m.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Scenario 1: seller A cannot SELECT tenant B whatsapp_messages rows'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_messages m
    WHERE m.id = (SELECT val FROM _wa_fixture WHERE key = 'msg_a')
  ),
  'Scenario 1 (control): seller A CAN SELECT its own tenant''s whatsapp_messages row'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 2 — app.whatsapp_broadcasts: cross-tenant SELECT block, and
-- seller_assistant (non-admin) cannot INSERT/UPDATE even within own tenant
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_broadcasts b
    WHERE b.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Scenario 2a: seller A cannot SELECT tenant B whatsapp_broadcasts rows'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT app._mock_jwt('%s'::uuid, 'seller_assistant');
      INSERT INTO app.whatsapp_broadcasts (tenant_id, name, use_case, target_type)
      VALUES ('%s'::uuid, 'assistant should not be able to insert this', 'campaign_announcement', 'all_buyers');
    $sql$,
    (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
    (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  '42501',
  NULL,
  'Scenario 2b: seller_assistant cannot INSERT whatsapp_broadcasts even within own tenant (seller_admin-only policy)'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT app._mock_jwt('%s'::uuid, 'seller_assistant');
      UPDATE app.whatsapp_broadcasts SET name = 'renamed by assistant' WHERE id = '%s'::uuid;
    $sql$,
    (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
    (SELECT val FROM _wa_fixture WHERE key = 'broadcast_a')
  ),
  '42501',
  NULL,
  'Scenario 2c: seller_assistant cannot UPDATE whatsapp_broadcasts even within own tenant (seller_admin-only policy)'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_broadcasts b
    WHERE b.id = (SELECT val FROM _wa_fixture WHERE key = 'broadcast_a')
  ),
  'Scenario 2 (control): seller_admin A CAN SELECT its own tenant''s broadcast'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 3 — app.whatsapp_credit_transactions: tenant A cannot SELECT
-- tenant B rows
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_credit_transactions t
    WHERE t.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Scenario 3: seller A cannot SELECT tenant B whatsapp_credit_transactions rows'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_credit_transactions t
    WHERE t.id = (SELECT val FROM _wa_fixture WHERE key = 'txn_a')
  ),
  'Scenario 3 (control): seller A CAN SELECT its own tenant''s credit transaction'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 4 — app.whatsapp_templates: any tenant's seller CAN read
-- platform-managed rows (tenant_id IS NULL), but cannot see the hypothetical
-- tenant-scoped row belonging to a different tenant
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_templates t
    WHERE t.id = (SELECT val FROM _wa_fixture WHERE key = 'platform_template')
  ),
  'Scenario 4a: seller A (tenant A) CAN read platform-managed template (tenant_id IS NULL)'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_b'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_templates t
    WHERE t.id = (SELECT val FROM _wa_fixture WHERE key = 'platform_template')
  ),
  'Scenario 4b: seller B (tenant B) ALSO CAN read the same platform-managed template'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_templates t
    WHERE t.id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_template_b')
  ),
  0,
  'Scenario 4c: seller A (tenant A) cannot SELECT tenant B''s hypothetical tenant-scoped template row'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT app._mock_jwt('%s'::uuid, 'seller_admin');
      UPDATE app.whatsapp_templates SET body = 'hijacked by tenant A seller' WHERE id = '%s'::uuid;
    $sql$,
    (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
    (SELECT val FROM _wa_fixture WHERE key = 'tenant_template_b')
  ),
  '42501',
  NULL,
  'Scenario 4d: seller A cannot UPDATE tenant B''s tenant-scoped template row (no client UPDATE policy at all)'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_b'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_templates t
    WHERE t.id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_template_b')
  ),
  'Scenario 4 (control): seller B (tenant B) CAN read its own tenant-scoped template row'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 5 — app.whatsapp_send_queue / app.tenant_broadcast_limits:
-- tenant A cannot SELECT tenant B rows
-- ════════════════════════════════════════════════════════════════════════════
-- send_queue has NO seller/buyer SELECT policy at all (platform-infra only) —
-- so tenant A's seller should see zero rows, for its OWN tenant too.
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_send_queue q
    WHERE q.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Scenario 5a: seller A cannot SELECT tenant B whatsapp_send_queue rows (also verifies no seller SELECT policy exists at all)'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.whatsapp_send_queue q
    WHERE q.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  0,
  'Scenario 5b: seller A cannot SELECT even its OWN tenant''s whatsapp_send_queue rows (no client SELECT policy at all — platform-infra only, by design)'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.tenant_broadcast_limits l
    WHERE l.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Scenario 5c: seller A cannot SELECT tenant B''s tenant_broadcast_limits row (PK = tenant_id)'
);

SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt((SELECT val FROM _wa_fixture WHERE key = 'tenant_a'), 'seller_admin')
    ) AS _setup,
    app.tenant_broadcast_limits l
    WHERE l.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  'Scenario 5 (control): seller A CAN SELECT its own tenant_broadcast_limits row'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SCENARIO 6 (bonus) — buyers are fully denied on seller/service-role-only
-- tables: whatsapp_messages, whatsapp_credit_transactions, whatsapp_broadcasts
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _wa_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.whatsapp_messages m
    WHERE m.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  0,
  'Scenario 6a: buyer_admin cannot SELECT any whatsapp_messages rows, even in own tenant (seller/service-role only)'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _wa_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.whatsapp_credit_transactions t
    WHERE t.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  0,
  'Scenario 6b: buyer_admin cannot SELECT any whatsapp_credit_transactions rows, even in own tenant'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _wa_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _wa_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.whatsapp_broadcasts b
    WHERE b.tenant_id = (SELECT val FROM _wa_fixture WHERE key = 'tenant_a')
  ),
  0,
  'Scenario 6c: buyer_admin cannot SELECT any whatsapp_broadcasts rows, even in own tenant'
);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS ENABLED CHECKS — ensure no WhatsApp table was missed
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_messages'::regclass),
  'RLS enabled on app.whatsapp_messages'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_credit_pricing'::regclass),
  'RLS enabled on app.whatsapp_credit_pricing'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_rate_card'::regclass),
  'RLS enabled on app.whatsapp_rate_card'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_credit_transactions'::regclass),
  'RLS enabled on app.whatsapp_credit_transactions'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_templates'::regclass),
  'RLS enabled on app.whatsapp_templates'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_broadcasts'::regclass),
  'RLS enabled on app.whatsapp_broadcasts'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenant_broadcast_limits'::regclass),
  'RLS enabled on app.tenant_broadcast_limits'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_send_queue'::regclass),
  'RLS enabled on app.whatsapp_send_queue'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.whatsapp_platform_config'::regclass),
  'RLS enabled on app.whatsapp_platform_config'
);

SELECT * FROM finish();

ROLLBACK;
