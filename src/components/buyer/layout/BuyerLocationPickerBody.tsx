'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, MapPin, Navigation, Store } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { getMapsLoader } from '@/lib/google-maps-loader';
import { markBuyerNavigationBack, navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import { formatBuyerSelectedLocationLabel, type BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';
import { apiFetch } from '@/lib/api-fetch';
import { deriveBuyerPlaceOfSupply } from '@/lib/buyer-routing';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { cn } from '@/lib/utils';
import { getAnalyticsRouteInfo } from '@/lib/analytics-route';

interface NearestLocationResponse {
  warehouse_id: string | null;
  warehouse_name: string | null;
  location_id: string | null;
  location_name: string | null;
  distance_km: number | null;
  fallback: boolean;
}

interface OutletOption {
  location_id: string;
  name: string;
  is_default: boolean;
  city: string;
  state: string;
  pincode: string;
  formatted_address: string;
  lat: number | null;
  lng: number | null;
  warehouse_id: string;
  warehouse_name: string;
}

const BACK_BTN: React.CSSProperties = {
  width: 44,
  height: 44,
  color: 'var(--cream-800)',
};

const STICKY_HEADER: React.CSSProperties = {
  height: 'var(--header-h, 56px)',
  background: 'rgba(250, 247, 242, 0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
};

export function safeReturnTo(raw: string | null): string {
  if (!raw?.trim()) return '/buy/home';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/buy/') && !decoded.startsWith('//')) return decoded;
  } catch {
    /* ignore */
  }
  return '/buy/home';
}

function buildSelectedLocationAnalytics(location: BuyerDeliveryLocation) {
  return {
    selected_location: {
      source: location.selection_source ?? null,
      label: location.label || null,
      city: location.city || null,
      state: location.state || null,
      pincode: location.pincode || null,
      place_of_supply: location.place_of_supply ?? deriveBuyerPlaceOfSupply(location),
      routed_location_id: location.routed_location_id ?? null,
      routed_location_name: location.routed_location_name ?? null,
      warehouse_id: location.nearest_warehouse_id ?? null,
      warehouse_name: location.nearest_warehouse_name ?? null,
    },
  };
}

export interface BuyerLocationPickerBodyProps {
  returnTo: string;
  /** 'page' renders the mobile sticky header with a back button and navigates on save.
   *  'dialog' renders bare content and calls `onDone` on save instead of navigating. */
  mode: 'page' | 'dialog';
  onDone?: () => void;
}

export function BuyerLocationPickerBody({ returnTo, mode, onDone }: BuyerLocationPickerBodyProps): React.ReactNode {
  const router = useRouter();
  const posthog = usePostHog();
  const { selected, recent, setSelected } = useBuyerDelivery();
  const { data: meData, isLoading: meLoading } = useBuyerMe();
  const outlets = meData?.tenant.outlets ?? [];
  const tenantDisplayName = meData?.tenant.name ?? '';
  const returnRoutePattern = getAnalyticsRouteInfo(returnTo.split('?')[0] || '/buy/home').route_pattern;

  const [input, setInput] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loadingPred, setLoadingPred] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleInputChange(value: string) {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => void doSearch(q), 300);
  }

  async function doSearch(q: string) {
    setLoadingPred(true);
    setSuggestions([]);
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getMapsLoader().importLibrary('places') as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current,
      });
      if (mountedRef.current) setSuggestions(results);
    } catch {
      if (mountedRef.current) setSuggestions([]);
    } finally {
      if (mountedRef.current) setLoadingPred(false);
    }
  }

  function goBack(): void {
    navigateBuyerBack(router, returnTo);
  }

  function finishSelection(): void {
    if (mode === 'dialog') {
      onDone?.();
      return;
    }
    markBuyerNavigationBack();
    router.replace(returnTo);
  }

  function saveOutletSelection(outlet: OutletOption): void {
    setErr(null);
    setSaving(true);
    try {
      const previousRoutedLocationId = selected?.routed_location_id ?? null;
      const location: BuyerDeliveryLocation = {
        place_id: `outlet-${outlet.location_id}`,
        label: outlet.name,
        formatted_address: outlet.formatted_address || outlet.name,
        city: outlet.city,
        state: outlet.state,
        pincode: outlet.pincode,
        lat: outlet.lat ?? 0,
        lng: outlet.lng ?? 0,
        selection_source: 'outlet',
        place_of_supply: outlet.name,
        nearest_warehouse_id: outlet.warehouse_id,
        routed_location_id: outlet.location_id,
        routed_location_name: outlet.name,
        nearest_warehouse_name: outlet.warehouse_name,
        nearest_warehouse_distance_km: null,
        nearest_warehouse_fallback: false,
      };
      setSelected(location);
      posthog?.capture('buyer_delivery_location_selected', {
        selection_source: 'outlet',
        seller_outlet_id: outlet.location_id,
        seller_outlet_name: outlet.name,
        warehouse_id: outlet.warehouse_id,
        warehouse_name: outlet.warehouse_name,
        is_default_outlet: outlet.is_default,
        return_route: returnRoutePattern,
        tenant_id: meData?.tenant.id ?? null,
        buyer_id: meData?.buyer_id ?? null,
        ...buildSelectedLocationAnalytics(location),
      });
      if (previousRoutedLocationId !== outlet.location_id) {
        posthog?.capture('buyer_outlet_changed', {
          selection_source: 'outlet',
          previous_routed_location_id: previousRoutedLocationId,
          previous_routed_location_name: selected?.routed_location_name ?? null,
          routed_location_id: outlet.location_id,
          routed_location_name: outlet.name,
          warehouse_id: outlet.warehouse_id,
          warehouse_name: outlet.warehouse_name,
          return_route: returnRoutePattern,
          tenant_id: meData?.tenant.id ?? null,
          buyer_id: meData?.buyer_id ?? null,
          ...buildSelectedLocationAnalytics(location),
        });
      }
      finishSelection();
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedLocation(location: BuyerDeliveryLocation): Promise<void> {
    const placeOfSupply = deriveBuyerPlaceOfSupply(location);
    let routing: NearestLocationResponse | null = null;
    const previousRoutedLocationId = selected?.routed_location_id ?? null;

    try {
      const response = await apiFetch(`/api/buyer/nearest-location?lat=${location.lat}&lng=${location.lng}`);
      if (response.ok) {
        routing = await response.json() as NearestLocationResponse;
      }
    } catch {
      routing = null;
    }

    const selectedLocation: BuyerDeliveryLocation = {
      ...location,
      selection_source: 'maps',
      place_of_supply: placeOfSupply,
      nearest_warehouse_id: routing?.warehouse_id ?? null,
      routed_location_name: routing?.location_name ?? null,
      routed_location_id: routing?.location_id ?? null,
      nearest_warehouse_name: routing?.warehouse_name ?? null,
      nearest_warehouse_distance_km: routing?.distance_km ?? null,
      nearest_warehouse_fallback: routing?.fallback ?? true,
    };
    setSelected(selectedLocation);
    posthog?.capture('buyer_delivery_location_selected', {
      selection_source: 'maps',
      routed_location_id: routing?.location_id ?? null,
      routed_location_name: routing?.location_name ?? null,
      warehouse_id: routing?.warehouse_id ?? null,
      warehouse_name: routing?.warehouse_name ?? null,
      nearest_warehouse_distance_km: routing?.distance_km ?? null,
      nearest_warehouse_fallback: routing?.fallback ?? true,
      has_pincode: Boolean(location.pincode),
      state: location.state || null,
      return_route: returnRoutePattern,
      tenant_id: meData?.tenant.id ?? null,
      buyer_id: meData?.buyer_id ?? null,
      ...buildSelectedLocationAnalytics(selectedLocation),
    });
    if (previousRoutedLocationId !== (routing?.location_id ?? null)) {
      posthog?.capture('buyer_outlet_changed', {
        selection_source: 'maps',
        previous_routed_location_id: previousRoutedLocationId,
        previous_routed_location_name: selected?.routed_location_name ?? null,
        routed_location_id: routing?.location_id ?? null,
        routed_location_name: routing?.location_name ?? null,
        warehouse_id: routing?.warehouse_id ?? null,
        warehouse_name: routing?.warehouse_name ?? null,
        nearest_warehouse_distance_km: routing?.distance_km ?? null,
        nearest_warehouse_fallback: routing?.fallback ?? true,
        return_route: returnRoutePattern,
        tenant_id: meData?.tenant.id ?? null,
        buyer_id: meData?.buyer_id ?? null,
        ...buildSelectedLocationAnalytics(selectedLocation),
      });
    }
    finishSelection();
  }

  async function pickSuggestion(suggestion: google.maps.places.AutocompleteSuggestion): Promise<void> {
    setErr(null);
    setSaving(true);
    try {
      const prediction = suggestion.placePrediction;
      if (!prediction) throw new Error('No prediction');
      await getMapsLoader().importLibrary('places');
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress'] });
      sessionTokenRef.current = null;
      if (!place.location) throw new Error('No location');
      const lat = place.location.lat();
      const lng = place.location.lng();
      const components = place.addressComponents ?? [];
      const get = (type: string) => components.find((c) => c.types.includes(type));
      const label = prediction.mainText?.text || get('sublocality_level_1')?.longText || get('locality')?.longText || 'Location';
      const city = get('locality')?.longText ?? '';
      const state = get('administrative_area_level_1')?.shortText ?? '';
      const pincode = get('postal_code')?.longText ?? '';
      const location: BuyerDeliveryLocation = {
        place_id: prediction.placeId,
        label,
        formatted_address: place.formattedAddress ?? '',
        city,
        state,
        pincode,
        lat,
        lng,
      };
      await saveSelectedLocation(location);
    } catch {
      if (mountedRef.current) setErr('Could not load that place. Try another.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  function useCurrentLocation(): void {
    setErr(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErr('Location is not supported in this browser.');
      return;
    }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { Geocoder } = await getMapsLoader().importLibrary('geocoding') as google.maps.GeocodingLibrary;
          const resp = await new Geocoder().geocode({
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          const result = resp.results[0];
          if (!result) throw new Error('No geocode result');
          if (!mountedRef.current) return;
          const components = result.address_components ?? [];
          const get = (type: string) => components.find((c) => c.types.includes(type));
          const label = get('sublocality_level_1')?.long_name || get('locality')?.long_name || result.formatted_address.split(',')[0] || 'Current location';
          const city = get('locality')?.long_name ?? '';
          const state = get('administrative_area_level_1')?.short_name ?? '';
          const pincode = get('postal_code')?.long_name ?? '';
          const location: BuyerDeliveryLocation = {
            place_id: result.place_id ?? `gps-${pos.coords.latitude}-${pos.coords.longitude}`,
            label,
            formatted_address: result.formatted_address,
            city,
            state,
            pincode,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          await saveSelectedLocation(location);
        } catch {
          if (mountedRef.current) setErr('Could not resolve current location.');
        } finally {
          if (mountedRef.current) setSaving(false);
        }
      },
      () => {
        if (mountedRef.current) {
          setSaving(false);
          setErr('Location permission denied.');
        }
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  const recentPlaces = recent.filter((loc) => loc.selection_source === 'maps');

  const content = (
    <div className={mode === 'page' ? 'space-y-4 px-4 py-4 pb-[calc(var(--tab-bar)+1rem)]' : 'space-y-4'}>
      {mode === 'page' ? (
        <section className="pb-1">
          <p className="mb-0.5 font-semibold uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>
            Pickup Planning
          </p>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center  text-[var(--teal-500)]">
              <Store className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-[var(--fg-1)] mt-1" style={{ fontSize: 'var(--b-text-section)', fontFamily: 'var(--font-display)' }}>
                {tenantDisplayName ? `Select ${tenantDisplayName} outlet to order from` : 'Select outlet to order from'}
              </h2>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[12px]" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
        <div className="px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--ember-50)] text-[var(--ember-400)]">
              <Store className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-[var(--fg-1)]" style={{ fontSize: 'var(--b-text-label)' }}>Find your nearest outlet</p>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-1)' }} />

        <div className="px-4 py-3.5">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--fg-3)]">Search your area</label>
          <input
            type="search"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Area, street, landmark..."
            className="mb-3 w-full rounded-[10px] border border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-3 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--teal-500)]"
            autoComplete="street-address"
          />

          {recentPlaces.length > 0 ? (
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-3)]">Recent places</p>
              <div className="overflow-hidden rounded-[10px]" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-base)' }}>
                {recentPlaces.map((loc, index) => (
                  <React.Fragment key={loc.place_id}>
                    {index > 0 ? <div style={{ borderTop: '1px solid var(--border-1)' }} /> : null}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveSelectedLocation(loc)}
                      className="flex w-full items-start gap-3 px-3 py-3 text-left text-sm disabled:opacity-50"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[var(--fg-1)]">{loc.label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--fg-3)]">{loc.formatted_address}</span>
                      </span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : null}

          {loadingPred ? <p className="mb-2 text-xs text-[var(--fg-3)]">Searching...</p> : null}

          {suggestions.length > 0 ? (
            <div className="mb-4 overflow-hidden rounded-[10px]" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-base)' }}>
              {suggestions.map((s, i) => (
                <React.Fragment key={s.placePrediction?.placeId ?? i}>
                  {i > 0 ? <div style={{ borderTop: '1px solid var(--border-1)' }} /> : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void pickSuggestion(s)}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left text-sm disabled:opacity-50"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
                    <span className="min-w-0 flex-1 text-[var(--fg-1)]">{s.placePrediction?.text.text ?? ''}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving}
            onClick={useCurrentLocation}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--teal-500)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-semibold text-[var(--teal-500)] disabled:opacity-50"
          >
            <Navigation className="h-4 w-4" aria-hidden />
            Use current location
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px]" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
        <div className="px-4 py-3.5">
          <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--fg-3)]">Available outlets</span>
          <span className="mt-1 block truncate font-semibold text-[var(--fg-1)]" style={{ fontSize: 'var(--b-text-label)' }}>
            {selected?.selection_source === 'outlet'
              ? formatBuyerSelectedLocationLabel(selected)
              : `Choose from ${outlets.length} seller outlets`}
          </span>
        </div>

        <div style={{ borderTop: '1px solid var(--border-1)' }} />

        {meLoading ? (
          <div className="px-4 py-3.5">
            {[0, 1, 2].map((index) => (
              <div key={index} className={index > 0 ? 'mt-3' : ''}>
                <div className="animate-pulse">
                  <div className="h-4 w-40 rounded bg-cream-200" />
                  <div className="mt-2 h-3 w-56 rounded bg-cream-200" />
                </div>
              </div>
            ))}
          </div>
        ) : outlets.length > 0 ? (
          <div>
            {outlets.map((outlet, index) => {
              const selectedOutlet = selected?.routed_location_id === outlet.location_id;
              return (
                <React.Fragment key={outlet.location_id}>
                  {index > 0 ? <div style={{ borderTop: '1px solid var(--border-1)' }} /> : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveOutletSelection(outlet)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors disabled:opacity-50',
                      selectedOutlet ? 'bg-[var(--teal-50,#f0fdfa)]' : 'bg-[var(--bg-surface)]',
                    )}
                  >
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-base)]">
                      {selectedOutlet ? <Check className="h-3.5 w-3.5 text-[var(--teal-500)]" aria-hidden /> : null}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[var(--fg-1)]" style={{ fontSize: 'var(--b-text-label)' }}>{outlet.name}</span>
                      <span className="mt-1 block text-xs text-[var(--fg-3)]">
                        {outlet.formatted_address || [outlet.city, outlet.pincode].filter(Boolean).join(' · ') || outlet.warehouse_name}
                      </span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-3.5 text-sm text-[var(--fg-3)]">No outlets are available yet.</div>
        )}
      </section>

      {err ? <p className="text-center text-sm text-[var(--danger-500)]">{err}</p> : null}
    </div>
  );

  if (mode === 'dialog') return content;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)]">
      <header className="sticky top-0 z-20 flex items-center px-4" style={STICKY_HEADER}>
        <button type="button" onClick={goBack} className="flex items-center justify-center shrink-0 p-0 transition-opacity active:opacity-60" style={BACK_BTN} aria-label="Back">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1
          className="flex-1 text-center font-semibold"
          style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}
        >
          Choose outlet
        </h1>
        <div style={{ width: 36 }} />
      </header>

      {content}
    </div>
  );
}
