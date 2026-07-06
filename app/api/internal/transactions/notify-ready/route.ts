import { NextRequest, NextResponse } from 'next/server';
import {
  enqueueTransactionReadyNotifications,
  parseTransactionNotifyWebhook,
  shouldNotifyTransactionReady,
  verifyInternalNotifySecret,
} from '@/lib/server/transaction-ready-notifications';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!verifyInternalNotifySecret(request)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: true, note: 'empty body' });
    }

    const parsed = parseTransactionNotifyWebhook(body);
    if (!parsed) {
      return NextResponse.json({ ok: true, note: 'ignored' });
    }

    if (!shouldNotifyTransactionReady(parsed)) {
      return NextResponse.json({ ok: true, note: 'no_number_transition' });
    }

    const result = await enqueueTransactionReadyNotifications(parsed.kind, parsed.entityId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[internal/transactions/notify-ready] unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
