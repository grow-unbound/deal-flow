// supabase/functions/whatsapp-dispatch-worker/index.ts
//
// WhatsApp synchronous sender. Callers enqueue durable message rows, then POST
// explicit message_ids here. The DB prepares each message under lock
// (guardrails + debit), this function calls Meta, then completes the row.
// Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §5

import { createClient } from 'npm:@supabase/supabase-js@2';
import { whatsAppClient, WhatsAppConfigError } from '../_shared/whatsapp-client.ts';

const MAX_MESSAGE_IDS = 50;

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface SendPayload {
  meta_template_name: string;
  locale: string;
  body_params: Array<{ text: string; parameter_name?: string }>;
  header_params?: { type: 'image'; media_id?: string; link?: string };
  button_params?: Array<{ type: 'url'; index: string; text: string }>;
}

interface PreparedMessage {
  ready?: boolean;
  failed?: boolean;
  skipped?: string;
  message_id?: string;
  queue_id?: string;
  recipient_phone: string;
  send_payload: SendPayload;
  failure_reason?: string;
}

function providerErrorBody(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function dispatchMessageIds(
  admin: ReturnType<typeof createAdminClient>,
  messageIds: string[],
): Promise<{
  dispatched: number;
  failed: number;
  skipped: number;
}> {
  if (!whatsAppClient.isConfigured()) {
    console.warn('[whatsapp-dispatch-worker] WhatsApp credentials not configured — skipping Meta dispatch');
    for (const messageId of messageIds) {
      await completeSend(admin, messageId, false, null, 'WhatsApp credentials not configured');
    }
    return { dispatched: 0, failed: messageIds.length, skipped: 0 };
  }

  let dispatched = 0;
  let failed = 0;
  let skipped = 0;

  for (const messageId of messageIds) {
    const { data: prepared, error: prepareError } = await admin
      .schema('app')
      .rpc('prepare_whatsapp_message_for_send', { p_message_id: messageId });

    if (prepareError) {
      await completeSend(admin, messageId, false, null, `prepare failed: ${prepareError.message}`);
      failed += 1;
      continue;
    }

    const msg = (prepared ?? null) as PreparedMessage | null;
    if (!msg?.ready) {
      console.info('[whatsapp-dispatch-worker] skipped prepared message', {
        messageId,
        failed: msg?.failed ?? false,
        skipped: msg?.skipped ?? null,
        failureReason: msg?.failure_reason ?? null,
      });
      if (msg?.failed) failed += 1;
      else skipped += 1;
      continue;
    }

    const payload = msg.send_payload;
    if (!payload?.meta_template_name) {
      await completeSend(admin, messageId, false, null, 'missing send_payload');
      failed += 1;
      continue;
    }

    try {
      console.info('[whatsapp-dispatch-worker] sending provider message', {
        messageId,
        queueId: msg.queue_id ?? null,
        recipientPhone: msg.recipient_phone,
        metaTemplateName: payload.meta_template_name,
      });
      const result = await whatsAppClient.sendTemplate({
        to: msg.recipient_phone,
        templateName: payload.meta_template_name,
        locale: payload.locale,
        bodyParams: (payload.body_params ?? []).map((p) => ({
          text: p.text,
          parameterName: p.parameter_name,
        })),
        headerParams: payload.header_params?.type === 'image'
          ? {
              type: 'image',
              mediaId: payload.header_params.media_id,
              link: payload.header_params.link,
            }
          : undefined,
        buttonParams: payload.button_params?.map((b) => ({
          type: 'url' as const,
          index: b.index,
          text: b.text,
        })),
      });

      console.info('[whatsapp-dispatch-worker] provider send succeeded', {
        messageId,
        queueId: msg.queue_id ?? null,
        recipientPhone: msg.recipient_phone,
        metaTemplateName: payload.meta_template_name,
        providerMessageId: result.providerMessageId,
      });
      await completeSend(admin, messageId, true, result.providerMessageId, null);
      dispatched += 1;
    } catch (err) {
      const reason = err instanceof WhatsAppConfigError
        ? 'WhatsApp credentials not configured'
        : providerErrorBody(err);
      console.error('[whatsapp-dispatch-worker] provider send failed', {
        messageId,
        queueId: msg.queue_id ?? null,
        recipientPhone: msg.recipient_phone,
        metaTemplateName: payload.meta_template_name,
        providerError: reason,
      });
      await completeSend(admin, messageId, false, null, reason);
      failed += 1;
    }
  }

  return { dispatched, failed, skipped };
}

async function completeSend(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  success: boolean,
  providerMessageId: string | null,
  failureReason: string | null,
): Promise<void> {
  const { error } = await admin
    .schema('app')
    .rpc('complete_whatsapp_message_send', {
      p_message_id: messageId,
      p_success: success,
      p_provider_message_id: providerMessageId,
      p_failure_reason: failureReason,
    });

  if (error) {
    console.error('[whatsapp-dispatch-worker] complete send failed:', error.message);
  }
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
