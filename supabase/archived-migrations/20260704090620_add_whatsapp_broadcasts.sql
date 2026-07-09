-- WhatsApp Broadcast — Phase E: broadcast job table + audience targeting RPCs
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.2, §4.4, §4.5, §7.2
-- Plan: read-claude-outputs-dealflow-dealflow-wh-resilient-volcano.md (Phase E section)
--
-- Corrected vs raw spec text: linked_campaign_id references app.campaigns(id)
-- (renamed from app.published_catalogs in 20260625142539_*), not
-- published_catalogs. app.buyers.payment_terms_days (not net_payment_days).
-- app.invoices has total_amount/outstanding_balance/status/invoice_date, no
-- amount_paid/due_date column.
--
-- This phase creates the broadcast job row + 6 audience-resolution RPCs
-- (one per target_type). It does NOT implement the pacing worker, send
-- queue, or actual Meta dispatch — those are Phase F. No broadcast created
-- here ever transitions past 'draft'/'scheduled'/'pending_review'.

-- ── app.whatsapp_broadcasts ─────────────────────────────────────────────────
CREATE TABLE app.whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,

  name text NOT NULL,
  whatsapp_template_id uuid REFERENCES app.whatsapp_templates(id) ON DELETE RESTRICT,
  use_case text NOT NULL,

  target_type text NOT NULL CHECK (target_type IN (
    'cohort', 'buyer_selection', 'geography_filter', 'dormant_filter', 'dues_filter', 'all_buyers'
  )),
  target_cohort_id uuid NULL REFERENCES app.cohorts(id) ON DELETE RESTRICT,
  target_filter jsonb NULL,
  target_buyer_ids uuid[] NULL,

  -- Corrected FK target: app.campaigns, not app.published_catalogs.
  linked_campaign_id uuid NULL REFERENCES app.campaigns(id) ON DELETE SET NULL,

  variable_bindings jsonb NOT NULL DEFAULT '{}',

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_review', 'scheduled', 'sending', 'completed', 'partially_failed', 'cancelled'
  )),
  scheduled_for timestamptz NULL,

  estimated_recipient_count integer,
  actual_recipient_count integer,
  daily_cap_at_creation integer,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX idx_whatsapp_broadcasts_tenant_id ON app.whatsapp_broadcasts (tenant_id);
CREATE INDEX idx_whatsapp_broadcasts_tenant_status ON app.whatsapp_broadcasts (tenant_id, status);
CREATE INDEX idx_whatsapp_broadcasts_tenant_created ON app.whatsapp_broadcasts (tenant_id, created_at DESC);

CREATE TRIGGER whatsapp_broadcasts_updated_at
  BEFORE UPDATE ON app.whatsapp_broadcasts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;

-- RBAC (spec §8): both seller roles can read; only seller_admin can write.
-- Enforced here at RLS (belt) — API route layer re-checks role before
-- ever reaching this table (suspenders, see app/api/whatsapp/broadcasts/route.ts).
CREATE POLICY whatsapp_broadcasts_select ON app.whatsapp_broadcasts
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY whatsapp_broadcasts_insert ON app.whatsapp_broadcasts
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY whatsapp_broadcasts_update ON app.whatsapp_broadcasts
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- No buyer policy at all — buyers must never see broadcast rows.

-- ── FK from Phase A ledger, deferred until this table existed ───────────────
ALTER TABLE app.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_whatsapp_broadcast_id_fkey
  FOREIGN KEY (whatsapp_broadcast_id) REFERENCES app.whatsapp_broadcasts(id);

-- =============================================================================
-- Audience targeting RPCs — one per target_type (§4.4, §4.5, §7.2)
--
-- Every RPC returns SETOF uuid (buyer_id) and hard-filters
-- whatsapp_opt_out_at IS NOT NULL (Phase C) and deleted_at IS NOT NULL — this
-- is not optional per spec §7.2, applied identically in every mode so a
-- broadcast composer preview and the (future, Phase F) send-time re-check
-- share one definition of "eligible audience".
--
-- SECURITY DEFINER + SET search_path per app.debit_whatsapp_credits pattern
-- (20260704080500_add_whatsapp_wallet_billing.sql). tenant_id is always an
-- explicit parameter (never inferred from JWT inside the function) so the
-- API-route caller controls tenant scoping — the route itself re-verifies
-- the caller's JWT tenant_id matches p_tenant_id before invoking these.
-- =============================================================================

-- ── cohort ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_cohort(
  p_tenant_id uuid,
  p_cohort_id uuid
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.cohort_members cm ON cm.buyer_id = b.id
  JOIN app.cohorts c ON c.id = cm.cohort_id
  WHERE c.id = p_cohort_id
    AND c.tenant_id = p_tenant_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL;
$$;

-- ── buyer_selection (manual) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_buyer_selection(
  p_tenant_id uuid,
  p_buyer_ids uuid[]
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.id = ANY (COALESCE(p_buyer_ids, ARRAY[]::uuid[]))
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL;
$$;

-- ── geography_filter ─────────────────────────────────────────────────────
-- p_filter shape: {"city": "Nashik"} | {"state": "..."} | {"pincode": "..."} | {"zone": "..."}
-- Any key present in the filter must match (AND across provided keys).
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_geography(
  p_tenant_id uuid,
  p_filter jsonb
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND (p_filter->>'city' IS NULL OR b.geography->>'city' = p_filter->>'city')
    AND (p_filter->>'state' IS NULL OR b.geography->>'state' = p_filter->>'state')
    AND (p_filter->>'pincode' IS NULL OR b.geography->>'pincode' = p_filter->>'pincode')
    AND (p_filter->>'zone' IS NULL OR b.geography->>'zone' = p_filter->>'zone');
$$;

-- ── dormant_filter ───────────────────────────────────────────────────────
-- p_filter shape: {"dormant_days_gt": 45}. A buyer is "dormant" if their most
-- recent app.orders.placed_at is older than the threshold, OR they have never
-- placed an order at all (NULL last order = maximally dormant).
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_dormant(
  p_tenant_id uuid,
  p_filter jsonb
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  WITH last_order AS (
    SELECT o.buyer_id, MAX(o.placed_at) AS last_placed_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
    GROUP BY o.buyer_id
  )
  SELECT b.id AS buyer_id
  FROM app.buyers b
  LEFT JOIN last_order lo ON lo.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND (
      lo.last_placed_at IS NULL
      OR lo.last_placed_at < now() - make_interval(days => COALESCE((p_filter->>'dormant_days_gt')::integer, 45))
    );
$$;

-- ── dues_filter ──────────────────────────────────────────────────────────
-- Exact query from spec §4.4, corrected column names (payment_terms_days,
-- outstanding_balance, invoice_date — no amount_paid/due_date/net_payment_days).
-- Also corrected against app.invoices' current status CHECK constraint
-- (20260625103236_zoho_transactional_sync_alignment.sql widened it from the
-- original draft/issued/partially_paid/paid/void to include Zoho-derived
-- statuses) — 'issued' no longer exists as a value, so the "has an open,
-- overdue balance" set here is sent/unpaid/partially_paid/overdue/viewed.
-- Optional p_filter {"overdue_days_gt": N} tightens the overdue threshold
-- beyond the base payment-terms computation.
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_dues(
  p_tenant_id uuid,
  p_filter jsonb DEFAULT NULL
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT DISTINCT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.invoices i ON i.buyer_id = b.id AND i.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant_id
    AND i.status IN ('sent', 'unpaid', 'partially_paid', 'overdue', 'viewed')
    AND i.outstanding_balance > 0
    AND i.invoice_date + (b.payment_terms_days || ' days')::interval < now()
    AND (
      p_filter IS NULL OR p_filter->>'overdue_days_gt' IS NULL
      OR i.invoice_date + (b.payment_terms_days || ' days')::interval
           < now() - make_interval(days => (p_filter->>'overdue_days_gt')::integer)
    )
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL;
$$;

-- ── all_buyers ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_all(
  p_tenant_id uuid
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL;
$$;

REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_cohort(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_buyer_selection(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_geography(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_dormant(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_dues(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_broadcast_audience_all(uuid) FROM PUBLIC;

-- authenticated (not just service_role) needs EXECUTE — these RPCs are
-- called from Next.js API routes using the caller's session (RLS-scoped
-- reads are fine since they're SECURITY DEFINER and tenant_id is always
-- explicit/verified at the route layer, matching the debit RPC's grant
-- pattern of "trusted server-side caller, not raw client access").
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_cohort(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_buyer_selection(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_geography(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_dormant(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_dues(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.resolve_broadcast_audience_all(uuid) TO authenticated, service_role;
