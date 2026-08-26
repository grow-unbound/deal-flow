-- WhatsApp broadcast dispatch only ever attempts the first 50 recipients of
-- any broadcast: POST /api/whatsapp/broadcasts calls triggerWhatsAppDispatch
-- with every message id, but whatsapp-dispatch-worker's readMessageIds()
-- silently truncates to MAX_MESSAGE_IDS=50. Nothing ever revisits the queue
-- afterward — process_whatsapp_send_queue() is dead code (confirmed: no
-- cron.schedule for it exists anywhere; it was superseded by
-- 20260713055448_synchronous-whatsapp-dispatch.sql's synchronous per-message
-- model and never replaced with a sweep). Beyond the first 50, recipients of
-- any broadcast silently sit as 'pending' rows forever.
--
-- Fix: whatsapp-queue-sweep-worker (shares dispatchMessageIds() with
-- whatsapp-dispatch-worker via supabase/functions/_shared/whatsapp-dispatch.ts
-- — not a new pipeline), triggered two ways:
--   1. Event-triggered, the common case: src/lib/server/whatsapp-enqueue.ts's
--      triggerWhatsAppQueueSweepSoon() fires it once, immediately, right
--      after a broadcast is created with more than one dispatch batch worth
--      of recipients. No polling involved — mirrors this codebase's own
--      established pattern for this exact problem (see
--      20260712093040_whatsapp_queue_insert_dispatch_trigger.sql: an
--      INSERT trigger fires the dispatch worker event-driven, with cron
--      only as a rare backstop; that design was later replaced by
--      synchronous in-request dispatch entirely). A tight poll here would
--      repeat a mistake this codebase already moved away from twice.
--   2. A once-daily cron backstop (03:35 UTC = ~9:05am IST), matching this
--      codebase's existing once-daily cron convention (reco-popularity-daily,
--      zoho-daily-incremental, kpi-buyers-daily-freshness) rather than the
--      continuous-refresh-tick pattern (membership/metrics) — the only thing
--      this backstop serves is rows deferred to the next day by the daily
--      broadcast cap (app.prepare_whatsapp_message_for_send, rescheduled to
--      ~9am IST — see 20260825004617_whatsapp_cap_deferral_not_failure.sql),
--      which is itself a fixed once-a-day event, not a continuous stream.
--      A tighter cadence (an earlier version of this migration used 15
--      minutes) has nothing to poll for in between — the underlying query is
--      a single indexed SELECT, cheap either way, but daily is the frequency
--      the actual need calls for, not more.

CREATE OR REPLACE FUNCTION app.next_pending_whatsapp_message_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (whatsapp_message_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
  SELECT whatsapp_message_id
  FROM app.whatsapp_send_queue
  WHERE status = 'pending'
    AND scheduled_send_at <= now()
  ORDER BY priority ASC, scheduled_send_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION app.next_pending_whatsapp_message_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.next_pending_whatsapp_message_batch(integer) TO service_role;

CREATE OR REPLACE FUNCTION app.ensure_whatsapp_queue_sweep_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Unschedule-then-reschedule rather than "skip if already registered", so
  -- this stays idempotent even when re-run after the interval below changes
  -- (e.g. this migration's own 2-minute -> 15-minute correction).
  BEGIN
    PERFORM cron.unschedule('whatsapp-queue-sweep');
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- job may not exist yet; not an error
  END;

  PERFORM cron.schedule(
    'whatsapp-queue-sweep',
    '35 3 * * *',
    $sql$SELECT net.http_post(
      url := app.get_functions_base_url() || '/whatsapp-queue-sweep-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', COALESCE(current_setting('app.integrations_dispatch_secret', true), '')
      ),
      body := jsonb_build_object('trigger', 'cron_sweep')
    )$sql$
  );
END;
$$;

REVOKE ALL ON FUNCTION app.ensure_whatsapp_queue_sweep_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_whatsapp_queue_sweep_cron_scheduled() TO service_role;

SELECT app.ensure_whatsapp_queue_sweep_cron_scheduled();
