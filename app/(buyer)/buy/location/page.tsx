'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, MapPin, Navigation } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { markBuyerNavigationBack } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';

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
  const [predictions, setPredictions] = React.useState<Array<{ description: string; place_id: string }>>([]);
  const [loadingPred, setLoadingPred] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (input.trim().length < 2) {
      setPredictions([]);
      return;
    }
    const t = setTimeout(() => {
      setLoadingPred(true);
      apiFetch(`/api/buyer/places/autocomplete?input=${encodeURIComponent(input.trim())}`)
        .then((r) => r.json() as Promise<{ predictions?: Array<{ description: string; place_id: string }> }>)
        .then((d) => setPredictions(d.predictions ?? []))
        .catch(() => setPredictions([]))
        .finally(() => setLoadingPred(false));
    }, 220);
    return () => clearTimeout(t);
  }, [input]);

  function goBack(): void {
    markBuyerNavigationBack();
    router.back();
  }

  async function pickPlace(placeId: string): Promise<void> {
    setErr(null);
    setSaving(true);
    try {
      const r = await apiFetch(`/api/buyer/places/details?place_id=${encodeURIComponent(placeId)}`);
      const data = (await r.json()) as { location?: BuyerDeliveryLocation; error?: string };
      if (!r.ok || !data.location) {
        throw new Error(data.error ?? 'Failed to load place');
      }
      setSelected(data.location);
      markBuyerNavigationBack();
      router.replace(returnTo);
    } catch {
      setErr('Could not load that place. Try another.');
    } finally {
      setSaving(false);
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
        const latlng = `${pos.coords.latitude},${pos.coords.longitude}`;
        try {
          const r = await apiFetch(`/api/buyer/places/reverse-geocode?latlng=${encodeURIComponent(latlng)}`);
          const data = (await r.json()) as { location?: BuyerDeliveryLocation; error?: string };
          if (!r.ok || !data.location) {
            throw new Error(data.error ?? 'Reverse geocode failed');
          }
          setSelected(data.location);
          markBuyerNavigationBack();
          router.replace(returnTo);
        } catch {
          setErr('Could not resolve current location.');
        } finally {
          setSaving(false);
        }
      },
      () => {
        setSaving(false);
        setErr('Location permission denied.');
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col bg-[var(--bg-base)] px-4 py-4 pb-[var(--tab-bar)]">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-2)]"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-[var(--font-display)] text-lg font-semibold text-[var(--fg-1)]">Delivery location</h1>
      </header>

      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--fg-3)]">Search address</label>
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Area, street, landmark…"
        className="mb-3 w-full rounded-xl border border-[var(--border-1)] bg-[var(--bg-recessed)] px-3 py-3 text-sm text-[var(--fg-1)] outline-none focus:border-[var(--teal-500)]"
        autoComplete="street-address"
      />

      {loadingPred ? <p className="mb-2 text-xs text-[var(--fg-3)]">Searching…</p> : null}

      <ul className="mb-6 space-y-1">
        {predictions.map((p) => (
          <li key={p.place_id}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void pickPlace(p.place_id)}
              className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2.5 text-left text-sm text-[var(--fg-1)] hover:border-[var(--border-1)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
              <span>{p.description}</span>
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
                  onClick={() => {
                    setSelected(loc);
                    markBuyerNavigationBack();
                    router.replace(returnTo);
                  }}
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
