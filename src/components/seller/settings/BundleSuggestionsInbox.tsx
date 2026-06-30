'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

export function BundleSuggestionsInbox({ initialSuggestions, onBundleCreated }: BundleSuggestionsInboxProps) {
  const [suggestions, setSuggestions] = useState<BundleSuggestion[]>(initialSuggestions);
  const [busy, setBusy] = useState<string | null>(null);

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
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update suggestion');
    } finally {
      setBusy(null);
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-cream-200 bg-cream-50 px-5 py-10 text-center">
        <p className="text-sm font-medium text-cream-600">No pending suggestions</p>
        <p className="mt-1 text-xs text-cream-400">
          Bundle suggestions appear after enough order data has been collected (30+ days).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="rounded-xl border border-cream-200 bg-white p-4 shadow-xs"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-cream-900 text-sm">
                {s.suggested_name ?? s.category_names.join(' + ')}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {s.category_names.map((name, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-cream-500">
                Co-occurred in{' '}
                <span className="font-medium text-cream-700">{s.avg_co_occurrence} orders</span>
                {' · '}
                <span className="font-medium text-cream-700">
                  {Math.round(s.confidence_score * 100)}% confidence
                </span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => review(s.id, 'accepted', s.suggested_name ?? undefined)}
              disabled={busy === s.id}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Create Bundle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => review(s.id, 'rejected')}
              disabled={busy === s.id}
              className="gap-1.5 text-cream-500 hover:text-cream-700"
            >
              <XCircle className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
