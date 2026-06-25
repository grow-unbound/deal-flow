import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.GOOGLE_MAPS_API_KEY;
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!KEY) {
    return NextResponse.json({ error: 'Maps not configured' }, { status: 503 });
  }
  const input = req.nextUrl.searchParams.get('input')?.trim() ?? '';
  if (input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('components', 'country:in');
  url.searchParams.set('key', KEY);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    predictions?: Array<{ description: string; place_id: string }>;
    status?: string;
    error_message?: string;
  };

  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('[places/autocomplete]', data.status, data.error_message);
    return NextResponse.json({ error: data.error_message ?? 'Autocomplete failed' }, { status: 502 });
  }

  return NextResponse.json({
    predictions: (data.predictions ?? []).map((p) => ({
      description: p.description,
      place_id: p.place_id,
    })),
  });
}
