import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const KEY = process.env.GOOGLE_MAPS_API_KEY;

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!KEY) return jsonError(503, 'Maps not configured');

  try {
    const claims = await getVerifiedClaims(req);
    if (!claims.tenant_id) return jsonError(401, 'Unauthorized');
    if (!claims.role?.startsWith('seller_')) return jsonError(403, 'Forbidden');
  } catch {
    return jsonError(401, 'Unauthorized');
  }

  const type = req.nextUrl.searchParams.get('type');

  if (type === 'autocomplete') {
    const input = req.nextUrl.searchParams.get('input')?.trim() ?? '';
    if (input.length < 2) return NextResponse.json({ predictions: [] });

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
      console.error('[locations/geocode] autocomplete', data.status, data.error_message);
      return jsonError(502, data.error_message ?? 'Autocomplete failed');
    }

    return NextResponse.json({
      predictions: (data.predictions ?? []).map((p) => ({
        description: p.description,
        place_id: p.place_id,
      })),
    });
  }

  if (type === 'details') {
    const placeId = req.nextUrl.searchParams.get('place_id')?.trim() ?? '';
    if (!placeId) return jsonError(400, 'place_id required');

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'place_id,formatted_address,geometry,address_components,name');
    url.searchParams.set('key', KEY);

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      result?: {
        formatted_address: string;
        geometry?: { location?: { lat: number; lng: number } };
        address_components?: Array<{ long_name: string; types: string[] }>;
        name?: string;
      };
      status?: string;
      error_message?: string;
    };

    if (data.status && data.status !== 'OK') {
      console.error('[locations/geocode] details', data.status, data.error_message);
      return jsonError(502, data.error_message ?? 'Details failed');
    }

    const r = data.result;
    if (!r) return jsonError(502, 'No result');

    const lat = r.geometry?.location?.lat ?? null;
    const lng = r.geometry?.location?.lng ?? null;
    let city = '';
    let state = '';
    let pincode = '';
    let line1 = '';

    for (const c of r.address_components ?? []) {
      if (c.types.includes('street_number') || c.types.includes('route')) {
        line1 = line1 ? `${line1} ${c.long_name}` : c.long_name;
      }
      if (c.types.includes('locality')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) state = c.long_name;
      if (c.types.includes('postal_code')) pincode = c.long_name;
    }

    // Fall back to first segment of formatted address for line1
    if (!line1) line1 = r.name?.trim() || r.formatted_address.split(',')[0] || '';

    return NextResponse.json({
      lat,
      lng,
      formatted_address: r.formatted_address,
      line1,
      city,
      state: state.slice(0, 2).toUpperCase(),
      pincode,
    });
  }

  return jsonError(400, 'type must be autocomplete or details');
}
