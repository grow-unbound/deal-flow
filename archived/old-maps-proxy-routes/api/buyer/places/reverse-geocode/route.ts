import { NextRequest, NextResponse } from 'next/server';
import { buyerDeliveryLocationSchema, type BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';

const KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!KEY) {
    return NextResponse.json({ error: 'Maps not configured' }, { status: 503 });
  }
  const latlng = req.nextUrl.searchParams.get('latlng')?.trim() ?? '';
  if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(latlng)) {
    return NextResponse.json({ error: 'latlng must be lat,lng' }, { status: 400 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', latlng);
  url.searchParams.set('key', KEY);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    results?: Array<{
      place_id: string;
      formatted_address: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{ long_name: string; types: string[] }>;
    }>;
    status?: string;
    error_message?: string;
  };

  if (data.status && data.status !== 'OK') {
    console.error('[places/reverse-geocode]', data.status, data.error_message);
    return NextResponse.json({ error: data.error_message ?? 'Geocode failed' }, { status: 502 });
  }

  const first = data.results?.[0];
  if (!first) {
    return NextResponse.json({ error: 'No results' }, { status: 404 });
  }

  const lat = first.geometry?.location?.lat ?? Number(latlng.split(',')[0]);
  const lng = first.geometry?.location?.lng ?? Number(latlng.split(',')[1]);
  let city: string | undefined;
  let state: string | undefined;
  let pincode: string | undefined;
  for (const c of first.address_components ?? []) {
    if (c.types.includes('locality')) city = c.long_name;
    if (c.types.includes('administrative_area_level_1')) state = c.long_name;
    if (c.types.includes('postal_code')) pincode = c.long_name;
  }
  const label = first.formatted_address.split(',')[0] ?? 'Current location';

  const parsed = buyerDeliveryLocationSchema.safeParse({
    place_id: first.place_id,
    label,
    formatted_address: first.formatted_address,
    city,
    state,
    pincode,
    lat,
    lng,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid geocode result' }, { status: 502 });
  }

  const location: BuyerDeliveryLocation = parsed.data;
  return NextResponse.json({ location });
}
