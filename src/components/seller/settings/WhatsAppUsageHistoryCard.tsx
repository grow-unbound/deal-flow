'use client';

import { History } from 'lucide-react';

import type { WhatsAppUsageHistoryEntry } from '@/types/billing-settings';
import { SettingsSectionCard } from './SettingsSectionCard';

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function WhatsAppUsageHistoryCard({ history }: { history: WhatsAppUsageHistoryEntry[] }) {
  return (
    <SettingsSectionCard
      title="WhatsApp usage history"
      subtitle="What you've sent over the last 30 days."
      icon={History}
      footer={
        // TODO(Phase F): daily broadcast cap meter ("42 / 100 sent today")
        // lands here once app.tenant_broadcast_limits exists — not built in
        // this phase, see spec §6 point 4 / §4.7.
        <p className="text-body-sm text-cream-600">Daily send cap tracking is coming soon.</p>
      }
    >
      {history.length === 0 ? (
        <p className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-center text-body-sm text-cream-600">
          No WhatsApp activity yet. Sent messages will show up here, grouped by day.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-cream-200 text-cream-600">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Use case</th>
                <th className="py-2 pr-4 font-medium">Recipients</th>
                <th className="py-2 font-medium">Credits spent</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={`${row.date}-${row.use_case}`} className="border-b border-cream-100 last:border-0">
                  <td className="py-2 pr-4 text-cream-800">{formatDate(row.date)}</td>
                  <td className="py-2 pr-4 text-cream-800">{row.use_case}</td>
                  <td className="py-2 pr-4 text-cream-800">{row.recipient_count.toLocaleString()}</td>
                  <td className="py-2 text-cream-800">{row.credits_spent.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSectionCard>
  );
}
