'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pressable } from '@/components/ui/pressable';
import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';

const tabs = [
  { label: 'Home',    href: '/buy/home',    icon: HomeIcon },
  { label: 'Catalog', href: '/buy/catalog', icon: CatalogIcon },
  { label: 'Orders',  href: '/buy/orders',  icon: OrdersIcon },
  { label: 'Profile', href: '/buy/profile', icon: ProfileIcon },
];

const DEEP_SCREENS = ['/buy/product/', '/buy/cart', '/buy/checkout'];

export function BuyerTabBar() {
  const pathname = usePathname();
  useIdleRoutePrefetch(tabs.map((tab) => tab.href));

  if (DEEP_SCREENS.some(p => pathname.startsWith(p))) return null;

  return (
    <nav
      className="sticky bottom-0 z-20 flex w-full items-stretch pb-safe"
      style={{
        height: 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px))',
        background: 'var(--cream-100)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
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
              style={{ fontSize: '10px', letterSpacing: '0.08em' }}
            >
              {label}
            </span>
          </Link>
          </Pressable>
        );
      })}
    </nav>
  );
}

function HomeIcon({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
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
