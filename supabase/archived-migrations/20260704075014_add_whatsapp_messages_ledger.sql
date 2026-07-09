-- WhatsApp Broadcast — Phase A: messaging ledger
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.3
--
-- Single source of truth for every WhatsApp send (OTP, order/estimate
-- notifications, and — in later phases — broadcasts). Phase A only wires
-- this table up as a ledger; wallet/billing (whatsapp_credit_transactions),
-- templates (whatsapp_templates), and broadcasts (whatsapp_broadcasts) are
-- later phases, so whatsapp_template_id / whatsapp_broadcast_id /
-- wallet_transaction_id stay column-only with no FK constraint for now.

CREATE TABLE app.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES app.buyers(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,

  -- FK added in Phase D once app.whatsapp_templates exists.
  whatsapp_template_id uuid,

  meta_category text NOT NULL CHECK (meta_category IN ('marketing', 'utility', 'authentication', 'service')),

  -- FK added in Phase E once app.whatsapp_broadcasts exists.
  whatsapp_broadcast_id uuid,

  trigger_source text NOT NULL, -- 'broadcast','order_placed','otp_login','dispatch_notice', etc.
  provider_message_id text,     -- Meta's wamid, for webhook correlation

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked_by_recipient', 'opted_out')),
  failure_reason text,

  credits_charged numeric(6,2),
  meta_cost_inr numeric(10,4),
  billed_amount numeric(10,4),

  -- FK added in Phase B once app.whatsapp_credit_transactions exists.
  wallet_transaction_id uuid,

  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX idx_whatsapp_messages_tenant_category_sent
  ON app.whatsapp_messages (tenant_id, meta_category, sent_at);

CREATE INDEX idx_whatsapp_messages_tenant_broadcast
  ON app.whatsapp_messages (tenant_id, whatsapp_broadcast_id);

CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON app.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Seller roles (both admin and assistant) can read + insert their tenant's
-- ledger rows — sends are recorded server-side via supabaseAdmin (service
-- role, bypasses RLS), but seller-facing usage/billing views (Phase B) read
-- this table under the authenticated role, so a SELECT policy is needed now.
-- No UPDATE/DELETE policy: status transitions (delivered/read/failed) happen
-- via the service-role webhook receiver only, never from the client.
CREATE POLICY whatsapp_messages_select ON app.whatsapp_messages
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY whatsapp_messages_insert ON app.whatsapp_messages
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- Buyers must not be able to read this table directly — no buyer policy.
-- Service role (supabaseAdmin) always bypasses RLS for the actual send path.
