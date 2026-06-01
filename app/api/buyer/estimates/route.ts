import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const estimateItemSchema = z.object({
  tenant_product_id: z.string().uuid(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  product_name: z.string().min(1),
});

const estimateBodySchema = z.object({
  items: z.array(estimateItemSchema).min(1, 'Cart must have at least one item'),
  notes: z.string().max(1000).optional(),
});

export interface EstimateRequest {
  items: Array<{
    tenant_product_id: string;
    qty: number;
    unit_price: number;
    product_name: string;
  }>;
  notes?: string;
}

export interface EstimateResponse {
  success: boolean;
  estimate_id?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<EstimateResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = estimateBodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? 'Invalid request';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  // Generate a stub estimate ID for now (replace with Supabase insert when DB is ready)
  const estimate_id = `ENQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  return NextResponse.json({ success: true, estimate_id }, { status: 201 });
}
