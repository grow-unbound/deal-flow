import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { haversineKm } from '@/lib/haversine';

export const dynamic = 'force-dynamic';

export interface NearestLocationResponse {
  location_id: string | null;
  name: string | null;
  distance_km: number | null;
  fallback: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse<NearestLocationResponse>> {
  const profile = await requireBuyerAccessProfile(req);
  if (!profile?.context.tenant_id) {
    return NextResponse.json({ location_id: null, name: null, distance_km: null, fallback: true });
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ location_id: null, name: null, distance_km: null, fallback: true });
  }

  const db = supabaseAdmin;
  if (!db) {
    return NextResponse.json({ location_id: null, name: null, distance_km: null, fallback: true });
  }

  const tenant_id = profile.context.tenant_id;

  // Read per-tenant threshold (default 300 km)
  const { data: settingsRow } = await (db as any)
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenant_id)
    .single();

  const thresholdKm: number =
    typeof settingsRow?.settings?.delivery_routing_threshold_km === 'number'
      ? settingsRow.settings.delivery_routing_threshold_km
      : 300;

  // Fetch active warehouse locations that have coordinates
  const { data: locs } = await (db as any)
    .schema('app')
    .from('locations')
    .select('id, name, lat, lng, is_default')
    .eq('tenant_id', tenant_id)
    .eq('type', 'warehouse')
    .is('deleted_at', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  const warehouses = (locs ?? []) as Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    is_default: boolean;
  }>;

  // Find nearest within threshold
  let nearest: { id: string; name: string; distance_km: number } | null = null;
  for (const w of warehouses) {
    const dist = haversineKm(lat, lng, w.lat, w.lng);
    if (dist <= thresholdKm && (!nearest || dist < nearest.distance_km)) {
      nearest = { id: w.id, name: w.name, distance_km: dist };
    }
  }

  if (nearest) {
    return NextResponse.json({
      location_id: nearest.id,
      name: nearest.name,
      distance_km: Math.round(nearest.distance_km),
      fallback: false,
    });
  }

  // Fallback: default location (any type)
  const { data: defaultLocs } = await (db as any)
    .schema('app')
    .from('locations')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .eq('is_default', true)
    .is('deleted_at', null)
    .limit(1);

  const def = (defaultLocs as Array<{ id: string; name: string }> | null)?.[0];
  return NextResponse.json({
    location_id: def?.id ?? null,
    name: def?.name ?? null,
    distance_km: null,
    fallback: true,
  });
}
