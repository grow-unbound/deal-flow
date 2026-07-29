-- pgTAP functional tests for the plan-allowance/purchased credit split added
-- by 20260729075500_whatsapp-credit-allowance-split.sql.
--
-- Covers business logic that tests/rls_whatsapp_broadcast.sql does not (that
-- file is RLS/RBAC isolation only): debit draining allowance before
-- purchased, refund idempotency, and the monthly reset anchor advancing by
-- exactly one month (not `now()`).
--
-- Run with: npx supabase test db --file=tests/whatsapp_credit_allowance_split.sql

BEGIN;

-- This is a business-logic test (debit/refund/reset function behavior), not
-- an RLS test — disable row security for this transaction so fixture setup
-- and assertions read/write consistently regardless of the connecting
-- role's RLS context. Cross-tenant RLS isolation itself is covered by
-- tests/rls_whatsapp_broadcast.sql and tests/rls_policies.sql.
SET LOCAL row_security = off;

SELECT plan(11);

-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures: one tenant, a dedicated rate-card row + pricing row (self-
-- contained so this file doesn't depend on supabase/seed.sql having run),
-- and one whatsapp_messages row per debit scenario.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_rate_card_id uuid := gen_random_uuid();
  v_msg_split uuid := gen_random_uuid();
  v_msg_full_purchased uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.tenants (
    id, slug, business_name, plan,
    whatsapp_plan_allowance_balance, whatsapp_purchased_credits_balance,
    whatsapp_plan_allowance_reset_at,
    created_at, updated_at
  ) VALUES (
    v_tenant, 'wa-credit-split-test', 'WA Credit Split Test Co', 'starter',
    3, 100,
    now() - interval '1 month' - interval '1 day',
    now(), now()
  );

  INSERT INTO app.whatsapp_rate_card (id, meta_category, meta_cost_inr, credits_per_message, created_at, updated_at)
  VALUES (v_rate_card_id, 'utility', 0.1150, 5, now(), now());

  -- Message 1: needs 5 credits, allowance only has 3 — must split 3/2 across buckets.
  INSERT INTO app.whatsapp_messages (id, tenant_id, recipient_phone, meta_category, trigger_source, status, created_at, updated_at)
  VALUES (v_msg_split, v_tenant, '+919800000099', 'utility', 'order_placed', 'queued', now(), now());

  -- Message 2: after message 1 drains allowance to 0, this one draws entirely from purchased.
  INSERT INTO app.whatsapp_messages (id, tenant_id, recipient_phone, meta_category, trigger_source, status, created_at, updated_at)
  VALUES (v_msg_full_purchased, v_tenant, '+919800000098', 'utility', 'order_placed', 'queued', now(), now());

  CREATE TEMP TABLE _wcs_fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _wcs_fixture VALUES
    ('tenant', v_tenant),
    ('msg_split', v_msg_split),
    ('msg_full_purchased', v_msg_full_purchased);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1-4: debit_whatsapp_credits draws allowance first, spills into purchased
-- ════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
  format('SELECT app.debit_whatsapp_credits(%L::uuid)', (SELECT val FROM _wcs_fixture WHERE key = 'msg_split')),
  '1: debit_whatsapp_credits succeeds when combined balance covers the cost even though allowance alone does not'
);

SELECT is(
  (SELECT whatsapp_plan_allowance_balance FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant')),
  0::numeric,
  '2: allowance balance fully drained (3 of 5 needed credits)'
);

SELECT is(
  (SELECT whatsapp_purchased_credits_balance FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant')),
  98::numeric,
  '3: purchased balance absorbs the remaining 2 credits (100 - 2 = 98)'
);

SELECT is(
  (
    SELECT count(*)::int FROM app.whatsapp_credit_transactions
    WHERE related_message_id = (SELECT val FROM _wcs_fixture WHERE key = 'msg_split')
      AND transaction_type = 'debit'
  ),
  2,
  '4: one debit ledger row per bucket touched (plan_allowance + purchased)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5: a message whose full cost comes from purchased (allowance already 0)
-- writes exactly one debit row, tagged 'purchased'
-- ════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
  format('SELECT app.debit_whatsapp_credits(%L::uuid)', (SELECT val FROM _wcs_fixture WHERE key = 'msg_full_purchased')),
  '5: debit_whatsapp_credits succeeds drawing entirely from purchased once allowance is exhausted'
);

SELECT is(
  (
    SELECT balance_source FROM app.whatsapp_credit_transactions
    WHERE related_message_id = (SELECT val FROM _wcs_fixture WHERE key = 'msg_full_purchased')
      AND transaction_type = 'debit'
  ),
  'purchased',
  '6: sole debit row for the second message is tagged purchased (allowance already at 0)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7-9: refund_whatsapp_credits is idempotent and restores the correct buckets
-- ════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
  format('SELECT app.refund_whatsapp_credits(%L::uuid)', (SELECT val FROM _wcs_fixture WHERE key = 'msg_split')),
  '7: refund_whatsapp_credits succeeds for a debited message'
);

SELECT is(
  (SELECT whatsapp_plan_allowance_balance FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant')),
  3::numeric,
  '8: refund restores the plan_allowance bucket to its pre-debit value (0 + 3)'
);

SELECT lives_ok(
  format('SELECT app.refund_whatsapp_credits(%L::uuid)', (SELECT val FROM _wcs_fixture WHERE key = 'msg_split')),
  '9: calling refund_whatsapp_credits a second time on the same message does not error'
);

SELECT is(
  (SELECT whatsapp_plan_allowance_balance FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant')),
  3::numeric,
  '10: second refund call is a no-op — balance unchanged, not double-credited'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 11: reset_whatsapp_plan_allowances advances the anchor by exactly one
-- month from the prior reset_at, not to now()
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_prior_anchor timestamptz;
BEGIN
  SELECT whatsapp_plan_allowance_reset_at INTO v_prior_anchor
  FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant');

  PERFORM app.reset_whatsapp_plan_allowances();

  CREATE TEMP TABLE _wcs_anchor_check AS
  SELECT (v_prior_anchor + interval '1 month') AS expected_anchor;
END $$;

SELECT is(
  (SELECT whatsapp_plan_allowance_reset_at FROM app.tenants WHERE id = (SELECT val FROM _wcs_fixture WHERE key = 'tenant')),
  (SELECT expected_anchor FROM _wcs_anchor_check),
  '11: reset advances whatsapp_plan_allowance_reset_at by exactly one month from the prior anchor, not to now()'
);

SELECT * FROM finish();

ROLLBACK;
