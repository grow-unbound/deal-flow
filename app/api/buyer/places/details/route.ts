import { NextRequest, NextResponse } from 'next/server';
import { buyerDeliveryLocationSchema, type BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';

const KEY = process.env.GOOGLE_MAPS_API_KEY;

function mapDetailsResult(json: {
  result?: {
    place_id: string;
    formatted_address: string;
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: Array<{ long_name: string; types: string[] }>;
    name?: string;
  };
  status?: string;
  error_message?: string;
}): BuyerDeliveryLocation {
  const r = json.result;
  if (!r) throw new Error('Missing result');
  const lat = r.geometry?.location?.lat ?? 0;
  const lng = r.geometry?.location?.lng ?? 0;
  let city: string | undefined;
  let state: string | undefined;
  let pincode: string | undefined;
  for (const c of r.address_components ?? []) {
    if (c.types.includes('locality')) city = c.long_name;
    if (c.types.includes('administrative_area_level_1')) state = c.long_name;
    if (c.types.includes('postal_code')) pincode = c.long_name;
  }
  const label = r.name?.trim() || r.formatted_address.split(',')[0] || 'Location';
  const parsed = buyerDeliveryLocationSchema.safeParse({
    place_id: r.place_id,
    label,
    formatted_address: r.formatted_address,
    city,
    state,
    pincode,
    lat,
    lng,
  });
  if (!parsed.success) {
    throw new Error('Invalid place details');
  }
  return parsed.data;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!KEY) {
    return NextResponse.json({ error: 'Maps not configured' }, { status: 503 });
  }
  const placeId = req.nextUrl.searchParams.get('place_id')?.trim() ?? '';
  if (!placeId) {
    return NextResponse.json({ error: 'place_id required' }, { status: 400 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'place_id,formatted_address,geometry,address_components,name');
  url.searchParams.set('key', KEY);

  const res = await fetch(url.toString());
  const json = (await res.json()) as Parameters<typeof mapDetailsResult>[0];

  if (json.status && json.status !== 'OK') {
    console.error('[places/details]', json.status, json.error_message);
    return NextResponse.json({ error: json.error_message ?? 'Details failed' }, { status: 502 });
  }

  try {
    const location = mapDetailsResult(json);
    return NextResponse.json({ location });
  } catch (e) {
    console.error('[places/details] parse', e);
    return NextResponse.json({ error: 'Invalid response' }, { status: 502 });
  }
}
