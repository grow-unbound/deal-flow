-- Mark integration_webhook_events in 'received' status older than 2 hours as
-- 'failed'. These are permanently orphaned: the edge function died (HTTP 546
-- wall-clock timeout) after creating the placeholder but before updating its
-- status, so no automatic cleanup ever runs.
--
-- Zoho already retried events that received a 5xx — those retries will
-- succeed once the handler is patched. The rows here only need their status
-- corrected so dashboards do not count them as in-flight work.
UPDATE app.integration_webhook_events
SET
  processing_status = 'failed',
  processed_at      = now(),
  runtime_meta      = jsonb_set(
    coalesce(runtime_meta, '{}'),
    '{error}',
    '"orphaned_by_function_timeout: placeholder created but edge function timed out (HTTP 546) before status update"'
  )
WHERE
  processing_status = 'received'
  AND created_at < now() - interval '2 hours';
