'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, MapPin, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getMapsLoader } from '@/lib/google-maps-loader';

export interface PlaceDetails {
  lat: number | null;
  lng: number | null;
  formatted_address: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

interface MapsAddressSearchProps {
  selectedLabel: string | null;
  onSelect: (details: PlaceDetails) => void;
}

export function MapsAddressSearch({ selectedLabel, onSelect }: MapsAddressSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingIndex, setFetchingIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSuggestions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => void doSearch(q), 350);
  }

  async function doSearch(q: string) {
    setLoading(true);
    setSuggestions([]);
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getMapsLoader().importLibrary('places') as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current,
      });
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(suggestion: google.maps.places.AutocompleteSuggestion, index: number) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;
    setFetchingIndex(index);
    try {
      await getMapsLoader().importLibrary('places');
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress'] });
      sessionTokenRef.current = null;
      if (!place.location) throw new Error('No location');
      const lat = place.location.lat();
      const lng = place.location.lng();
      const components = place.addressComponents ?? [];
      const get = (type: string) => components.find((c) => c.types.includes(type));
      const line1 = get('route')?.longText || get('establishment')?.longText || prediction.mainText?.text || '';
      const city = get('locality')?.longText ?? '';
      const state = get('administrative_area_level_1')?.shortText ?? '';
      const pincode = get('postal_code')?.longText ?? '';
      onSelect({ lat, lng, formatted_address: place.formattedAddress ?? '', line1, city, state, pincode });
      setOpen(false);
    } catch {
      // leave the picker open so the user can try another result
    } finally {
      setFetchingIndex(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MapPin size={14} className="shrink-0 text-teal-600" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-cream-900">
              {selectedLabel ?? 'Search address on Google Maps'}
            </p>
            {!selectedLabel && (
              <p className="mt-0.5 text-xs text-cream-600">
                Auto-fill address fields from a Places search
              </p>
            )}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white">
          <SheetHeader className="flex-shrink-0 border-b border-cream-300 bg-white px-[22px] py-[18px]">
            <SheetTitle className="font-display text-xl font-medium leading-[1.15] tracking-[-0.01em] text-cream-900">
              Search address
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
              <Input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="pl-8"
                placeholder="Type a place name or address…"
                autoFocus
              />
            </div>

            {loading && (
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[52px] animate-pulse rounded-[8px] bg-cream-100" />
                ))}
              </div>
            )}

            {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
              <p className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-sm text-cream-500">
                No results found.
              </p>
            )}

            {!loading && suggestions.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {suggestions.map((s, i) => (
                  <button
                    key={s.placePrediction?.placeId ?? i}
                    type="button"
                    disabled={fetchingIndex !== null}
                    onClick={() => void handleSelect(s, i)}
                    className="flex w-full items-start gap-3 rounded-[8px] px-3 py-[10px] text-left transition-colors hover:bg-cream-100 disabled:opacity-60"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-cream-500" />
                    <p className="text-sm text-cream-900">
                      {fetchingIndex === i ? 'Loading…' : (s.placePrediction?.text.text ?? '')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
