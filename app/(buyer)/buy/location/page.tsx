'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, MapPin, Navigation } from 'lucide-react';
import { getMapsLoader } from '@/lib/google-maps-loader';
import { markBuyerNavigationBack } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';
import { apiFetch } from '@/lib/api-fetch';
import { deriveBuyerPlaceOfSupply } from '@/lib/buyer-routing';

interface NearestLocationResponse {
  warehouse_id: string | null;
  location_id: string | null;
  name: string | null;
  distance_km: number | null;
  fallback: boolean;
}

function safeReturnTo(raw: string | null): string {
  if (!raw?.trim()) return '/buy/catalog';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/buy/') && !decoded.startsWith('//')) return decoded;
  } catch {
    /* ignore */
  }
  return '/buy/catalog';
}

export default function BuyerLocationPage(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const { recent, setSelected } = useBuyerDelivery();

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
    if (q.length < 2) { setSuggestions([]); return; }
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
    markBuyerNavigationBack();
    router.back();
  }

  async function saveSelectedLocation(location: BuyerDeliveryLocation): Promise<void> {
    const placeOfSupply = deriveBuyerPlaceOfSupply(location);
    let routing: NearestLocationResponse | null = null;

    try {
      const response = await apiFetch(`/api/buyer/nearest-location?lat=${location.lat}&lng=${location.lng}`);
      if (response.ok) {
        routing = await response.json() as NearestLocationResponse;
      }
    } catch {
      routing = null;
    }

    setSelected({
      ...location,
      place_of_supply: placeOfSupply,
      nearest_warehouse_id: routing?.warehouse_id ?? null,
      routed_location_id: routing?.location_id ?? null,
      nearest_warehouse_name: routing?.name ?? null,
      nearest_warehouse_distance_km: routing?.distance_km ?? null,
      nearest_warehouse_fallback: routing?.fallback ?? true,
    });
    markBuyerNavigationBack();
    router.replace(returnTo);
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

  return (
    <div className="flex min-h-[50dvh] flex-col bg-[var(--bg-base)] px-4 py-4 pb-[var(--tab-bar)]">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[var(--fg-2)]"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-semibold text-[var(--fg-1)]" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)' }}>Delivery location</h1>
      </header>

      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--fg-3)]">Search address</label>
      <input
        type="search"
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="Area, street, landmark…"
        className="mb-3 w-full rounded-xl border border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-3 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--teal-500)]"
        autoComplete="street-address"
      />

      {loadingPred ? <p className="mb-2 text-xs text-[var(--fg-3)]">Searching…</p> : null}

      <ul className="mb-6 space-y-1">
        {suggestions.map((s, i) => (
          <li key={s.placePrediction?.placeId ?? i}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void pickSuggestion(s)}
              className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2.5 text-left text-sm text-[var(--fg-1)] hover:border-[var(--border-1)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
              <span>{s.placePrediction?.text.text ?? ''}</span>
            </button>
          </li>
        ))}
      </ul>

      {recent.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-3)]">Recent</h2>
          <ul className="space-y-1">
            {recent.map((loc) => (
              <li key={loc.place_id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSelectedLocation(loc)}
                  className="flex w-full flex-col rounded-lg border border-[var(--border-1)] bg-[var(--bg-surface)] px-3 py-2 text-left text-sm disabled:opacity-50"
                >
                  <span className="font-medium text-[var(--fg-1)]">{loc.label}</span>
                  <span className="text-xs text-[var(--fg-3)]">{loc.formatted_address}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={useCurrentLocation}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--teal-500)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-semibold text-[var(--teal-500)] disabled:opacity-50"
      >
        <Navigation className="h-4 w-4" aria-hidden />
        Use current location
      </button>

      {err ? <p className="mt-4 text-center text-sm text-[var(--danger-500)]">{err}</p> : null}
    </div>
  );
}
