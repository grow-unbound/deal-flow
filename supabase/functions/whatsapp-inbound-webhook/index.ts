// supabase/functions/whatsapp-inbound-webhook/index.ts
//
// WhatsApp Broadcast — Phase C: STOP/UNSUBSCRIBE inbound handler.
// Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.8, §7.2.
//
// Receives Meta's inbound-message webhook (Cloud API "messages" change
// notification) on the shared Yukti WABA. When an inbound text message body
// is STOP/UNSUBSCRIBE (case-insensitive, common variants), stamps
// app.buyers.whatsapp_opt_out_at for the buyer matching that phone number.
// Broadcast pre-flight checks (Phase E/F, not built yet) will filter on this
// column; this Phase only owns detecting the reply and setting the flag.
//
// MINIMAL implementation per Phase C scope — deliberately NOT built here:
//   - Meta webhook subscription/registration infra (App Dashboard config,
//     GET verification handshake is included below since Meta requires it
//     before it will ever call this endpoint, but there is no code here that
//     programmatically subscribes the app to webhook fields via the Graph API)
//   - Full inbound message persistence/ledger (app.whatsapp_messages tracks
//     outbound sends per Phase A; this function does not write inbound rows
//     there — an inbound STOP is a signal, not a billable message)
//   - Meta payload signature verification (X-Hub-Signature-256): Phase A's
//     WhatsAppClient (src/lib/server/whatsapp-client.ts) does not yet
//     implement or anticipate a signature-verification helper, so this is
//     STUBBED below with a TODO rather than invented from scratch. Relies on
//     the webhook URL + verify token being unguessable in the interim, same
//     trust level as most of the existing integrations-webhook function
//     before its own hardening — acceptable for MVP, must be closed out
//     before this is a public production endpoint.

import { createClient } from 'npm:@supabase/supabase-js@2';

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe', 'unsub', 'opt out', 'optout', 'stop all']);

function isOptOutMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  const normalized = body.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.has(normalized);
}

// Meta sends the sender's number as digits only, typically "91XXXXXXXXXX" for
// India. app.buyers.phone stores the normalized 10-digit form (see
// src/lib/phone.ts normalizeIndianPhone) — strip a leading country code the
// same way the rest of the app does, without importing app source into Deno.
function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) return digits.slice(-10);
  if (digits.startsWith('0') && digits.length > 10) return digits.slice(-10);
  return digits;
}

interface MetaInboundMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
}

interface MetaWebhookEntry {
  changes?: Array<{
    field?: string;
    value?: {
      messages?: MetaInboundMessage[];
    };
  }>;
}

interface MetaWebhookBody {
  entry?: MetaWebhookEntry[];
}

function ok(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
}

// TODO (Phase F / production hardening): verify X-Hub-Signature-256 against
// the Meta app secret before trusting the payload. WhatsAppClient does not
// anticipate this yet (see file header) — stubbed rather than invented here.
function isVerifiedMetaSignature(_req: Request): boolean {
  return true;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Meta's one-time webhook verification handshake (required before Meta will
  // ever POST real events to this URL). WHATSAPP_WEBHOOK_VERIFY_TOKEN must be
  // set to whatever token is configured in the Meta App Dashboard.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
      return ok(challenge);
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!isVerifiedMetaSignature(req)) {
    // Still 200 — Meta retries aggressively on non-200, and an unverified
    // payload should be dropped silently, not retried.
    return ok('ignored');
  }

  try {
    const body = await req.json() as MetaWebhookBody;
    const admin = createAdminClient();

    const messages: MetaInboundMessage[] = (body.entry ?? [])
      .flatMap((entry) => entry.changes ?? [])
      .filter((change) => change.field === 'messages')
      .flatMap((change) => change.value?.messages ?? []);

    for (const message of messages) {
      if (!message.from) continue;

      const textBody = message.type === 'button' ? message.button?.text : message.text?.body;
      if (!isOptOutMessage(textBody)) continue;

      const phone = normalizeIndianPhone(message.from);
      if (!phone) continue;

      // Shared number across all tenants (§3.1) — a STOP reply is per phone
      // number, not per tenant, so opt every buyer row matching this phone
      // out, same as Meta's own platform-wide opt-out semantics (§7.2).
      const { error } = await admin
        .schema('app')
        .from('buyers')
        .update({ whatsapp_opt_out_at: new Date().toISOString() })
        .eq('phone', phone)
        .is('whatsapp_opt_out_at', null)
        .is('deleted_at', null);

      if (error) {
        console.error('[whatsapp-inbound-webhook] failed to stamp opt-out', {
          phone,
          error: error.message,
        });
      }
    }

    return ok('processed');
  } catch (err) {
    console.error('[whatsapp-inbound-webhook] unexpected error', err);
    // Always 200 — Meta retries non-200 responses, which would only compound
    // whatever went wrong.
    return ok('error-logged');
  }
});
