import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Reserved for a dedicated send endpoint; sending is handled via PATCH on `invoices/[id]`. */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Use PATCH /api/tenant/invoices/:id with action send' },
    { status: 405 },
  );
}
