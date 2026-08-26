import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

const MESSAGE_LIST_LIMIT_DEFAULT = 50;
const MESSAGE_LIST_LIMIT_MAX = 200;

const STATUS_BUCKETS = new Set(['all', 'notified', 'not_notified', 'failed', 'opted_out']);
type StatusBucket = 'all' | 'notified' | 'not_notified' | 'failed' | 'opted_out';

const STATUSES_BY_BUCKET: Record<Exclude<StatusBucket, 'all'>, string[]> = {
  notified: ['sent', 'delivered', 'read'],
  not_notified: ['queued'],
  failed: ['failed'],
  opted_out: ['blocked_by_recipient', 'opted_out'],
};

/**
 * Per-recipient status breakdown for a single broadcast — the "who was
 * notified vs missed" view the Manage Broadcasts list doesn't have (it only
 * shows aggregate counts). Backs the status filter chips on the broadcast
 * detail page and the retarget-not-notified flow's preview counts.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: broadcast, error: broadcastError } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (broadcastError || !broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const bucketParam = searchParams.get('status') ?? 'all';
  const bucket: StatusBucket = STATUS_BUCKETS.has(bucketParam) ? (bucketParam as StatusBucket) : 'all';

  const limitRaw = Number(searchParams.get('limit') ?? MESSAGE_LIST_LIMIT_DEFAULT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), MESSAGE_LIST_LIMIT_MAX)
    : MESSAGE_LIST_LIMIT_DEFAULT;
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  let query = db
    .schema('app')
    .from('whatsapp_messages')
    .select(
      `
        id,
        buyer_id,
        recipient_phone,
        status,
        failure_reason,
        sent_at,
        delivered_at,
        read_at,
        created_at,
        buyers:buyer_id ( business_name, contact_name )
      `,
      { count: 'exact' },
    )
    .eq('whatsapp_broadcast_id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (bucket !== 'all') {
    query = query.in('status', STATUSES_BY_BUCKET[bucket]);
  }

  const { data: rows, error, count } = await query
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[GET /api/whatsapp/broadcasts/[id]/messages] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch broadcast messages' }, { status: 500 });
  }

  // Bucket counts for the filter chip badges — computed alongside the page
  // query so the chips always agree with what's actually filterable.
  const { data: allStatuses } = await db
    .schema('app')
    .from('whatsapp_messages')
    .select('status')
    .eq('whatsapp_broadcast_id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  const statusRows = (allStatuses ?? []) as Array<{ status: string }>;
  const bucketCounts = {
    all: statusRows.length,
    notified: statusRows.filter((r) => STATUSES_BY_BUCKET.notified.includes(r.status)).length,
    not_notified: statusRows.filter((r) => STATUSES_BY_BUCKET.not_notified.includes(r.status)).length,
    failed: statusRows.filter((r) => STATUSES_BY_BUCKET.failed.includes(r.status)).length,
    opted_out: statusRows.filter((r) => STATUSES_BY_BUCKET.opted_out.includes(r.status)).length,
  };

  interface RawMessageRow {
    id: string;
    buyer_id: string | null;
    recipient_phone: string;
    status: string;
    failure_reason: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    read_at: string | null;
    created_at: string;
    buyers: { business_name: string; contact_name: string | null } | null;
  }

  const messages = ((rows ?? []) as RawMessageRow[]).map((row) => ({
    id: row.id,
    buyer_id: row.buyer_id,
    buyer_name: row.buyers?.contact_name || row.buyers?.business_name || null,
    recipient_phone: row.recipient_phone,
    status: row.status,
    failure_reason: row.failure_reason,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    read_at: row.read_at,
    created_at: row.created_at,
  }));

  const total = count ?? messages.length;
  const nextOffset = offset + messages.length < total ? offset + messages.length : null;

  return NextResponse.json(
    {
      broadcast_id: broadcast.id,
      broadcast_name: broadcast.name,
      bucket_counts: bucketCounts,
      messages,
      total,
      next_offset: nextOffset,
      limit,
      offset,
    },
    { headers: SELLER_CACHE_PERSONAL },
  );
}
