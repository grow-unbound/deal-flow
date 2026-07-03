import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';

export const dynamic = 'force-dynamic';

export interface NearestLocationResponse {
  warehouse_id: string | null;
  location_id: string | null;
  name: string | null;
  distance_km: number | null;
  fallback: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse<NearestLocationResponse>> {
  const profile = await requireBuyerAccessProfile(req);
  if (!profile?.context.tenant_id) {
    return NextResponse.json({ warehouse_id: null, location_id: null, name: null, distance_km: null, fallback: true });
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ warehouse_id: null, location_id: null, name: null, distance_km: null, fallback: true });
  }

  const db = supabaseAdmin;
  if (!db) {
    return NextResponse.json({ warehouse_id: null, location_id: null, name: null, distance_km: null, fallback: true });
  }

  const tenant_id = profile.context.tenant_id;
  const resolved = await resolveNearestBuyerLocation(db as any, tenant_id, { lat, lng });
  return NextResponse.json({
    warehouse_id: resolved?.warehouseId ?? null,
    location_id: resolved?.locationId ?? null,
    name: resolved?.locationName ?? null,
    distance_km: resolved?.distanceKm ?? null,
    fallback: resolved?.fallback ?? true,
  });
}
