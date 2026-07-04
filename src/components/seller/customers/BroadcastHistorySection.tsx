'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWhatsAppBroadcastHistory } from '@/hooks/useWhatsAppBroadcasts';

function statusVariant(status: string): 'default' | 'teal' | 'ember' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'sending':
      return 'teal';
    case 'scheduled':
    case 'pending_review':
      return 'warning';
    case 'partially_failed':
      return 'danger';
    case 'cancelled':
      return 'default';
    default:
      return 'default'; // draft
  }
}

/**
 * Lightweight broadcast history — spec §9: "a secondary tab or collapsible
 * section on the Customers page (not a new route) listing the last ~20
 * broadcasts". Since Phase F's send pipeline doesn't exist yet, this will
 * mostly show draft/scheduled rows for now — that's expected, not a bug.
 */
export function BroadcastHistorySection() {
  const [expanded, setExpanded] = useState(false);
  const { data: broadcasts, isLoading } = useWhatsAppBroadcastHistory(expanded);

  return (
    <div className="rounded-[14px] border border-cream-300 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-cream-900">
          <Megaphone size={15} /> Recent broadcasts
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded ? (
        <div className="border-t border-cream-200 px-4 py-3">
          {isLoading ? (
            <p className="text-sm text-cream-500">Loading…</p>
          ) : !broadcasts?.length ? (
            <p className="text-sm text-cream-500">No broadcasts yet.</p>
          ) : (
            <div className="space-y-2">
              {broadcasts.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-cream-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cream-900">{b.name}</p>
                    <p className="text-xs text-cream-600">
                      {b.use_case.replace(/_/g, ' ')} · {b.estimated_recipient_count ?? 0} recipients
                    </p>
                  </div>
                  <Badge variant={statusVariant(b.status)}>{b.status.replace(/_/g, ' ')}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
