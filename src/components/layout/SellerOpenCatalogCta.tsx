'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTenant } from '@/contexts/TenantContext';
import { useRole } from '@/hooks/useRole';
import { canonicalStorefrontUrl } from '@/lib/storefront-host';
import { cn } from '@/lib/utils';

interface SellerOpenCatalogCtaProps {
  className?: string;
  fullWidth?: boolean;
  sourceSurface?: 'seller_header' | 'seller_mobile_menu';
}

export function SellerOpenCatalogCta({
  className,
  fullWidth = false,
  sourceSurface = 'seller_header',
}: SellerOpenCatalogCtaProps): React.ReactNode {
  const posthog = usePostHog();
  const { currentTenant } = useTenant();
  const { isSellerAdmin, isSellerAssistant } = useRole();
  const [unpublishedOpen, setUnpublishedOpen] = useState(false);
  const slug = currentTenant?.slug ?? null;
  const live = currentTenant?.public_catalog_live === true;
  const href = slug ? canonicalStorefrontUrl(slug) : null;

  function captureClick(destination: string) {
    posthog?.capture('seller_open_catalog_clicked', {
      tenant_id: currentTenant?.id ?? null,
      role: isSellerAdmin ? 'seller_admin' : isSellerAssistant ? 'seller_assistant' : 'seller',
      destination,
      source_surface: sourceSurface,
      live,
    });
  }

  if (live && href) {
    return (
      <Button asChild variant={fullWidth ? 'primary' : 'ghost'} className={cn(fullWidth ? 'h-11 w-full justify-center rounded-xl' : 'h-9 rounded-[12px] px-3 text-cream-800 hover:text-[#221E1A]', className)}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={() => captureClick(href)}
        >
          <ExternalLink size={fullWidth ? 15 : 14} />
          Open Catalog
        </a>
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={fullWidth ? 'primary' : 'ghost'}
        className={cn(fullWidth ? 'h-11 w-full justify-center rounded-xl' : 'h-9 rounded-[12px] px-3 text-cream-800 hover:text-[#221E1A]', className)}
        onClick={() => {
          captureClick('unpublished');
          setUnpublishedOpen(true);
        }}
      >
        <ExternalLink size={fullWidth ? 15 : 14} />
        Open Catalog
      </Button>
      <AlertDialog open={unpublishedOpen} onOpenChange={setUnpublishedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Public catalog is not live</AlertDialogTitle>
            <AlertDialogDescription>
              Publish this tenant’s public catalog before sharing a storefront link. Preview impersonation is not available from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button" onClick={() => setUnpublishedOpen(false)}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
