/**
 * ops-daily-digest — posts the previous day's platform + per-tenant rollup
 * and any redflags (app.ops_daily_rollup / app.ops_daily_flags) to Slack.
 *
 * Invoked nightly by pg_cron (see 20260916_ops_daily_digest_send.sql), a few
 * minutes after app.compute_ops_daily_rollup has finished for the day.
 * Deterministic formatting only — no AI, no external calls beyond Slack.
 *
 * Supabase Dashboard → Edge Functions → ops-daily-digest
 *   Headers: x-push-secret: <INTEGRATIONS_PUSH_SECRET>
 *   Body (optional): { "day": "YYYY-MM-DD" } — defaults to yesterday, IST.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const FN = '[ops-daily-digest]';

function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('Missing required env var: SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function verifyPushSecret(req: Request): boolean {
  const secret = Deno.env.get('INTEGRATIONS_PUSH_SECRET')?.trim()
    ?? Deno.env.get('INTEGRATIONS_DISPATCH_SECRET')?.trim();
  if (!secret) return true; // no secret configured → open (dev mode)
  const provided = req.headers.get('x-push-secret')?.trim() ?? '';
  if (provided.length !== secret.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(secret);
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function ok(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

type RollupRow = {
  tenant_id: string | null;
  order_count: number;
  order_value: number;
  app_order_count: number;
  invoice_count: number;
  invoice_value: number;
  estimate_count: number;
  active_buyer_count: number;
  new_buyer_count: number;
  webhook_error_count: number;
  sync_job_failure_count: number;
  active_tenant_count: number;
};

type FlagRow = {
  tenant_id: string | null;
  metric: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
};

function yesterdayIst(): string {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  nowIst.setUTCDate(nowIst.getUTCDate() - 1);
  return nowIst.toISOString().slice(0, 10);
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function severityEmoji(severity: string): string {
  if (severity === 'critical') return '🔴';
  if (severity === 'warning') return '🟡';
  return 'ℹ️';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!verifyPushSecret(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults apply
  }
  const requestedDay = (body as { day?: unknown } | null)?.day;
  const day = typeof requestedDay === 'string' ? requestedDay : yesterdayIst();

  const admin = createAdminClient();

  const { data: webhookUrl, error: webhookUrlErr } = await admin
    .schema('app')
    .rpc('get_ops_slack_webhook_url');

  if (webhookUrlErr) {
    console.error(`${FN} failed to load Slack webhook URL:`, webhookUrlErr.message);
    return ok({ skipped: 'webhook_url_lookup_failed' });
  }
  if (!webhookUrl) {
    console.warn(`${FN} no Slack webhook URL configured (app.ops_slack_webhook_url vault secret unset) — skipping`);
    return ok({ skipped: 'no_webhook_configured' });
  }

  const [{ data: globalRow, error: globalErr }, { data: tenantRows, error: tenantRowsErr }, { data: flags, error: flagsErr }, { data: tenants, error: tenantsErr }] = await Promise.all([
    admin.schema('app').from('ops_daily_rollup').select('*').eq('day', day).is('tenant_id', null).maybeSingle<RollupRow>(),
    admin.schema('app').from('ops_daily_rollup').select('*').eq('day', day).not('tenant_id', 'is', null).order('order_value', { ascending: false }),
    admin.schema('app').from('ops_daily_flags').select('tenant_id, metric, severity, message').eq('day', day),
    admin.schema('app').from('tenants').select('id, business_name').is('deleted_at', null),
  ]);

  if (globalErr || tenantRowsErr || flagsErr || tenantsErr) {
    const msg = globalErr?.message ?? tenantRowsErr?.message ?? flagsErr?.message ?? tenantsErr?.message;
    console.error(`${FN} query failed:`, msg);
    return ok({ error: 'query_failed', detail: msg });
  }

  if (!globalRow) {
    console.warn(`${FN} no rollup found for ${day} — has app.compute_ops_daily_rollup run yet?`);
    return ok({ skipped: 'no_rollup_for_day' });
  }

  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id as string, t.business_name as string]));
  const totalTenants = tenantNameById.size;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 DealFlow Daily Digest — ${day}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Orders*\n${globalRow.order_count} (${formatInr(globalRow.order_value)})` },
        { type: 'mrkdwn', text: `*Buyer app orders*\n${globalRow.app_order_count}` },
        { type: 'mrkdwn', text: `*Invoices*\n${globalRow.invoice_count} (${formatInr(globalRow.invoice_value)})` },
        { type: 'mrkdwn', text: `*Estimates*\n${globalRow.estimate_count}` },
        { type: 'mrkdwn', text: `*Active buyers*\n${globalRow.active_buyer_count}` },
        { type: 'mrkdwn', text: `*New buyers*\n${globalRow.new_buyer_count}` },
        { type: 'mrkdwn', text: `*Active tenants*\n${globalRow.active_tenant_count} / ${totalTenants}` },
        { type: 'mrkdwn', text: `*Webhook errors*\n${globalRow.webhook_error_count}` },
      ],
    },
    { type: 'divider' },
  ];

  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedFlags = [...((flags ?? []) as FlagRow[])].sort(
    (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9),
  );

  if (sortedFlags.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '✅ *No redflags* — all metrics within normal range.' },
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *${sortedFlags.length} redflag${sortedFlags.length === 1 ? '' : 's'}*` },
    });
    for (const flag of sortedFlags.slice(0, 15)) {
      const scope = flag.tenant_id ? (tenantNameById.get(flag.tenant_id) ?? 'Unknown tenant') : 'Platform-wide';
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${severityEmoji(flag.severity)} *${scope}* — ${flag.message}` },
      });
    }
    if (sortedFlags.length > 15) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `…and ${sortedFlags.length - 15} more.` }],
      });
    }
  }

  const topTenants = ((tenantRows ?? []) as RollupRow[]).filter((r) => r.order_count > 0 || r.invoice_count > 0).slice(0, 5);
  if (topTenants.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Top tenants by order value*\n' + topTenants
          .map((r) => `• ${tenantNameById.get(r.tenant_id as string) ?? 'Unknown'} — ${r.order_count} orders (${formatInr(r.order_value)})`)
          .join('\n'),
      },
    });
  }

  const criticalCount = sortedFlags.filter((f) => f.severity === 'critical').length;
  const fallbackText = criticalCount > 0
    ? `DealFlow Daily Digest ${day}: ${criticalCount} critical redflag(s)`
    : `DealFlow Daily Digest ${day}: ${globalRow.order_count} orders, ${sortedFlags.length} redflag(s)`;

  const slackResponse = await fetch(webhookUrl as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallbackText, blocks }),
  });

  if (!slackResponse.ok) {
    const respBody = await slackResponse.text().catch(() => '');
    console.error(`${FN} Slack post failed ${slackResponse.status}: ${respBody.slice(0, 300)}`);
    return ok({ error: 'slack_post_failed', status: slackResponse.status });
  }

  console.log(`${FN} posted digest for ${day} (${sortedFlags.length} flags)`);
  return ok({ day, flags: sortedFlags.length });
});
