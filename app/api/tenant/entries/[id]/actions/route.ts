import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canAccessDocumentLocation } from '@/lib/server/seller-location-access';
import { queueApprovalResolutionMessage } from '@/lib/server/buyer-approval-notify';

export const dynamic = 'force-dynamic';

const ActionSchema = z.object({
  action: z.enum([
    'open',
    'start',
    'add_note',
    'remind_later',
    'dismiss',
    'ignore',
    'mark_converted_manually',
    'reopen',
    'approve',
    'decline',
    'request_more_info',
  ]),
  note: z.string().trim().max(2000).optional(),
  remind_at: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const APPROVAL_ACTIONS = new Set(['approve', 'decline', 'request_more_info'] as const);
type ApprovalAction = 'approve' | 'decline' | 'request_more_info';

function resolutionForApprovalAction(action: ApprovalAction): 'approved' | 'declined' | 'needs_more_info' {
  if (action === 'approve') return 'approved';
  if (action === 'decline') return 'declined';
  return 'needs_more_info';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid action' }, { status: 400 });
    }

    const { data: entry, error: entryError } = await (supabaseAdmin as any)
      .schema('app')
      .from('entries')
      .select('id, tenant_id, location_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (entryError || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    if (entry.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (entry.location_id && !canAccessDocumentLocation(claims, entry.location_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('apply_entry_action', {
        p_tenant_id: claims.tenant_id,
        p_entry_id: id,
        p_actor_user_id: claims.sub,
        p_action: parsed.data.action,
        p_note: parsed.data.note ?? null,
        p_remind_at: parsed.data.remind_at ?? null,
        p_metadata: parsed.data.metadata ?? {},
      });

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      // approval_buyer_not_found means the entry resolved fine but the buyer
      // row it points at is missing/soft-deleted/cross-tenant -- a distinct,
      // more accurate condition than "entry not found" (the entry itself was
      // found; it's the linked buyer that's the problem). Must be checked
      // before the generic `not_found` match below, since that substring
      // matches this message too.
      if (msg.includes('approval_buyer_not_found')) {
        return NextResponse.json({ error: 'The buyer linked to this entry could not be found' }, { status: 409 });
      }
      if (msg.includes('not_found')) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      if (msg.includes('required') || msg.includes('unsupported')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error('[POST /api/tenant/entries/[id]/actions] apply_entry_action failed', error);
      return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
    }

    if (APPROVAL_ACTIONS.has(parsed.data.action as ApprovalAction)) {
      const resolvedEntry = data as { source_entity_type?: string; source_entity_id?: string; metadata?: Record<string, unknown> } | null;
      const buyerId = resolvedEntry?.source_entity_type === 'buyer' ? resolvedEntry.source_entity_id : null;
      if (buyerId) {
        const action = parsed.data.action as ApprovalAction;
        const missingFields = action === 'request_more_info'
          ? ((resolvedEntry?.metadata?.missing_fields as string[] | undefined) ?? undefined)
          : undefined;
        // Non-critical: notify failures must not fail an already-successful
        // entry-action request (same fire-and-forget contract as the intake
        // route's queueAccessRequestReceivedMessages call).
        try {
          await queueApprovalResolutionMessage(
            supabaseAdmin,
            claims.tenant_id,
            buyerId,
            resolutionForApprovalAction(action),
            { missingFields },
          );
        } catch (notifyError) {
          console.error('[POST /api/tenant/entries/[id]/actions] approval-resolution notify failed', notifyError);
        }
      } else {
        console.error('[POST /api/tenant/entries/[id]/actions] approval action resolved without a linked buyer', {
          entryId: id,
          action: parsed.data.action,
        });
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/tenant/entries/[id]/actions]', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}
