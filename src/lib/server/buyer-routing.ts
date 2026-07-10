import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { haversineKm } from '@/lib/haversine';
import { deriveBuyerPlaceOfSupply, hasBuyerDeliveryCoordinates, type BuyerDeliveryAddress } from '@/lib/buyer-routing';

export interface BuyerResolvedRouting {
  warehouseId: string | null;
  locationId: string | null;
  locationName: string | null;
  distanceKm: number | null;
  fallback: boolean;
  placeOfSupply: string;
}

async function loadTenantRoutingThreshold(db: SupabaseClient, tenantId: string): Promise<number> {
  const { data: settingsRow } = await (db as any)
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .single();

  return typeof settingsRow?.settings?.delivery_routing_threshold_km === 'number'
    ? settingsRow.settings.delivery_routing_threshold_km
    : 50;
}

async function loadWarehouseLocations(db: SupabaseClient, tenantId: string) {
  const { data: warehouses } = await (db as any)
    .schema('app')
    .from('warehouses')
    .select('id, name, lat, lng, is_default, location_id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  return (warehouses ?? []) as Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    is_default: boolean;
    location_id: string | null;
  }>;
}

async function loadDefaultLocation(db: SupabaseClient, tenantId: string) {
  const { data: defaultLocs } = await (db as any)
    .schema('app')
    .from('locations')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .is('deleted_at', null)
    .limit(1);

  return (defaultLocs as Array<{ id: string; name: string }> | null)?.[0] ?? null;
}

async function loadDefaultWarehouse(db: SupabaseClient, tenantId: string) {
  const { data: defaultWarehouses } = await (db as any)
    .schema('app')
    .from('warehouses')
    .select('id, name, location_id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .is('deleted_at', null)
    .limit(1);

  return (defaultWarehouses as Array<{ id: string; name: string; location_id: string | null }> | null)?.[0] ?? null;
}

export async function resolveNearestBuyerLocation(
  db: SupabaseClient,
  tenantId: string,
  deliveryAddress: BuyerDeliveryAddress | null | undefined,
): Promise<Omit<BuyerResolvedRouting, 'placeOfSupply'> | null> {
  if (!hasBuyerDeliveryCoordinates(deliveryAddress)) {
    return null;
  }

  const thresholdKm = await loadTenantRoutingThreshold(db, tenantId);
  const warehouses = await loadWarehouseLocations(db, tenantId);

  let nearest: { id: string; name: string; distanceKm: number } | null = null;
  for (const warehouse of warehouses) {
    const distanceKm = haversineKm(deliveryAddress.lat, deliveryAddress.lng, warehouse.lat, warehouse.lng);
    if (distanceKm <= thresholdKm && (!nearest || distanceKm < nearest.distanceKm)) {
      nearest = { id: warehouse.id, name: warehouse.name, distanceKm };
    }
  }

  if (nearest) {
    const warehouse = warehouses.find((candidate) => candidate.id === nearest?.id) ?? null;
    return {
      warehouseId: nearest.id,
      locationId: warehouse?.location_id ?? null,
      locationName: nearest.name,
      distanceKm: Math.round(nearest.distanceKm),
      fallback: false,
    };
  }

  const fallbackWarehouse = await loadDefaultWarehouse(db, tenantId);
  if (fallbackWarehouse) {
    return {
      warehouseId: fallbackWarehouse.id,
      locationId: fallbackWarehouse.location_id,
      locationName: fallbackWarehouse.name,
      distanceKm: null,
      fallback: true,
    };
  }

  const fallbackLocation = await loadDefaultLocation(db, tenantId);
  if (!fallbackLocation) {
    return null;
  }

  return {
    warehouseId: null,
    locationId: fallbackLocation.id,
    locationName: fallbackLocation.name,
    distanceKm: null,
    fallback: true,
  };
}

export async function resolveBuyerRouting(
  tenantId: string,
  deliveryAddress: BuyerDeliveryAddress | null | undefined,
): Promise<BuyerResolvedRouting | null> {
  if (!hasBuyerDeliveryCoordinates(deliveryAddress)) {
    return null;
  }

  const db = supabaseAdmin ?? supabase;
  const resolved = await resolveNearestBuyerLocation(db as SupabaseClient, tenantId, deliveryAddress);
  if (!resolved) {
    return null;
  }

  return {
    ...resolved,
    placeOfSupply: deriveBuyerPlaceOfSupply(deliveryAddress),
  };
}
