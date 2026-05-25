import { NextResponse } from 'next/server';
import { generateCsvTemplate } from '@/lib/csv';

// ── GET /api/products/template ────────────────────────────────────────────────

export async function GET() {
  const csv = generateCsvTemplate();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="product-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
