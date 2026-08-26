// supabase/functions/whatsapp-queue-sweep-worker/index.ts
//
// Drains app.whatsapp_send_queue rows that whatsapp-dispatch-worker's
// initial synchronous call never reached — either because a broadcast had
// more than MAX_MESSAGE_IDS recipients, or because a row was deferred to a
// later scheduled_send_at (e.g. the daily broadcast cap, see
// app.prepare_whatsapp_message_for_send). Uses the exact same
// dispatchMessageIds() as whatsapp-dispatch-worker — same guardrails, same
// Meta call, same completion logic.
//
// Two callers, matching this codebase's established event-driven-over-
// polling pattern (see 20260712093040_whatsapp_queue_insert_dispatch_trigger.sql):
// (1) triggered directly, once, right after a broadcast is created with more
// than one dispatch batch worth of recipients — this is the common case and
// needs no cron at all; (2) a once-daily cron backstop
// (app.ensure_whatsapp_queue_sweep_cron_scheduled, 03:35 UTC ≈ 9:05am IST)
// that only matters for next-day cap-deferred rows or a lost trigger call —
// that's a fixed once-a-day event, not a continuous stream, so daily is the
// frequency the actual need calls for. Looping internally here means a
// single invocation can drain an entire broadcast's overflow instead of
// needing repeated ticks.

import { createAdminClient, dispatchMessageIds } from '../_shared/whatsapp-dispatch.ts';

const SWEEP_BATCH_SIZE = 50;
// Bounds one invocation's work so a pathological backlog can't run forever
// in a single request — the once-daily cron backstop picks up anything left
// over the next day. 20 batches * 50 = 1000 messages per invocation.
const MAX_BATCHES_PER_INVOCATION = 20;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const admin = createAdminClient();

    let dispatched = 0;
    let failed = 0;
    let skipped = 0;
    let batches = 0;

    while (batches < MAX_BATCHES_PER_INVOCATION) {
      const { data: batch, error: batchError } = await admin
        .schema('app')
        .rpc('next_pending_whatsapp_message_batch', { p_limit: SWEEP_BATCH_SIZE });

      if (batchError) {
        console.error('[whatsapp-queue-sweep-worker] failed to load pending batch:', batchError.message);
        return json({ error: 'internal_error', dispatched, failed, skipped }, 500);
      }

      const messageIds = ((batch ?? []) as Array<{ whatsapp_message_id: string }>)
        .map((row) => row.whatsapp_message_id);

      if (messageIds.length === 0) break;

      const result = await dispatchMessageIds(admin, messageIds);
      dispatched += result.dispatched;
      failed += result.failed;
      skipped += result.skipped;
      batches += 1;

      // Anything left was skipped/deferred (e.g. daily cap hit, scheduled
      // for later) rather than dispatched — no point spinning further in
      // this invocation since the next batch would be the same rows.
      if (result.dispatched === 0) break;
    }

    return json({ ok: true, dispatched, failed, skipped, batches });
  } catch (err) {
    console.error('[whatsapp-queue-sweep-worker] unexpected error:', err);
    return json({ error: 'internal_error' }, 500);
  }
});
