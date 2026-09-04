'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CatalogSetupChrome({
  stepLabel,
  progress,
  children,
  footer,
  containViewport = false,
}: {
  stepLabel: string;
  progress: number;
  children: React.ReactNode;
  footer: React.ReactNode;
  containViewport?: boolean;
}): React.ReactNode {
  const router = useRouter();
  useEffect(() => {
    router.prefetch('/dashboard');
  }, [router]);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-cream-50">
      <header className="flex shrink-0 items-start gap-4 border-b border-cream-200 bg-white px-4 py-3 md:px-6">
        <img src="/brand/favicon.svg" alt="" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-cream-900">Setup your first Catalog</p>
          <div className="mt-1 flex items-center gap-3">
            <p className="shrink-0 text-body-sm text-cream-600">{stepLabel}</p>
            <div className="h-1.5 min-w-[5rem] max-w-[14rem] flex-1 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full bg-teal-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link
            href="/dashboard"
            prefetch
            onPointerDown={() => router.prefetch('/dashboard')}
          >
            Exit setup
          </Link>
        </Button>
      </header>
      <main
        className={cn(
          'min-h-0 flex-1 px-4 py-6 md:px-8',
          containViewport ? 'flex flex-col overflow-hidden' : 'overflow-y-auto',
        )}
      >
        {children}
      </main>
      <footer className="flex shrink-0 items-center justify-between border-t border-cream-200 bg-white px-4 py-3 md:px-8">
        {footer}
      </footer>
    </div>
  );
}

export function CatalogSetupNav({
  onBack,
  backDisabled,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
}: {
  onBack?: () => void;
  backDisabled?: boolean;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
}): React.ReactNode {
  return (
    <>
      <Button type="button" variant="secondary" onClick={onBack} disabled={backDisabled || !onBack}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="flex items-center gap-2">
        {secondaryLabel && onSecondary ? (
          <Button type="button" variant="secondary" onClick={onSecondary} disabled={secondaryDisabled}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button type="button" onClick={onPrimary} disabled={primaryDisabled}>
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

export function CatalogSetupNavSpacer({ className }: { className?: string }): React.ReactNode {
  return <div className={cn('flex w-full items-center justify-between', className)} />;
}
