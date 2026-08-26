// supabase/functions/whatsapp-dispatch-worker/index.ts
//
// WhatsApp synchronous sender. Callers enqueue durable message rows, then POST
// explicit message_ids here. The DB prepares each message under lock
// (guardrails + debit), this function calls Meta, then completes the row.
// Only handles the ids it's given — anything beyond MAX_MESSAGE_IDS per
// request is picked up by whatsapp-queue-sweep-worker's cron sweep instead
// of being silently dropped.
// Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §5

import { createAdminClient, dispatchMessageIds } from '../_shared/whatsapp-dispatch.ts';

const MAX_MESSAGE_IDS = 50;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readMessageIds(req: Request): Promise<string[]> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return [];
  }

  const ids = (body as { message_ids?: unknown; message_id?: unknown } | null)?.message_ids;
  const single = (body as { message_ids?: unknown; message_id?: unknown } | null)?.message_id;
  const raw = Array.isArray(ids) ? ids : single ? [single] : [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
    .slice(0, MAX_MESSAGE_IDS);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const messageIds = await readMessageIds(req);
    if (messageIds.length === 0) {
      return json({ error: 'message_ids required' }, 400);
    }

    const admin = createAdminClient();
    const result = await dispatchMessageIds(admin, messageIds);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error('[whatsapp-dispatch-worker] unexpected error:', err);
    return json({ error: 'internal_error' }, 500);
  }
});
