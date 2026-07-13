-- Replace the app-code fire-and-forget triggerWhatsAppDispatch() fetch (called
-- from every enqueueWhatsappTemplate call-site — order/estimate notify fans
-- out to buyer+seller, so a single transaction already fires it twice) with a
-- single DB trigger that fires exactly once per queue-row insert (or
-- reset-to-pending), matching real traffic: queue fills only on buyer login
-- and order/estimate activity (~50-100/day), not a standing poll.
--
-- Scoped to priority=1 (transactional: otp_login/order_placed/enquiry_-
-- received/dispatch_notice) only. Priority-5 (broadcast/marketing) rows are
-- inserted in bulk by the broadcast routes, which already call
-- triggerWhatsAppDispatch() ONCE after the whole recipient loop — a per-row
-- trigger would fire the dispatch worker once per recipient in a broadcast of
-- hundreds/thousands. Those rows are still covered by the backstop cron below.
--
-- Uses the same net.http_post-from-plpgsql pattern already proven in
-- app.tick_sync_coordinator / app.run_zoho_orchestrator_cron.

CREATE OR REPLACE FUNCTION app.notify_whatsapp_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
DECLARE
  v_base_url text := app.get_functions_base_url();
  -- whatsapp-dispatch-worker checks x-push-secret against
  -- INTEGRATIONS_PUSH_SECRET ?? INTEGRATIONS_DISPATCH_SECRET; this setting
  -- already carries that same secret for the sync-side dispatch calls.
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
BEGIN
  PERFORM net.http_post(
    url := v_base_url || '/whatsapp-dispatch-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('trigger', 'queue_row_armed')
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.notify_whatsapp_dispatch() FROM PUBLIC;
GRANT ALL ON FUNCTION app.notify_whatsapp_dispatch() TO service_role;

DROP TRIGGER IF EXISTS whatsapp_send_queue_dispatch_trigger ON app.whatsapp_send_queue;

CREATE TRIGGER whatsapp_send_queue_dispatch_trigger
AFTER INSERT OR UPDATE OF status ON app.whatsapp_send_queue
FOR EACH ROW
WHEN (NEW.status = 'pending' AND NEW.priority = 1)
EXECUTE FUNCTION app.notify_whatsapp_dispatch();

-- Low-frequency safety net only — nothing previously polled this queue on a
-- schedule (confirmed: no cron.schedule for process_whatsapp_send_queue
-- existed anywhere), so this is new insurance against a lost/failed
-- net.http_post from the trigger above (e.g. a transient network blip),
-- not a replacement for a prior standing poll.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-dispatch-backstop') THEN
      PERFORM cron.schedule(
        'whatsapp-dispatch-backstop',
        '*/10 * * * *',
        $sql$SELECT net.http_post(
          url := app.get_functions_base_url() || '/whatsapp-dispatch-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', COALESCE(current_setting('app.integrations_dispatch_secret', true), '')
          ),
          body := jsonb_build_object('trigger', 'cron_backstop')
        )$sql$
      );
    END IF;
  END IF;
END;
$$;
