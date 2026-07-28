import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { WhatsAppBroadcastCreateSchema } from '@/lib/zod';
import { getPostHogClient } from '@/lib/posthog-server';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';
import { enqueueWhatsAppMessage, triggerWhatsAppDispatch } from '@/lib/server/whatsapp-enqueue';

const BROADCAST_LIST_LIMIT_DEFAULT = 50;
const BROADCAST_LIST_LIMIT_MAX = 100;

const BROADCAST_STATUS_FILTERS = new Set([
  'all',
  'draft',
  'pending_review',
  'scheduled',
  'sending',
  'completed',
  'partially_failed',
  'cancelled',
]);

const BROADCAST_SORT_OPTIONS = new Set(['date_desc', 'date_asc', 'name_asc', 'name_desc']);

type BroadcastSort = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

interface RawBroadcastRow {
  id: string;
  name: string;
  use_case: string;
  target_type: string;
  status: string;
  scheduled_for: string | null;
  estimated_recipient_count: number | null;
  actual_recipient_count: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  failed_count: number | null;
  created_at: string;
  target_cohort_id: string | null;
  target_buyer_ids: string[] | null;
  whatsapp_template_id: string | null;
  whatsapp_templates: { meta_template_name: string; display_name: string } | null;
  cohorts: { name: string } | null;
}

interface BroadcastKpis {
  total_broadcasts: number;
  delivered_this_month: number;
  scheduled_count: number;
  success_rate_pct: number;
  sent_this_month: number;
}

function parseBroadcastListParams(searchParams: URLSearchParams) {
  const limitRaw = Number(searchParams.get('limit') ?? BROADCAST_LIST_LIMIT_DEFAULT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), BROADCAST_LIST_LIMIT_MAX)
    : BROADCAST_LIST_LIMIT_DEFAULT;
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  const q = (searchParams.get('q') ?? '').trim();
  const statusParam = searchParams.get('status') ?? 'all';
  const status = BROADCAST_STATUS_FILTERS.has(statusParam) ? statusParam : 'all';
  const sortParam = searchParams.get('sort') ?? 'date_desc';
  const sort: BroadcastSort = BROADCAST_SORT_OPTIONS.has(sortParam)
    ? (sortParam as BroadcastSort)
    : 'date_desc';

  return { limit, offset, q, status, sort };
}

function formatBroadcastTargetLabel(row: RawBroadcastRow): string {
  if (row.target_type === 'cohort') {
    return row.cohorts?.name ?? 'Customer group';
  }

  const buyerIds = Array.isArray(row.target_buyer_ids) ? row.target_buyer_ids : [];
  const count = row.actual_recipient_count
    ?? row.estimated_recipient_count
    ?? (row.target_type === 'buyer_selection' ? buyerIds.length : 0);

  if (row.target_type === 'all_buyers') {
    return count > 0 ? `All buyers (${count})` : 'All buyers';
  }
  if (row.target_type === 'geography_filter') {
    return count > 0 ? `Geography filter (${count})` : 'Geography filter';
  }
  if (row.target_type === 'dormant_filter') {
    return count > 0 ? `Dormant customers (${count})` : 'Dormant customers';
  }
  if (row.target_type === 'dues_filter') {
    return count > 0 ? `Customers with dues (${count})` : 'Customers with dues';
  }

  return `${count} customer${count === 1 ? '' : 's'}`;
}

async function resolveBroadcastSearchTemplateIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  q: string,
): Promise<string[]> {
  if (!q) return [];

  const { data: templates } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id')
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .is('deleted_at', null)
    .or(`meta_template_name.ilike.%${q}%,display_name.ilike.%${q}%`);

  return (templates ?? []).map((row: { id: string }) => row.id);
}

function applyBroadcastSearchToQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  q: string,
  templateIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!q) return query;

  const escaped = q.replace(/[%_]/g, '\\$&');
  if (templateIds.length > 0) {
    return query.or(`name.ilike.%${escaped}%,whatsapp_template_id.in.(${templateIds.join(',')})`);
  }
  return query.ilike('name', `%${escaped}%`);
}

async function fetchBroadcastKpis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
): Promise<BroadcastKpis> {
  const [broadcastsResult, scheduledResult, monthlyMessagesResult, allMessagesResult] = await Promise.all([
    db
      .schema('app')
      .from('whatsapp_broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('whatsapp_broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .is('deleted_at', null),
    db
      .schema('app')
      .from('whatsapp_messages')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('trigger_source', 'broadcast')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .is('deleted_at', null),
    db
      .schema('app')
      .from('whatsapp_messages')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('trigger_source', 'broadcast')
      .is('deleted_at', null),
  ]);

  const monthlyMessages = (monthlyMessagesResult.data ?? []) as Array<{ status: string | null }>;
  const allMessages = (allMessagesResult.data ?? []) as Array<{ status: string | null }>;

  const deliveredThisMonth = monthlyMessages.filter((row) => row.status === 'delivered' || row.status === 'read').length;
  const sentThisMonth = monthlyMessages.filter((row) => row.status === 'sent' || row.status === 'delivered' || row.status === 'read').length;
  const successfulAllTime = allMessages.filter((row) => row.status === 'delivered' || row.status === 'read').length;
  const terminalAllTime = allMessages.filter(
    (row) => row.status === 'delivered' || row.status === 'read' || row.status === 'failed' || row.status === 'blocked_by_recipient' || row.status === 'opted_out',
  ).length;

  return {
    total_broadcasts: broadcastsResult.count ?? 0,
    delivered_this_month: deliveredThisMonth,
    scheduled_count: scheduledResult.count ?? 0,
    success_rate_pct: terminalAllTime > 0 ? Math.round((successfulAllTime / terminalAllTime) * 100) : 0,
    sent_this_month: sentThisMonth,
  };
}

function enrichBroadcastRow(row: RawBroadcastRow) {
  const fallbackTotal = row.actual_recipient_count
    ?? row.estimated_recipient_count
    ?? (Array.isArray(row.target_buyer_ids) ? row.target_buyer_ids.length : 0);
  const totalCount = fallbackTotal;
  const displayAt = row.scheduled_for ?? row.created_at;

  return {
    id: row.id,
    name: row.name,
    use_case: row.use_case,
    target_type: row.target_type,
    status: row.status,
    scheduled_for: row.scheduled_for,
    estimated_recipient_count: row.estimated_recipient_count,
    actual_recipient_count: row.actual_recipient_count,
    created_at: row.created_at,
    display_at: displayAt,
    template_name: row.whatsapp_templates?.display_name ?? row.whatsapp_templates?.meta_template_name ?? null,
    target_label: formatBroadcastTargetLabel(row),
    sent_count: row.sent_count ?? 0,
    delivered_count: row.delivered_count ?? 0,
    failed_count: row.failed_count ?? 0,
    total_count: totalCount,
  };
}

/**
 * WhatsApp Broadcast Phase E — broadcast job list + create.
 *
 * Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.2, §8, §9.
 *
 * GET  — paginated broadcast history for Manage Broadcasts page.
 *        Both seller_admin and seller_assistant can read.
 * POST — create a broadcast row. seller_admin only (§8), re-verified here at
 *        the API layer in addition to the RLS INSERT policy (belt+suspenders,
 *        same pattern as app/api/customers/import/route.ts).
 *
 * POST now performs the enqueue-first send handoff:
 * resolves audience, creates the broadcast row, snapshots the buyer/template
 * payloads into app.whatsapp_messages + app.whatsapp_send_queue, and triggers
 * the dispatch worker for immediate sends.
 */
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { limit, offset, q, status, sort } = parseBroadcastListParams(request.nextUrl.searchParams);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const templateIds = await resolveBroadcastSearchTemplateIds(db, claims.tenant_id, q);

  // Filters must come after .select() — PostgREST builder from .from() alone has no .eq().
  let listQuery = db
    .schema('app')
    .from('whatsapp_broadcasts')
    .select(
      `
        id,
        name,
        use_case,
        target_type,
        status,
        scheduled_for,
        estimated_recipient_count,
        actual_recipient_count,
        sent_count,
        delivered_count,
        failed_count,
        created_at,
        target_cohort_id,
        target_buyer_ids,
        whatsapp_template_id,
        whatsapp_templates ( meta_template_name, display_name ),
        cohorts:target_cohort_id ( name )
      `,
      { count: 'exact' },
    )
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  listQuery = applyBroadcastSearchToQuery(listQuery, q, templateIds);

  if (status !== 'all') {
    listQuery = listQuery.eq('status', status);
  }

  if (sort === 'name_asc' || sort === 'name_desc') {
    listQuery = listQuery.order('name', { ascending: sort === 'name_asc' });
  } else {
    listQuery = listQuery.order('created_at', { ascending: sort === 'date_asc' });
  }

  const { data: rows, error, count } = await listQuery.range(offset, offset + limit - 1);

  if (error) {
    console.error('[GET /api/whatsapp/broadcasts] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }

  const rawRows = (rows ?? []) as RawBroadcastRow[];
  const kpis = await fetchBroadcastKpis(db, claims.tenant_id);
  const broadcasts = rawRows.map((row) => enrichBroadcastRow(row));
  const total = count ?? broadcasts.length;
  const nextOffset = offset + broadcasts.length < total ? offset + broadcasts.length : null;

  return NextResponse.json(
    {
      kpis,
      broadcasts,
      total,
      next_offset: nextOffset,
      limit,
      offset,
    },
    { headers: SELLER_CACHE_PERSONAL },
  );
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only send/create (spec §8) — checked here at the API layer in
  // addition to the RLS INSERT policy on app.whatsapp_broadcasts.
  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin only' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = WhatsAppBroadcastCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  if (input.scheduled_for && new Date(input.scheduled_for).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: template, error: templateError } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, approval_status, use_case, locale, variables, button_config, buttons_config, header_config, is_broadcast_template')
    .eq('id', input.whatsapp_template_id)
    .or(`tenant_id.is.null,tenant_id.eq.${claims.tenant_id}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (templateError || !template) {
    return NextResponse.json({ error: 'Invalid or inaccessible template' }, { status: 400 });
  }
  if (template.approval_status !== 'approved') {
    return NextResponse.json({ error: 'Template is not approved for sending yet' }, { status: 400 });
  }
  if (!template.is_broadcast_template) {
    return NextResponse.json({ error: 'This template cannot be used for broadcasts' }, { status: 400 });
  }

  try {
    const eligibleBuyerIds = await resolveBroadcastAudience(db, {
      tenantId: claims.tenant_id,
      targetType: input.target_type,
      targetCohortId: input.target_cohort_id,
      targetFilter: input.target_filter,
      targetBuyerIds: input.target_buyer_ids,
    });

    const { data: broadcast, error: insertError } = await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .insert({
        tenant_id: claims.tenant_id,
        name: input.name,
        whatsapp_template_id: input.whatsapp_template_id,
        use_case: input.use_case,
        target_type: input.target_type,
        target_cohort_id: input.target_cohort_id ?? null,
        target_filter: input.target_filter ?? null,
        target_buyer_ids: input.target_buyer_ids ?? null,
        linked_campaign_id: input.linked_campaign_id ?? null,
        variable_bindings: input.variable_bindings ?? {},
        status: input.scheduled_for ? 'scheduled' : 'sending',
        scheduled_for: input.scheduled_for ?? null,
        estimated_recipient_count: eligibleBuyerIds.length,
        actual_recipient_count: 0,
        daily_cap_at_creation: null,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id, name, status, estimated_recipient_count, actual_recipient_count, scheduled_for, created_at')
      .single();

    if (insertError) {
      console.error('[POST /api/whatsapp/broadcasts] insert error:', insertError.code, insertError.message);
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
    }

    const queueInputs = await buildBroadcastMessageQueue(db, {
      tenantId: claims.tenant_id,
      whatsappBroadcastId: broadcast.id as string,
      buyerIds: eligibleBuyerIds,
      template: template as {
        id: string;
        meta_template_name: string;
        meta_category: 'marketing' | 'utility' | 'authentication';
        approval_status: 'pending' | 'approved' | 'rejected' | 'disabled';
        use_case: string;
        locale: string | null;
        variables: Array<{ key: string; description?: string }>;
        button_config: { type?: 'url'; variable_source?: string } | null;
      },
      variableBindings: input.variable_bindings ?? {},
      linkedCampaignId: input.linked_campaign_id ?? null,
      scheduledSendAt: input.scheduled_for ?? null,
    });

    const messageIds: string[] = [];
    for (const queueInput of queueInputs) {
      const result = await enqueueWhatsAppMessage(queueInput);
      if (!result.enqueued) {
        throw new Error('Failed to enqueue one or more broadcast messages');
      }
      if (result.messageId) messageIds.push(result.messageId);
    }

    await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .update({
        actual_recipient_count: queueInputs.length,
        estimated_recipient_count: queueInputs.length,
        updated_by: claims.sub,
      })
      .eq('id', broadcast.id);

    if (!input.scheduled_for) {
      await triggerWhatsAppDispatch(messageIds);
    }

    getPostHogClient()?.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'whatsapp_broadcast_created',
      properties: {
        tenant_id: claims.tenant_id,
        broadcast_id: broadcast.id,
        use_case: input.use_case,
        target_type: input.target_type,
        has_target_cohort: Boolean(input.target_cohort_id),
        selected_buyer_count: input.target_buyer_ids?.length ?? 0,
        linked_campaign_id: input.linked_campaign_id ?? null,
        template_id: input.whatsapp_template_id,
        scheduled: Boolean(input.scheduled_for),
        recipient_count: queueInputs.length,
        message_count: messageIds.length,
        status: input.scheduled_for ? 'scheduled' : 'sending',
        role: claims.role,
      },
    });

    return NextResponse.json({
      broadcast: {
        ...broadcast,
        actual_recipient_count: queueInputs.length,
        estimated_recipient_count: queueInputs.length,
      },
      recipient_count: queueInputs.length,
      note: input.scheduled_for
        ? 'Broadcast scheduled. Messages are queued and will start sending at the selected time.'
        : 'Broadcast queued. Messages are now in the WhatsApp dispatch pipeline.',
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/whatsapp/broadcasts] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create broadcast' },
      { status: 500 },
    );
  }
}
