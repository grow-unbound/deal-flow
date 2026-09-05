'use client';

import Link from 'next/link';
import { ArrowRight, Box, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { useTenant } from '@/contexts/TenantContext';
import { CANONICAL_STOREFRONT_SUFFIX } from '@/lib/storefront-host';

export function CatalogUnpublishedIntercept(): React.ReactNode {
  return (
    <Card className="mb-5 border-cream-800 bg-cream-900" data-testid="catalog-onboarding-intercept">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-cream-700 bg-cream-800 text-cream-50">
          <Box className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-h4 font-semibold text-cream-50">Your storefront isn't live yet</p>
          <p className="mt-1 text-body-sm text-cream-400">Get a shareable catalog link in a few minutes.</p>
        </div>
        <Button asChild variant="accent" className="shrink-0">
          <Link href="/setup/catalog">
            Set it up
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function CatalogLiveShareCard(): React.ReactNode {
  const { currentTenant } = useTenant();
  const slug = currentTenant?.slug ?? '';
  const href = currentTenant?.storefront_url ?? (slug ? `https://${slug}.${CANONICAL_STOREFRONT_SUFFIX}` : '');
  const host = slug ? `${slug}.${CANONICAL_STOREFRONT_SUFFIX}` : '';

  async function copyLink() {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      toast.success('Catalog link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  return (
    <Card className="mb-5" data-testid="catalog-live-share-card">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill label="Live" tone="success" />
            <p className="truncate font-mono text-body-sm text-cream-800">{host}</p>
          </div>
        </div>
        <Button type="button" variant="accent" onClick={() => void copyLink()}>
          <Copy className="h-4 w-4" />
          Share your link
        </Button>
      </CardContent>
    </Card>
  );
}
