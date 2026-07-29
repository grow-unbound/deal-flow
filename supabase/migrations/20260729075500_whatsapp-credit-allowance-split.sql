-- WhatsApp credits — plan allowance / purchased split, dispatch-failure refund
-- Builds on the existing single-balance debit-at-dispatch system
-- (20260709000001_prod_bootstrap.sql, 20260713055448_synchronous-whatsapp-dispatch.sql).
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Credits-Migration_Brief_v1.md

-- ──────────────────────────────────────────────────────────────
-- 1. app.tenants — two-bucket balance, replaces the single combined balance
-- ──────────────────────────────────────────────────────────────

ALTER TABLE app.tenants
  ADD COLUMN IF NOT EXISTS whatsapp_plan_allowance_balance numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_plan_allowance_reset_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_purchased_credits_balance numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN app.tenants.whatsapp_plan_allowance_balance IS 'Free plan-tier credits remaining this cycle; reset (not additive) on the tenant''s monthly activation anniversary, never rolls over';
COMMENT ON COLUMN app.tenants.whatsapp_plan_allowance_reset_at IS 'Last time the plan allowance was granted/reset for this tenant; anchors the monthly reset to their activation day-of-month';
COMMENT ON COLUMN app.tenants.whatsapp_purchased_credits_balance IS 'Topped-up or manually-granted credits; never expires, never reset';

-- Backfill: treat all existing balance as purchased/carried-over, forfeit nothing.
UPDATE app.tenants
SET whatsapp_purchased_credits_balance = whatsapp_credits_balance
WHERE whatsapp_credits_balance IS NOT NULL;

ALTER TABLE app.tenants DROP COLUMN IF EXISTS whatsapp_credits_balance;

-- ──────────────────────────────────────────────────────────────
-- 2. app.tenants.plan — add 'lite' tier
-- ──────────────────────────────────────────────────────────────

ALTER TABLE app.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE app.tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan = ANY (ARRAY['lite'::text, 'starter'::text, 'growth'::text, 'scale'::text]));

-- ──────────────────────────────────────────────────────────────
-- 3. app.whatsapp_plan_credit_tiers — new table
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.whatsapp_plan_credit_tiers (
  plan_tier text PRIMARY KEY CHECK (plan_tier IN ('lite','starter','growth','scale')),
  monthly_credit_allowance numeric(10,2) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

ALTER TABLE app.whatsapp_plan_credit_tiers OWNER TO postgres;
ALTER TABLE app.whatsapp_plan_credit_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_plan_credit_tiers_select ON app.whatsapp_plan_credit_tiers
  FOR SELECT USING (app.is_seller());

GRANT SELECT ON TABLE app.whatsapp_plan_credit_tiers TO authenticated;
GRANT ALL ON TABLE app.whatsapp_plan_credit_tiers TO service_role;

CREATE OR REPLACE TRIGGER whatsapp_plan_credit_tiers_updated_at
  BEFORE UPDATE ON app.whatsapp_plan_credit_tiers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

INSERT INTO app.whatsapp_plan_credit_tiers (plan_tier, monthly_credit_allowance) VALUES
  ('lite', 1000),
  ('starter', 2000),
  ('growth', 4000),
  ('scale', 7500)
ON CONFLICT (plan_tier) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4. app.whatsapp_credit_pricing — locked rate, new versioned row
-- ──────────────────────────────────────────────────────────────

INSERT INTO app.whatsapp_credit_pricing (credit_price_inr)
VALUES (0.20);

-- ──────────────────────────────────────────────────────────────
-- 5. app.whatsapp_credit_transactions — balance_source + plan_allowance_reset
-- ──────────────────────────────────────────────────────────────

ALTER TABLE app.whatsapp_credit_transactions
  ADD COLUMN IF NOT EXISTS balance_source text;

UPDATE app.whatsapp_credit_transactions
SET balance_source = 'purchased'
WHERE balance_source IS NULL;

ALTER TABLE app.whatsapp_credit_transactions
  ALTER COLUMN balance_source SET NOT NULL;

ALTER TABLE app.whatsapp_credit_transactions
  ADD CONSTRAINT whatsapp_credit_transactions_balance_source_check
  CHECK (balance_source IN ('plan_allowance', 'purchased'));

ALTER TABLE app.whatsapp_credit_transactions
  DROP CONSTRAINT IF EXISTS whatsapp_credit_transactions_transaction_type_check;
ALTER TABLE app.whatsapp_credit_transactions
  ADD CONSTRAINT whatsapp_credit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY['topup'::text, 'debit'::text, 'refund'::text, 'adjustment'::text, 'plan_allowance_reset'::text]));

-- ──────────────────────────────────────────────────────────────
-- 6. Backfill existing activated tenants with an initial allowance grant.
--    Anchored to the migration date (now()), not each tenant's real
--    historical email_verified_at — see plan note: reusing the real
--    historical date would already be >1 month stale for most existing
--    tenants, causing an immediate double-grant on the first cron run.
--    Every tenant activated after this migration ships anchors correctly
--    via the trigger in section 8.
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant record;
  v_allowance numeric(10,2);
BEGIN
  FOR v_tenant IN
    SELECT id, plan
    FROM app.tenants
    WHERE deleted_at IS NULL
      AND email_verified_at IS NOT NULL
  LOOP
    SELECT monthly_credit_allowance INTO v_allowance
    FROM app.whatsapp_plan_credit_tiers
    WHERE plan_tier = v_tenant.plan
      AND deleted_at IS NULL;

    IF v_allowance IS NULL THEN
      RAISE WARNING 'no whatsapp_plan_credit_tiers row for plan % (tenant %) — skipping initial grant', v_tenant.plan, v_tenant.id;
      CONTINUE;
    END IF;

    UPDATE app.tenants
    SET whatsapp_plan_allowance_balance = v_allowance,
        whatsapp_plan_allowance_reset_at = now()
    WHERE id = v_tenant.id;

    INSERT INTO app.whatsapp_credit_transactions (
      tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id, notes
    ) VALUES (
      v_tenant.id, 'plan_allowance_reset', v_allowance, 'plan_allowance', NULL, v_allowance, NULL,
      'initial grant — whatsapp-credit-allowance-split migration'
    );
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 7. Rewrite app.debit_whatsapp_credits — draw allowance first, spill to purchased
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.debit_whatsapp_credits(p_whatsapp_message_id uuid)
RETURNS app.whatsapp_credit_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_message app.whatsapp_messages%ROWTYPE;
  v_rate app.whatsapp_rate_card%ROWTYPE;
  v_credit_price numeric(6,4);
  v_allowance_balance numeric(12,2);
  v_purchased_balance numeric(12,2);
  v_needed numeric(12,2);
  v_from_allowance numeric(12,2);
  v_from_purchased numeric(12,2);
  v_new_allowance_balance numeric(12,2);
  v_new_purchased_balance numeric(12,2);
  v_primary_txn app.whatsapp_credit_transactions%ROWTYPE;
  v_txn app.whatsapp_credit_transactions%ROWTYPE;
BEGIN
  IF p_whatsapp_message_id IS NULL THEN
    RAISE EXCEPTION 'whatsapp_message_id required' USING ERRCODE = '22023';
  END IF;

  -- Lock the message row first so concurrent debit attempts on the same
  -- message serialize (no double-debit of a single send).
  SELECT * INTO v_message
  FROM app.whatsapp_messages
  WHERE id = p_whatsapp_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'whatsapp message % not found', p_whatsapp_message_id USING ERRCODE = 'P0002';
  END IF;

  IF v_message.wallet_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'whatsapp message % already debited (wallet_transaction_id=%)',
      p_whatsapp_message_id, v_message.wallet_transaction_id
      USING ERRCODE = '22023';
  END IF;

  -- (a) rate lookup
  SELECT * INTO v_rate
  FROM app.whatsapp_rate_card
  WHERE meta_category = v_message.meta_category
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active rate card entry for category %', v_message.meta_category USING ERRCODE = 'P0002';
  END IF;

  SELECT credit_price_inr INTO v_credit_price
  FROM app.whatsapp_credit_pricing
  WHERE deleted_at IS NULL
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_credit_price IS NULL THEN
    RAISE EXCEPTION 'no active whatsapp_credit_pricing row' USING ERRCODE = 'P0002';
  END IF;

  -- (b) lock tenant row, guard against negative combined balance
  SELECT whatsapp_plan_allowance_balance, whatsapp_purchased_credits_balance
  INTO v_allowance_balance, v_purchased_balance
  FROM app.tenants
  WHERE id = v_message.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % not found', v_message.tenant_id USING ERRCODE = 'P0002';
  END IF;

  v_needed := v_rate.credits_per_message;

  IF (v_allowance_balance + v_purchased_balance) < v_needed THEN
    RAISE EXCEPTION 'insufficient whatsapp credits for tenant % (balance % < required %)',
      v_message.tenant_id, (v_allowance_balance + v_purchased_balance), v_needed
      USING ERRCODE = '73000'; -- insufficient_resources
  END IF;

  -- (c) draw allowance first, spill remainder into purchased
  v_from_allowance := LEAST(v_needed, v_allowance_balance);
  v_from_purchased := v_needed - v_from_allowance;

  v_new_allowance_balance := v_allowance_balance - v_from_allowance;
  v_new_purchased_balance := v_purchased_balance - v_from_purchased;

  UPDATE app.tenants
  SET whatsapp_plan_allowance_balance = v_new_allowance_balance,
      whatsapp_purchased_credits_balance = v_new_purchased_balance
  WHERE id = v_message.tenant_id;

  -- (d) one ledger row per bucket actually touched
  v_primary_txn := NULL;

  IF v_from_allowance > 0 THEN
    INSERT INTO app.whatsapp_credit_transactions (
      tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id
    ) VALUES (
      v_message.tenant_id, 'debit', -v_from_allowance, 'plan_allowance',
      round(v_from_allowance * v_credit_price, 2), v_new_allowance_balance, v_message.id
    )
    RETURNING * INTO v_txn;
    v_primary_txn := v_txn;
  END IF;

  IF v_from_purchased > 0 THEN
    INSERT INTO app.whatsapp_credit_transactions (
      tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id
    ) VALUES (
      v_message.tenant_id, 'debit', -v_from_purchased, 'purchased',
      round(v_from_purchased * v_credit_price, 2), v_new_purchased_balance, v_message.id
    )
    RETURNING * INTO v_txn;
    IF v_primary_txn IS NULL THEN
      v_primary_txn := v_txn;
    END IF;
  END IF;

  -- (e) stamp the message row — wallet_transaction_id points at the first
  -- bucket touched; the full debit (and any later refund) history for this
  -- message is authoritatively queryable via
  -- whatsapp_credit_transactions.related_message_id (1-to-many).
  UPDATE app.whatsapp_messages
  SET
    credits_charged = v_needed,
    meta_cost_inr = v_rate.meta_cost_inr,
    billed_amount = round(v_needed * v_credit_price, 2),
    wallet_transaction_id = v_primary_txn.id
  WHERE id = v_message.id;

  RETURN v_primary_txn;
END;
$$;

ALTER FUNCTION app.debit_whatsapp_credits(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.debit_whatsapp_credits(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.debit_whatsapp_credits(uuid) TO service_role;

-- ──────────────────────────────────────────────────────────────
-- 8. New app.refund_whatsapp_credits — idempotent, ledger-driven
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.refund_whatsapp_credits(p_whatsapp_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_already_refunded integer;
  v_debit record;
  v_new_balance numeric(12,2);
BEGIN
  IF p_whatsapp_message_id IS NULL THEN
    RAISE EXCEPTION 'whatsapp_message_id required' USING ERRCODE = '22023';
  END IF;

  -- Lock the message row so a concurrent refund/debit on the same message serializes.
  PERFORM 1 FROM app.whatsapp_messages WHERE id = p_whatsapp_message_id FOR UPDATE;

  SELECT count(*) INTO v_already_refunded
  FROM app.whatsapp_credit_transactions
  WHERE related_message_id = p_whatsapp_message_id
    AND transaction_type = 'refund';

  IF v_already_refunded > 0 THEN
    RETURN; -- idempotent no-op
  END IF;

  FOR v_debit IN
    SELECT *
    FROM app.whatsapp_credit_transactions
    WHERE related_message_id = p_whatsapp_message_id
      AND transaction_type = 'debit'
    ORDER BY created_at
  LOOP
    IF v_debit.balance_source = 'plan_allowance' THEN
      UPDATE app.tenants
      SET whatsapp_plan_allowance_balance = whatsapp_plan_allowance_balance + abs(v_debit.credits)
      WHERE id = v_debit.tenant_id
      RETURNING whatsapp_plan_allowance_balance INTO v_new_balance;
    ELSE
      UPDATE app.tenants
      SET whatsapp_purchased_credits_balance = whatsapp_purchased_credits_balance + abs(v_debit.credits)
      WHERE id = v_debit.tenant_id
      RETURNING whatsapp_purchased_credits_balance INTO v_new_balance;
    END IF;

    INSERT INTO app.whatsapp_credit_transactions (
      tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id, notes
    ) VALUES (
      v_debit.tenant_id, 'refund', abs(v_debit.credits), v_debit.balance_source, v_debit.inr_amount, v_new_balance,
      p_whatsapp_message_id, 'auto-refund: delivery failed'
    );
  END LOOP;
END;
$$;

ALTER FUNCTION app.refund_whatsapp_credits(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.refund_whatsapp_credits(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.refund_whatsapp_credits(uuid) TO service_role;

-- ──────────────────────────────────────────────────────────────
-- 9. Activation trigger — grants initial allowance the moment
--    email_verified_at is first stamped, anchoring the reset cycle to the
--    tenant's real activation day-of-month going forward.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.grant_initial_whatsapp_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_allowance numeric(10,2);
BEGIN
  SELECT monthly_credit_allowance INTO v_allowance
  FROM app.whatsapp_plan_credit_tiers
  WHERE plan_tier = NEW.plan
    AND deleted_at IS NULL;

  IF v_allowance IS NULL THEN
    RAISE WARNING 'no whatsapp_plan_credit_tiers row for plan % (tenant %) — skipping initial grant', NEW.plan, NEW.id;
    RETURN NEW;
  END IF;

  UPDATE app.tenants
  SET whatsapp_plan_allowance_balance = v_allowance,
      whatsapp_plan_allowance_reset_at = NEW.email_verified_at
  WHERE id = NEW.id;

  INSERT INTO app.whatsapp_credit_transactions (
    tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id, notes
  ) VALUES (
    NEW.id, 'plan_allowance_reset', v_allowance, 'plan_allowance', NULL, v_allowance, NULL,
    'initial grant on activation'
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION app.grant_initial_whatsapp_allowance() OWNER TO postgres;

CREATE OR REPLACE TRIGGER trg_grant_initial_whatsapp_allowance
  AFTER UPDATE OF email_verified_at ON app.tenants
  FOR EACH ROW
  WHEN (OLD.email_verified_at IS NULL AND NEW.email_verified_at IS NOT NULL)
  EXECUTE FUNCTION app.grant_initial_whatsapp_allowance();

-- ──────────────────────────────────────────────────────────────
-- 10. app.reset_whatsapp_plan_allowances — monthly reset, anchored per-tenant
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.reset_whatsapp_plan_allowances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_tenant record;
  v_allowance numeric(10,2);
  v_new_reset_at timestamptz;
BEGIN
  FOR v_tenant IN
    SELECT id, plan, whatsapp_plan_allowance_reset_at
    FROM app.tenants
    WHERE deleted_at IS NULL
      AND whatsapp_plan_allowance_reset_at IS NOT NULL
      AND now() >= whatsapp_plan_allowance_reset_at + interval '1 month'
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT monthly_credit_allowance INTO v_allowance
    FROM app.whatsapp_plan_credit_tiers
    WHERE plan_tier = v_tenant.plan
      AND deleted_at IS NULL;

    IF v_allowance IS NULL THEN
      RAISE WARNING 'no whatsapp_plan_credit_tiers row for plan % (tenant %) — skipping reset', v_tenant.plan, v_tenant.id;
      CONTINUE;
    END IF;

    -- Advance by exactly one month from the last anchor (not now()) so the
    -- activation day-of-month never drifts, even if this cron run is late.
    v_new_reset_at := v_tenant.whatsapp_plan_allowance_reset_at + interval '1 month';

    UPDATE app.tenants
    SET whatsapp_plan_allowance_balance = v_allowance,
        whatsapp_plan_allowance_reset_at = v_new_reset_at
    WHERE id = v_tenant.id;

    INSERT INTO app.whatsapp_credit_transactions (
      tenant_id, transaction_type, credits, balance_source, inr_amount, balance_after, related_message_id, notes
    ) VALUES (
      v_tenant.id, 'plan_allowance_reset', v_allowance, 'plan_allowance', NULL, v_allowance, NULL,
      'monthly reset'
    );
  END LOOP;
END;
$$;

ALTER FUNCTION app.reset_whatsapp_plan_allowances() OWNER TO postgres;
REVOKE ALL ON FUNCTION app.reset_whatsapp_plan_allowances() FROM PUBLIC;
GRANT ALL ON FUNCTION app.reset_whatsapp_plan_allowances() TO service_role;

-- ──────────────────────────────────────────────────────────────
-- 11. Cron registration — idempotent, mirrors ensure_membership_refresh_tick_cron_scheduled
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.ensure_whatsapp_allowance_reset_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'whatsapp-plan-allowance-reset',
    '0 3 * * *',
    $cron$SELECT app.reset_whatsapp_plan_allowances();$cron$
  );
END;
$$;

ALTER FUNCTION app.ensure_whatsapp_allowance_reset_cron_scheduled() OWNER TO postgres;

SELECT app.ensure_whatsapp_allowance_reset_cron_scheduled();

-- ──────────────────────────────────────────────────────────────
-- 12. app.complete_whatsapp_message_send — refund on synchronous send failure
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.complete_whatsapp_message_send(
  p_message_id uuid,
  p_success boolean,
  p_provider_message_id text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_queue_id uuid;
  v_reason text := NULLIF(p_failure_reason, '');
  v_broadcast_id uuid;
BEGIN
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'message_id required' USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_queue_id
  FROM app.whatsapp_send_queue
  WHERE whatsapp_message_id = p_message_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF p_success THEN
    UPDATE app.whatsapp_messages
    SET status = 'sent',
        provider_message_id = p_provider_message_id,
        failure_reason = NULL,
        sent_at = COALESCE(sent_at, now()),
        updated_at = now()
    WHERE id = p_message_id;

    IF v_queue_id IS NOT NULL THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'sent',
          failure_reason = NULL,
          updated_at = now()
      WHERE id = v_queue_id;
    END IF;
  ELSE
    UPDATE app.whatsapp_messages
    SET status = 'failed',
        failure_reason = COALESCE(v_reason, 'WhatsApp send failed'),
        updated_at = now()
    WHERE id = p_message_id
      AND status NOT IN ('sent', 'delivered', 'read');

    IF v_queue_id IS NOT NULL THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = COALESCE(v_reason, 'WhatsApp send failed'),
          updated_at = now()
      WHERE id = v_queue_id
        AND status <> 'sent';
    END IF;

    -- Credits were debited synchronously before the Meta call in
    -- prepare_whatsapp_message_for_send; a send that never reached Meta
    -- (or was rejected outright) must refund. Never let a refund bug block
    -- the status update above.
    BEGIN
      PERFORM app.refund_whatsapp_credits(p_message_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'refund_whatsapp_credits failed for message %: %', p_message_id, SQLERRM;
    END;
  END IF;

  SELECT whatsapp_broadcast_id
  INTO v_broadcast_id
  FROM app.whatsapp_messages
  WHERE id = p_message_id;

  PERFORM app.refresh_whatsapp_broadcast_rollup(v_broadcast_id);
END;
$$;

ALTER FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) TO service_role;
