'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pressable } from '@/components/ui/pressable';
import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';
import { useBuyerScrollChromeState } from '@/contexts/BuyerScrollChromeContext';
import { isBuyerChromelessRoute, isBuyerDeepRoute, normalizeBuyerPathname } from '@/lib/buyer-routes';
import { STOREFRONT } from '@/lib/storefront-paths';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useStorefrontLogin } from '@/contexts/StorefrontLoginContext';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Home', href: STOREFRONT.home, icon: CatalogIcon },
  { label: 'Orders', href: STOREFRONT.orders, icon: OrdersIcon },
  { label: 'Profile', href: STOREFRONT.profile, icon: ProfileIcon },
] as const;

export function BuyerTabBar() {
  const pathname = usePathname();
  const normalizedPath = normalizeBuyerPathname(pathname);
  const { tabBarVisible } = useBuyerScrollChromeState();
  const { data: me } = useBuyerMe();
  const { openLogin } = useStorefrontLogin();
  const isGuest = me?.mode !== 'buyer' && me?.mode !== 'preview';
  useIdleRoutePrefetch([STOREFRONT.home, STOREFRONT.orders, STOREFRONT.profile, STOREFRONT.search, STOREFRONT.location]);

  if (isBuyerDeepRoute(pathname) || isBuyerChromelessRoute(pathname)) return null;

  return (
    <nav
      aria-hidden={!tabBarVisible}
      className={cn(
        'z-20 flex w-full shrink-0 overflow-hidden border-t border-[var(--border-1)] bg-[var(--bg-base)] transition-[height] duration-300 ease-out md:hidden',
        !tabBarVisible && 'pointer-events-none border-transparent',
      )}
      style={{
        height: tabBarVisible
          ? 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))'
          : 0,
        paddingBottom: tabBarVisible ? 'env(safe-area-inset-bottom, 0px)' : 0,
      }}
    >
      <div className="flex min-h-[var(--tab-bar-h)] w-full items-stretch">
      {tabs.map(({ label, href, icon: Icon }) => {
        const internalHref = normalizeBuyerPathname(href);
        const active = normalizedPath === internalHref
          || (internalHref !== '/buy/home' && normalizedPath.startsWith(internalHref));
        const requiresAuth = href !== STOREFRONT.home;
        if (isGuest && requiresAuth) {
          return (
            <Pressable key={href} asChild haptic>
              <button
                type="button"
                onClick={openLogin}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-fast"
              >
                <Icon size={22} className="text-cream-600" />
                <span
                  className="text-eyebrow text-cream-600"
                  style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.10em' }}
                >
                  {label}
                </span>
              </button>
            </Pressable>
          );
        }
        return (
          <Pressable key={href} asChild haptic>
            <Link
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-fast"
            >
            <Icon
              size={22}
              className={active ? 'text-teal-500' : 'text-cream-600'}
            />
            <span
              className={[
                'text-eyebrow',
                active ? 'text-teal-500' : 'text-cream-600',
              ].join(' ')}
              style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.10em' }}
            >
              {label}
            </span>
          </Link>
          </Pressable>
        );
      })}
      </div>
    </nav>
  );
}

function CatalogIcon({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function OrdersIcon({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function ProfileIcon({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
