'use client';

import { ReactNode, Suspense } from 'react';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { PoweredByYuktiFooterLink } from '@/components/brand/PoweredByYukti';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';
import { useCatalogTenantContext } from '@/hooks/useCatalogTenantContext';
import { parseRequestHost } from '@/lib/storefront-host';
import { useState } from 'react';

function detectCatalogHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostKind = parseRequestHost(window.location.hostname);
  return hostKind.kind === 'reserved' && hostKind.label === 'catalog';
}

function CatalogAuthChromeFallback({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex min-h-dvh flex-col overflow-y-auto bg-cream-50">
      <main className="flex flex-1 items-center justify-center px-4 py-6 pt-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

function StandardLoginChrome({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  const { homeHref, supportHelpPrefix, supportWhatsAppDisplay, supportWhatsAppHref } =
    AUTH_LOGIN_COPY.login;

  return (
    <div className="fixed inset-0 z-10 flex min-h-dvh flex-col overflow-y-auto bg-cream-50">
      <header className="shrink-0 px-4 py-3 sm:px-6">
        <a
          href={homeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex opacity-90 transition-opacity hover:opacity-100"
          aria-label="Yukti home"
        >
          <YuktiLogo variant="lockup" className="h-8" priority />
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="shrink-0 space-y-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-caption text-cream-600">
        <p>
          {supportHelpPrefix}{' '}
          <a
            href={supportWhatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ember-400 transition-colors hover:text-ember-500"
          >
            {supportWhatsAppDisplay}
          </a>
        </p>
        <p>
          <a
            href={homeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-cream-800"
          >
            © {year} Yukti
          </a>
        </p>
      </footer>
    </div>
  );
}

function CatalogAuthChromeInner({ children }: { children: ReactNode }) {
  const { hasTenantContext, returnTo, tenantLoading } = useCatalogTenantContext();
  const year = new Date().getFullYear();
  const { homeHref, supportHelpPrefix, supportWhatsAppDisplay, supportWhatsAppHref } =
    AUTH_LOGIN_COPY.login;

  // While resolving a return_to redirect, hide the top logo to avoid a flash.
  const showTopLogo = !returnTo || (!tenantLoading && !hasTenantContext);

  return (
    <div className="fixed inset-0 z-10 flex min-h-dvh flex-col overflow-y-auto bg-cream-50">
      {showTopLogo ? (
        <header className="shrink-0 px-4 py-3 sm:px-6">
          <a
            href={homeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex opacity-90 transition-opacity hover:opacity-100"
            aria-label="Yukti home"
          >
            <YuktiLogo variant="lockup" className="h-8" priority />
          </a>
        </header>
      ) : null}

      <main className={`flex flex-1 items-center justify-center px-4 py-6 ${showTopLogo ? '' : 'pt-8'}`}>
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="shrink-0 space-y-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-caption text-cream-600">
        <p>
          {supportHelpPrefix}{' '}
          <a
            href={supportWhatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ember-400 transition-colors hover:text-ember-500"
          >
            {supportWhatsAppDisplay}
          </a>
        </p>
        {hasTenantContext ? (
          <p>
            <PoweredByYuktiFooterLink />
          </p>
        ) : (
          <p>
            <a
              href={homeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream-800"
            >
              © {year} Yukti
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}

/** Catalog-only outer chrome (login + verify on catalog host). */
export function CatalogAuthChrome({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<CatalogAuthChromeFallback>{children}</CatalogAuthChromeFallback>}>
      <CatalogAuthChromeInner>{children}</CatalogAuthChromeInner>
    </Suspense>
  );
}

function CatalogAuthPageChromeInner({ children }: { children: ReactNode }) {
  const [isCatalogHost] = useState(detectCatalogHost);

  if (isCatalogHost) {
    return <CatalogAuthChrome>{children}</CatalogAuthChrome>;
  }

  return <StandardLoginChrome>{children}</StandardLoginChrome>;
}

/** Login + verify shell: seller app chrome, or buyer catalog chrome with tenant/direct states. */
export function CatalogAuthPageChrome({ children }: { children: ReactNode }) {
  return <CatalogAuthPageChromeInner>{children}</CatalogAuthPageChromeInner>;
}
