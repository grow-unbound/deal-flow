'use client';

import { MessageCircle, Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { IntegrationCatalogItem } from '@/hooks/useIntegrationsSettings';

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

interface WhatsAppConnectedCardProps {
  integration: IntegrationCatalogItem;
  isSellerAdmin: boolean;
  onDisconnect: () => void;
}

export function WhatsAppConnectedCard({ integration, isSellerAdmin, onDisconnect }: WhatsAppConnectedCardProps) {
  const ti = integration.tenant_integration!;
  const config = ti.config ?? {};
  const displayPhoneNumber = typeof config.display_phone_number === 'string' ? config.display_phone_number : null;
  const isConnected = ti.status === 'connected';

  return (
    <section className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cream-200 bg-white text-teal-700 shadow-sm">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg text-cream-900">{integration.display_name}</h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
                  isConnected
                    ? 'border-success-50 bg-success-50 text-success-700'
                    : 'border-cream-300 bg-transparent text-cream-700'
                }`}
              >
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-sm text-cream-600">
              {displayPhoneNumber ? `Sending from ${displayPhoneNumber}` : integration.description}
            </p>
          </div>
        </div>
        {isSellerAdmin ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger-700 hover:bg-danger-50 hover:text-danger-800"
            onClick={onDisconnect}
          >
            <Unplug className="h-4 w-4" />
            Disconnect
          </Button>
        ) : null}
      </header>

      <div className="space-y-3 px-5 py-5 text-sm text-cream-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Connected on</div>
            <div className="mt-1 text-cream-900">{formatDate(ti.connected_at)}</div>
          </div>
          <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">WABA ID</div>
            <div className="mt-1 truncate text-cream-900">{typeof config.waba_id === 'string' ? config.waba_id : '—'}</div>
          </div>
        </div>
        <p className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3 text-xs leading-5 text-cream-600">
          WhatsApp usage billing is managed separately in your Meta Business Manager — it's not part of your Yukti plan.
        </p>
      </div>
    </section>
  );
}
