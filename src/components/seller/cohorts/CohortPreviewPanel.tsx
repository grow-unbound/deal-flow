'use client';

import { useEffect, useState, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { Skeleton } from '@/components/ui/skeleton';
import type { CohortRuleFilter } from '@/lib/zod';

interface PreviewResult {
  count: number;
  sample_names: string[];
}

interface CohortPreviewPanelProps {
  filters: CohortRuleFilter[];
}

export function CohortPreviewPanel({ filters }: CohortPreviewPanelProps) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

        const res = await fetch('/api/cohorts/preview', {
          method: 'POST',
          headers,
          body: JSON.stringify({ rules: { filters } }),
        });

        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? 'Preview failed');
          return;
        }

        const data = await res.json();
        setResult(data as PreviewResult);
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  return (
    <div className="bg-cream-100 rounded-md border border-cream-200 p-3 mt-4">
      <p className="text-caption font-medium text-cream-700 mb-2">Matching buyers</p>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-7 w-24 bg-cream-200" />
          <Skeleton className="h-4 w-48 bg-cream-200" />
        </div>
      )}

      {!loading && error && (
        <p className="text-caption text-danger-500">{error}</p>
      )}

      {!loading && !error && result !== null && (
        <>
          {result.count === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm">
              No buyers currently match these rules. You can still save and add buyers later.
            </div>
          ) : (
            <div>
              <p className="font-mono text-teal-700 font-semibold text-lg">
                {result.count} {result.count === 1 ? 'buyer' : 'buyers'} match these rules
              </p>
              {result.sample_names.length > 0 && (
                <p className="text-caption text-cream-600 mt-1">
                  e.g.{' '}
                  {result.sample_names.slice(0, 5).join(', ')}
                  {result.count > result.sample_names.length && ` and ${result.count - result.sample_names.length} more`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
