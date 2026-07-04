-- WhatsApp Broadcast — Phase F: pacing worker + guardrails
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.7, §5, §7.1-7.5
-- Plan: read-claude-outputs-dealflow-dealflow-wh-resilient-volcano.md (Phase F section)
--
-- This is the final phase: it introduces the priority send queue, the
-- per-tenant daily broadcast cap, a single-row platform kill-switch /
-- quality-rating config, the pg_cron pacing worker
-- (app.process_whatsapp_send_queue), and the template-approval hygiene
-- check. It does NOT poll Meta's quality rating automatically — that
-- requires live Meta credentials this environment doesn't have, so
-- quality_rating_state stays a manually-settable admin field for now
-- (follow-up: wire an hourly poller once Meta creds are live, per §7.3).

-- ── app.tenant_broadcast_limits ──────────────────────────────────────────────
CREATE TABLE app.tenant_broadcast_limits (
  tenant_id uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE RESTRICT,
  daily_broadcast_cap integer NOT NULL DEFAULT 100,
  plan_tier_source text, -- 'starter'|'growth'|'scale'|'custom'

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE TRIGGER tenant_broadcast_limits_updated_at
  BEFORE UPDATE ON app.tenant_broadcast_limits
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.tenant_broadcast_limits ENABLE ROW LEVEL SECURITY;

-- Sellers can see their own cap (used by the daily-cap meter, §6); no
-- INSERT/UPDATE policy for regular roles — cap changes are a platform-admin
-- (service-role) action, same posture as app.whatsapp_rate_card.
CREATE POLICY tenant_broadcast_limits_select ON app.tenant_broadcast_limits
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ── app.whatsapp_send_queue ──────────────────────────────────────────────────
CREATE TABLE app.whatsapp_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  whatsapp_message_id uuid NOT NULL REFERENCES app.whatsapp_messages(id) ON DELETE RESTRICT,

  priority integer NOT NULL DEFAULT 5, -- 1 = OTP/transactional (highest), 5 = broadcast (lowest)
  scheduled_send_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer DEFAULT 0,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  failure_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

-- The worker's core pull query is "next pending rows, ordered by priority
-- then schedule time" — index that shape directly.
CREATE INDEX idx_whatsapp_send_queue_pending_priority
  ON app.whatsapp_send_queue (priority, scheduled_send_at)
  WHERE status = 'pending';

CREATE INDEX idx_whatsapp_send_queue_tenant_status
  ON app.whatsapp_send_queue (tenant_id, status);

CREATE TRIGGER whatsapp_send_queue_updated_at
  BEFORE UPDATE ON app.whatsapp_send_queue
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_send_queue ENABLE ROW LEVEL SECURITY;

-- Queue internals are platform-infra, not tenant-facing data — no
-- seller/buyer SELECT policy. Only service_role (bypasses RLS, used by the
-- ledger-writer enqueue hook and the SECURITY DEFINER worker function below)
-- touches this table.

-- ── app.whatsapp_platform_config — single-row kill switch + quality state ──
-- id uses a CHECK (id = 1) integer PK, which is structurally simpler than a
-- boolean-PK trick and just as effective at forbidding a second row.
CREATE TABLE app.whatsapp_platform_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  broadcast_sending_paused boolean NOT NULL DEFAULT false,
  quality_rating_state text NOT NULL DEFAULT 'green'
    CHECK (quality_rating_state IN ('green', 'yellow', 'red')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE TRIGGER whatsapp_platform_config_updated_at
  BEFORE UPDATE ON app.whatsapp_platform_config
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_platform_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated seller can read the kill-switch/quality state so the
-- composer banner (§7.3) can render tenant-facing copy — this is
-- platform-admin infra, but the *state* (paused or not, green/yellow/red)
-- needs to reach the tenant UI, so SELECT is intentionally broader than the
-- INSERT/UPDATE posture below. No buyer policy — buyers never see this.
CREATE POLICY whatsapp_platform_config_select ON app.whatsapp_platform_config
  FOR SELECT USING (app.is_seller());

-- INSERT/UPDATE are service-role only (platform-admin action, e.g. flipping
-- the kill switch or the quality-rating state) — no policy for authenticated
-- roles at all, matching app.whatsapp_rate_card's internal-only write posture.

INSERT INTO app.whatsapp_platform_config (id) VALUES (1);

-- =============================================================================
-- app.process_whatsapp_send_queue() — the pacing worker (§5, §7.1-7.5)
--
-- Correctness properties, in order, matching the spec's guardrail list:
--   1. Kill switch / Red-state check is FIRST and only ever blocks
--      priority=5 (broadcast) rows — priority=1 (transactional) always flows,
--      per §7.3's explicit correction ("transactional sends are NOT paused").
--   2. Pulls pending rows ordered by priority ASC, scheduled_send_at ASC —
--      OTP/transactional always pops before broadcast (§7.1).
--   3. Per-tenant daily_broadcast_cap remaining is enforced per broadcast-
--      priority row (joins app.tenant_broadcast_limits, counts today's sent
--      broadcast-priority messages for that tenant).
--   4. Per-recipient 24h marketing cap: skip if that buyer already received
--      a meta_category='marketing' message today, across ANY tenant (Meta's
--      cap is per-user platform-wide, §7.2/§7.4).
--   5. Template hygiene (§7.4): if the message is tied to a
--      whatsapp_template_id, its approval_status must be 'approved' or the
--      row fails with a clear failure_reason — this was meant to be a
--      Phase E pre-flight check too (§7.2); Phase E's composer route does
--      not yet check it (confirmed by reading app/api/whatsapp/broadcasts/
--      route.ts — it only checks the template exists/is accessible, not its
--      approval_status), so this phase owns enforcing it at send time.
--   6. Wallet balance: calls app.debit_whatsapp_credits — if it raises
--      (insufficient balance), that row is marked 'failed' and the loop
--      continues to the next row rather than crashing the whole batch.
--   7. Actual Meta dispatch is intentionally NOT done inside this SQL
--      function — Meta Cloud API calls happen over HTTP from application
--      code (WhatsAppClient in src/lib/server/whatsapp-client.ts), not from
--      Postgres. This function does the pre-flight/guardrail/debit work and
--      marks rows 'processing' -> ready for an application-side worker (a
--      thin polling job or edge function) to actually call
--      WhatsAppClient.send() and report back sent/failed. This keeps the
--      correctness-critical guardrail logic in one auditable SQL function
--      (this phase's stated priority) without requiring net.http_post calls
--      out of Postgres for a still-unconfigured Meta integration.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.process_whatsapp_send_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_config app.whatsapp_platform_config%ROWTYPE;
  v_queue_row app.whatsapp_send_queue%ROWTYPE;
  v_message app.whatsapp_messages%ROWTYPE;
  v_cap integer;
  v_sent_today integer;
  v_marketing_today integer;
  v_template_status text;
BEGIN
  SELECT * INTO v_config
  FROM app.whatsapp_platform_config
  WHERE id = 1;

  -- Cursor over pending rows, priority first (1 = transactional highest),
  -- then earliest-scheduled first. FOR UPDATE SKIP LOCKED so overlapping
  -- worker invocations (e.g. a slow run still finishing when the next
  -- 1-5 min cron tick fires) never block on each other or double-process
  -- the same row.
  FOR v_queue_row IN
    SELECT *
    FROM app.whatsapp_send_queue
    WHERE status = 'pending'
      AND scheduled_send_at <= now()
    ORDER BY priority ASC, scheduled_send_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 1. Kill switch / Red state — blocks broadcast-priority rows only.
    --    Transactional (priority=1) rows always flow regardless of pause
    --    state or quality_rating_state, per §7.3's explicit correction.
    IF v_queue_row.priority > 1
       AND (v_config.broadcast_sending_paused OR v_config.quality_rating_state = 'red')
    THEN
      CONTINUE; -- leave row pending, retried on a later tick once cleared
    END IF;

    SELECT * INTO v_message
    FROM app.whatsapp_messages
    WHERE id = v_queue_row.whatsapp_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'failed', failure_reason = 'whatsapp_message row not found', attempt_count = attempt_count + 1
      WHERE id = v_queue_row.id;
      CONTINUE;
    END IF;

    -- 2. Template hygiene (§7.4): never dispatch against an unapproved
    --    template. Messages with no template attached (e.g. ad-hoc OTP
    --    sends that don't reference app.whatsapp_templates) skip this check.
    IF v_message.whatsapp_template_id IS NOT NULL THEN
      SELECT approval_status INTO v_template_status
      FROM app.whatsapp_templates
      WHERE id = v_message.whatsapp_template_id;

      IF v_template_status IS DISTINCT FROM 'approved' THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = format('template not approved (status=%s)', COALESCE(v_template_status, 'unknown')),
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = format('template not approved (status=%s)', COALESCE(v_template_status, 'unknown'))
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- 3. Per-tenant daily broadcast cap (broadcast-priority rows only —
    --    transactional sends never count against or are blocked by this cap).
    IF v_queue_row.priority > 1 THEN
      SELECT daily_broadcast_cap INTO v_cap
      FROM app.tenant_broadcast_limits
      WHERE tenant_id = v_queue_row.tenant_id;

      -- No explicit limits row yet for this tenant: fall back to the same
      -- default the table itself declares, so an unconfigured tenant is
      -- still bounded rather than uncapped.
      v_cap := COALESCE(v_cap, 100);

      SELECT count(*) INTO v_sent_today
      FROM app.whatsapp_messages m
      JOIN app.whatsapp_send_queue q ON q.whatsapp_message_id = m.id
      WHERE m.tenant_id = v_queue_row.tenant_id
        AND q.priority > 1
        AND m.status = 'sent'
        AND m.sent_at >= date_trunc('day', now());

      IF v_sent_today >= v_cap THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = format('tenant daily broadcast cap reached (%s/%s)', v_sent_today, v_cap),
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = format('tenant daily broadcast cap reached (%s/%s)', v_sent_today, v_cap)
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- 4. Per-recipient 24h marketing cap — Meta's cap is per-user
    --    platform-wide, not per-tenant (§7.2), so this checks across ALL
    --    tenants for this buyer/category, not just the current one.
    IF v_message.meta_category = 'marketing' AND v_message.buyer_id IS NOT NULL THEN
      SELECT count(*) INTO v_marketing_today
      FROM app.whatsapp_messages m
      WHERE m.buyer_id = v_message.buyer_id
        AND m.meta_category = 'marketing'
        AND m.status IN ('sent', 'delivered', 'read')
        AND m.sent_at >= now() - interval '24 hours';

      IF v_marketing_today >= 1 THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed',
            failure_reason = 'recipient already received a marketing message in the last 24h',
            attempt_count = attempt_count + 1
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed',
            failure_reason = 'recipient already received a marketing message in the last 24h'
        WHERE id = v_message.id;

        CONTINUE;
      END IF;
    END IF;

    -- Mark processing before the wallet debit so a crash mid-loop doesn't
    -- leave a row silently 'pending' forever without a trace of the attempt.
    UPDATE app.whatsapp_send_queue
    SET status = 'processing', attempt_count = attempt_count + 1
    WHERE id = v_queue_row.id;

    -- 5. Wallet balance — re-checked at pop time via the same synchronous
    --    debit RPC Phase B built. If it raises (insufficient balance), this
    --    row fails and the loop MUST continue to the next row rather than
    --    letting the exception propagate and abort the whole batch.
    BEGIN
      PERFORM app.debit_whatsapp_credits(v_message.id);
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE app.whatsapp_send_queue
        SET status = 'failed', failure_reason = format('credit debit failed: %s', SQLERRM)
        WHERE id = v_queue_row.id;

        UPDATE app.whatsapp_messages
        SET status = 'failed', failure_reason = format('credit debit failed: %s', SQLERRM)
        WHERE id = v_message.id;

        CONTINUE;
    END;

    -- 6. Actual Meta dispatch happens in application code (WhatsAppClient),
    --    not here — see function comment above. This function's job ends
    --    at "guardrails passed, credits debited, row is ready to send";
    --    it leaves the row 'processing' for the application-side sender to
    --    pick up and finalize to 'sent'/'failed' after the real HTTP call.
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION app.process_whatsapp_send_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.process_whatsapp_send_queue() TO service_role;

-- ── pg_cron registration — mirrors 20260624102000_zoho_daily_sync_cron.sql ──
-- Runs every 2 minutes (within the spec's 1-5 min window).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-send-queue-pacing') THEN
      PERFORM cron.schedule(
        'whatsapp-send-queue-pacing',
        '*/2 * * * *',
        'SELECT app.process_whatsapp_send_queue();'
      );
    END IF;
  END IF;
END;
$$;
