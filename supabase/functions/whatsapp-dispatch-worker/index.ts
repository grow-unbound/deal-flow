// supabase/functions/whatsapp-dispatch-worker/index.ts
//
// WhatsApp send dispatch worker — completes the pipeline after
// app.process_whatsapp_send_queue() runs guardrails + debit.
// Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §5

import { createClient } from 'npm:@supabase/supabase-js@2';
import { whatsAppClient, WhatsAppConfigError } from '../_shared/whatsapp-client.ts';

const BATCH_LIMIT = 20;

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function verifySecret(req: Request): boolean {
  const secret = Deno.env.get('INTEGRATIONS_PUSH_SECRET')?.trim()
    ?? Deno.env.get('INTEGRATIONS_DISPATCH_SECRET')?.trim();
  if (!secret) return Deno.env.get('DENO_ENV') !== 'production';
  const provided = req.headers.get('x-push-secret')?.trim() ?? '';
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

interface SendPayload {
  meta_template_name: string;
  locale: string;
  body_params: Array<{ text: string; parameter_name?: string }>;
  button_params?: Array<{ type: 'url'; index: string; text: string }>;
}

interface QueueRow {
  id: string;
  whatsapp_message_id: string;
}

interface MessageRow {
  id: string;
  recipient_phone: string;
  send_payload: SendPayload;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function runPacingWorker(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { error } = await admin.schema('app').rpc('process_whatsapp_send_queue');
  if (error) {
    console.error('[whatsapp-dispatch-worker] process_whatsapp_send_queue failed:', error.message);
  }
}

async function dispatchProcessingRows(admin: ReturnType<typeof createAdminClient>): Promise<{
  dispatched: number;
  failed: number;
}> {
  if (!whatsAppClient.isConfigured()) {
    console.warn('[whatsapp-dispatch-worker] WhatsApp credentials not configured — skipping Meta dispatch');
    return { dispatched: 0, failed: 0 };
  }

  const { data: queueRows, error: queueError } = await admin
    .schema('app')
    .from('whatsapp_send_queue')
    .select('id, whatsapp_message_id')
    .eq('status', 'processing')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (queueError || !queueRows?.length) {
    if (queueError) {
      console.error('[whatsapp-dispatch-worker] failed to load processing queue:', queueError.message);
    }
    return { dispatched: 0, failed: 0 };
  }

  let dispatched = 0;
  let failed = 0;

  for (const queueRow of queueRows as QueueRow[]) {
    const { data: message, error: messageError } = await admin
      .schema('app')
      .from('whatsapp_messages')
      .select('id, recipient_phone, send_payload')
      .eq('id', queueRow.whatsapp_message_id)
      .maybeSingle();

    if (messageError || !message) {
      await markFailed(admin, queueRow.id, queueRow.whatsapp_message_id, 'message row not found');
      failed += 1;
      continue;
    }

    const msg = message as MessageRow;
    const payload = msg.send_payload;
    if (!payload?.meta_template_name) {
      await markFailed(admin, queueRow.id, msg.id, 'missing send_payload');
      failed += 1;
      continue;
    }

    try {
      const result = await whatsAppClient.sendTemplate({
        to: msg.recipient_phone,
        templateName: payload.meta_template_name,
        locale: payload.locale,
        bodyParams: (payload.body_params ?? []).map((p) => ({
          text: p.text,
          parameterName: p.parameter_name,
        })),
        buttonParams: payload.button_params?.map((b) => ({
          type: 'url' as const,
          index: b.index,
          text: b.text,
        })),
      });

      const now = new Date().toISOString();
      await admin
        .schema('app')
        .from('whatsapp_messages')
        .update({
          status: 'sent',
          provider_message_id: result.providerMessageId,
          sent_at: now,
        })
        .eq('id', msg.id);

      await admin
        .schema('app')
        .from('whatsapp_send_queue')
        .update({ status: 'sent' })
        .eq('id', queueRow.id);

      dispatched += 1;
    } catch (err) {
      const reason = err instanceof WhatsAppConfigError
        ? 'WhatsApp credentials not configured'
        : err instanceof Error ? err.message : String(err);
      await markFailed(admin, queueRow.id, msg.id, reason);
      failed += 1;
    }
  }

  return { dispatched, failed };
}

async function markFailed(
  admin: ReturnType<typeof createAdminClient>,
  queueId: string,
  messageId: string,
  reason: string,
): Promise<void> {
  await admin
    .schema('app')
    .from('whatsapp_send_queue')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', queueId);

  await admin
    .schema('app')
    .from('whatsapp_messages')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', messageId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!verifySecret(req)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const admin = createAdminClient();
    await runPacingWorker(admin);
    const result = await dispatchProcessingRows(admin);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error('[whatsapp-dispatch-worker] unexpected error:', err);
    return json({ error: 'internal_error' }, 500);
  }
});
