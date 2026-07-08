'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, LandingTable } from '@/components/seller/layout';
import { RecommendationsTableIconButton } from './RecommendationsTableIconButton';

export interface BundleSuggestion {
  id: string;
  suggested_name: string | null;
  category_ids: string[];
  category_names: string[];
  avg_co_occurrence: number;
  confidence_score: number;
  status: string;
  computed_at: string;
}

interface BundleSuggestionsInboxProps {
  initialSuggestions: BundleSuggestion[];
  onBundleCreated?: (bundleId: string) => void;
}

type SignalChip = 'All signals' | 'High (80%+)' | 'Medium (50–79%)' | 'Low (<50%)';
type SuggestionSort = 'Confidence (high → low)' | 'Co-occurrence (high → low)' | 'Name (A → Z)';

const SIGNAL_CHIPS: SignalChip[] = ['All signals', 'High (80%+)', 'Medium (50–79%)', 'Low (<50%)'];
const SORT_OPTIONS: SuggestionSort[] = [
  'Confidence (high → low)',
  'Co-occurrence (high → low)',
  'Name (A → Z)',
];

function confidenceBand(score: number): SignalChip {
  const pct = score * 100;
  if (pct >= 80) return 'High (80%+)';
  if (pct >= 50) return 'Medium (50–79%)';
  return 'Low (<50%)';
}

function suggestionLabel(s: BundleSuggestion): string {
  return s.suggested_name ?? s.category_names.join(' + ');
}

export function BundleSuggestionsInbox({ initialSuggestions, onBundleCreated }: BundleSuggestionsInboxProps) {
  const [suggestions, setSuggestions] = useState<BundleSuggestion[]>(initialSuggestions);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<SignalChip>('All signals');
  const [sortBy, setSortBy] = useState<SuggestionSort>('Confidence (high → low)');

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = suggestions.filter((s) => {
      const label = suggestionLabel(s).toLowerCase();
      const matchesSearch =
        !q
        || label.includes(q)
        || s.category_names.some((name) => name.toLowerCase().includes(q));
      const matchesBand = activeChip === 'All signals' || confidenceBand(s.confidence_score) === activeChip;
      return matchesSearch && matchesBand;
    });

    const sorted = [...filtered];
    if (sortBy === 'Name (A → Z)') {
      sorted.sort((a, b) => suggestionLabel(a).localeCompare(suggestionLabel(b)));
    } else if (sortBy === 'Co-occurrence (high → low)') {
      sorted.sort((a, b) => b.avg_co_occurrence - a.avg_co_occurrence);
    } else {
      sorted.sort((a, b) => b.confidence_score - a.confidence_score);
    }
    return sorted;
  }, [activeChip, search, sortBy, suggestions]);

  async function review(id: string, status: 'accepted' | 'rejected', name?: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/tenant/reco/bundle-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');

      setSuggestions((prev) => prev.filter((s) => s.id !== id));

      if (status === 'accepted') {
        toast.success('Bundle created successfully');
        onBundleCreated?.(json.bundle_id);
      } else {
        toast.success('Suggestion dismissed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update suggestion';
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={28} strokeWidth={1.5} />}
        heading="No pending suggestions"
        description="Bundle suggestions appear after enough order data has been collected (30+ days)."
      />
    );
  }

  return (
    <div>
      <FilterBar
        count={`Showing ${filteredSuggestions.length} of ${suggestions.length} suggestions`}
        searchPlaceholder="Search suggestions or categories…"
        chips={SIGNAL_CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as SignalChip)}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as SuggestionSort)}
      />

      <LandingTable
        tableMinWidth={960}
        columns={[
          { label: 'Suggested bundle', minWidth: 240, maxWidth: 320, className: 'px-5' },
          { label: 'Categories', className: 'px-5' },
          { label: 'Signal', align: 'right', minWidth: 180, maxWidth: 220, className: 'px-5' },
          { label: 'Actions', align: 'right', width: 100, className: 'px-5' },
        ]}
      >
        {filteredSuggestions.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-5 py-16 text-center text-base text-cream-500">
              No suggestions match your filters.
            </td>
          </tr>
        ) : (
          filteredSuggestions.map((s) => (
            <tr
              key={s.id}
              className="border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            >
              <td className="px-5 py-3.5 align-middle text-base font-medium text-cream-900">
                {suggestionLabel(s)}
              </td>
              <td className="px-5 py-3.5 align-middle">
                <div className="flex flex-wrap gap-1.5">
                  {s.category_names.map((name, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-5 py-3.5 text-right align-middle text-base text-cream-700">
                <span className="font-mono tabular-nums">{s.avg_co_occurrence}</span> orders
                <span className="mx-1.5 text-cream-400">·</span>
                <span className="font-mono tabular-nums">{Math.round(s.confidence_score * 100)}%</span>
              </td>
              <td className="px-5 py-3.5 text-right align-middle">
                <div className="flex items-center justify-end gap-1">
                  <RecommendationsTableIconButton
                    label="Create bundle"
                    className="text-cream-600 hover:text-teal-600"
                    disabled={busy === s.id}
                    onClick={() => review(s.id, 'accepted', s.suggested_name ?? undefined)}
                  >
                    <CheckCircle2 size={14} />
                  </RecommendationsTableIconButton>
                  <RecommendationsTableIconButton
                    label="Dismiss"
                    className="text-cream-600 hover:text-cream-900"
                    disabled={busy === s.id}
                    onClick={() => review(s.id, 'rejected')}
                  >
                    <XCircle size={14} />
                  </RecommendationsTableIconButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </LandingTable>
    </div>
  );
}
