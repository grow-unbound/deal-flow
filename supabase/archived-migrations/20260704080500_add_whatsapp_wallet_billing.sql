-- WhatsApp Broadcast — Phase B: wallet & billing
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.6
--
-- app.tenants.whatsapp_credits_balance / whatsapp_credits_purchased already
-- exist (integer, DEFAULT 1000 each — 20260610161007_settings_locations_billing.sql).
-- Whole-number credits are fine for the Option B pricing model (1 / 4 credits
-- per message), so no ALTER COLUMN is needed here.
--
-- This migration adds: global credit pricing, the internal (never
-- tenant-facing) Meta rate card, the per-tenant credit ledger, the FK from
-- app.whatsapp_messages.wallet_transaction_id (left unconstrained in Phase A
-- on purpose), and the synchronous debit RPC.

-- ── app.whatsapp_credit_pricing — single global config row ─────────────────
CREATE TABLE app.whatsapp_credit_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_price_inr numeric(6,4) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE TRIGGER whatsapp_credit_pricing_updated_at
  BEFORE UPDATE ON app.whatsapp_credit_pricing
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_credit_pricing ENABLE ROW LEVEL SECURITY;

-- Global config, not per-tenant — sellers can read it (no sensitive data),
-- writes are service-role/RPC-only (pricing changes are an internal call).
CREATE POLICY whatsapp_credit_pricing_select ON app.whatsapp_credit_pricing
  FOR SELECT USING (app.is_seller());

-- ── app.whatsapp_rate_card — internal only, never shown to tenants ─────────
CREATE TABLE app.whatsapp_rate_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_category text NOT NULL UNIQUE CHECK (meta_category IN ('marketing', 'utility', 'authentication')),
  meta_cost_inr numeric(10,4) NOT NULL,
  credits_per_message numeric(5,2) NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE TRIGGER whatsapp_rate_card_updated_at
  BEFORE UPDATE ON app.whatsapp_rate_card
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_rate_card ENABLE ROW LEVEL SECURITY;

-- Internal only (§4.6: "never shown to tenants") — no seller/buyer SELECT
-- policy at all. Only service_role (which bypasses RLS) and the
-- SECURITY DEFINER debit RPC below can read this table.

-- ── app.whatsapp_credit_transactions ────────────────────────────────────────
CREATE TABLE app.whatsapp_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,

  transaction_type text NOT NULL CHECK (transaction_type IN ('topup', 'debit', 'refund', 'adjustment')),
  credits numeric(12,2) NOT NULL, -- positive for topup/refund, negative for debit
  inr_amount numeric(12,2),
  balance_after numeric(12,2) NOT NULL,

  related_message_id uuid REFERENCES app.whatsapp_messages(id) ON DELETE RESTRICT,
  payment_reference text,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX idx_whatsapp_credit_transactions_tenant_created
  ON app.whatsapp_credit_transactions (tenant_id, created_at);

CREATE TRIGGER whatsapp_credit_transactions_updated_at
  BEFORE UPDATE ON app.whatsapp_credit_transactions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Seller can SELECT their own tenant's transactions; no buyer access.
-- INSERT is service-role/RPC-only (via app.debit_whatsapp_credits, which is
-- SECURITY DEFINER) — no direct client INSERT policy.
CREATE POLICY whatsapp_credit_transactions_select ON app.whatsapp_credit_transactions
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ── Phase A retrofit: constrain wallet_transaction_id now that the target
--    table exists ───────────────────────────────────────────────────────────
ALTER TABLE app.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_wallet_transaction_id_fkey
  FOREIGN KEY (wallet_transaction_id)
  REFERENCES app.whatsapp_credit_transactions(id)
  ON DELETE RESTRICT;

-- ── Seed pricing (Option B, confirmed) ──────────────────────────────────────
INSERT INTO app.whatsapp_credit_pricing (credit_price_inr)
VALUES (0.25);

INSERT INTO app.whatsapp_rate_card (meta_category, meta_cost_inr, credits_per_message)
VALUES
  ('utility', 0.1150, 1),
  ('authentication', 0.1150, 1),
  ('marketing', 0.8631, 4);

-- ── app.debit_whatsapp_credits — synchronous debit RPC (§4.6) ───────────────
-- Given a whatsapp_message_id, atomically:
--   (a) reads credits_per_message for that message's meta_category from
--       app.whatsapp_rate_card
--   (b) decrements app.tenants.whatsapp_credits_balance by that many credits,
--       guarding against going negative (raises on insufficient balance)
--   (c) writes an app.whatsapp_credit_transactions row
--       (transaction_type='debit', negative credits, INR-equivalent from
--       app.whatsapp_credit_pricing)
--   (d) stamps billed_amount/wallet_transaction_id/credits_charged/
--       meta_cost_inr back onto the app.whatsapp_messages row
-- all in one transaction (the function body IS the transaction — Postgres
-- functions run inside the caller's transaction unless it commits early,
-- and this function does not).
CREATE OR REPLACE FUNCTION app.debit_whatsapp_credits(
  p_whatsapp_message_id uuid
)
RETURNS app.whatsapp_credit_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_message app.whatsapp_messages%ROWTYPE;
  v_rate app.whatsapp_rate_card%ROWTYPE;
  v_credit_price numeric(6,4);
  v_current_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_inr_amount numeric(12,2);
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

  -- (b) lock tenant row, guard against negative balance
  SELECT whatsapp_credits_balance INTO v_current_balance
  FROM app.tenants
  WHERE id = v_message.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % not found', v_message.tenant_id USING ERRCODE = 'P0002';
  END IF;

  IF v_current_balance < v_rate.credits_per_message THEN
    RAISE EXCEPTION 'insufficient whatsapp credits for tenant % (balance % < required %)',
      v_message.tenant_id, v_current_balance, v_rate.credits_per_message
      USING ERRCODE = '73000'; -- insufficient_resources
  END IF;

  v_new_balance := v_current_balance - v_rate.credits_per_message;
  v_inr_amount := round(v_rate.credits_per_message * v_credit_price, 2);

  UPDATE app.tenants
  SET whatsapp_credits_balance = v_new_balance
  WHERE id = v_message.tenant_id;

  -- (c) ledger row
  INSERT INTO app.whatsapp_credit_transactions (
    tenant_id, transaction_type, credits, inr_amount, balance_after,
    related_message_id
  ) VALUES (
    v_message.tenant_id, 'debit', -v_rate.credits_per_message, v_inr_amount, v_new_balance,
    v_message.id
  )
  RETURNING * INTO v_txn;

  -- (d) stamp the message row
  UPDATE app.whatsapp_messages
  SET
    credits_charged = v_rate.credits_per_message,
    meta_cost_inr = v_rate.meta_cost_inr,
    billed_amount = v_inr_amount,
    wallet_transaction_id = v_txn.id
  WHERE id = v_message.id;

  RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION app.debit_whatsapp_credits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.debit_whatsapp_credits(uuid) TO service_role;
