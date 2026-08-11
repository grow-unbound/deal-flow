'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Bell, ExternalLink, Home, LogOut, Menu, Package, Search, ShoppingBag, Users } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Pressable } from '@/components/ui/pressable';
import { SellerNotificationDrawer } from '@/components/layout/SellerNotificationDrawer';
import { navGroups, type NavFlagKey, type NavItem } from '@/components/layout/SellerSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useTenant } from '@/contexts/TenantContext';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';
import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';
import { ROLES } from '@/constants';
import { cn } from '@/lib/utils';
import type { SellerShellFeatureAvailability } from '@/lib/server/seller-features';

const SELLER_MOBILE_PREFETCH_HREFS = ['/dashboard', '/sales-orders', '/customers', '/products'];
const SCROLL_DELTA_THRESHOLD = 8;
const CHROME_HIDE_AFTER_PX = 48;

const FLAG_TO_AVAILABILITY: Record<NavFlagKey, keyof SellerShellFeatureAvailability> = {
  df_brand_product_master: 'brandProductMaster',
  df_customer_master: 'customerMaster',
  df_cohorts: 'cohorts',
  df_pricing_engine: 'pricingEngine',
  df_catalog_publishing: 'catalogPublishing',
  df_buyer_app: 'buyerApp',
  df_estimates: 'estimates',
  df_sales_orders: 'salesOrders',
  df_invoices: 'invoices',
  df_tally_export: 'tallyExport',
  df_integrations: 'integrations',
};

function getInitials(value: string | null | undefined) {
  const parts = (value ?? '').split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function isTransactionsPath(pathname: string) {
  return pathname.startsWith('/estimates') || pathname.startsWith('/sales-orders') || pathname.startsWith('/invoices');
}

function isSellerMobileLandingPath(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname === '/customers' ||
    pathname === '/products' ||
    pathname === '/estimates' ||
    pathname === '/sales-orders' ||
    pathname === '/invoices'
  );
}

function isSellerMobileDashboardPath(pathname: string) {
  return pathname === '/dashboard';
}

function isSellerMobileDeepPath(pathname: string) {
  return pathname !== '/search' && !isSellerMobileLandingPath(pathname);
}

function isBottomTabActive(pathname: string, href: string) {
  if (href === '/sales-orders') return isTransactionsPath(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getRouteTitle(pathname: string) {
  const [segment, maybeId, action] = pathname.split('/').filter(Boolean);
  if (!segment) return 'Seller';

  if (action === 'edit') return 'Edit';
  if (segment === 'sales-orders') return maybeId ? 'Sales Order' : 'Sales Orders';
  if (segment === 'customer-groups') return maybeId ? 'Customer Group' : 'Customer Groups';
  if (segment === 'price-lists') return maybeId ? 'Price List' : 'Price Lists';
  if (segment === 'buyer-app') return 'Buyer App';
  if (segment === 'settings') return maybeId ? maybeId.replace(/-/g, ' ') : 'Settings';
  if (segment === 'estimates') return maybeId ? 'Estimate' : 'Estimates';
  if (segment === 'invoices') return maybeId ? 'Invoice' : 'Invoices';
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function useSellerMobileChromeVisibility(enabled: boolean) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY < 4) {
        setVisible(true);
        lastScrollY = scrollY;
        return;
      }

      const delta = scrollY - lastScrollY;
      if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) return;

      if (delta > 0 && scrollY > CHROME_HIDE_AFTER_PX) {
        setVisible(false);
      } else if (delta < 0) {
        setVisible(true);
      }
      lastScrollY = scrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled, pathname]);

  return visible;
}

function filterNavItems(
  featureAvailability: SellerShellFeatureAvailability,
  role: string | null,
): Array<{ group: string; items: NavItem[] }> {
  const sellerRole = role === ROLES.SELLER_ADMIN || role === ROLES.SELLER_ASSISTANT ? role : null;
  if (!sellerRole) return [];

  return navGroups.flatMap((group) => {
    const items = group.items
      .filter((item) => item.roles.includes(sellerRole))
      .filter((item) => {
        if (!item.flagKey) return true;
        return featureAvailability[FLAG_TO_AVAILABILITY[item.flagKey]] !== false;
      });

    return items.length > 0 ? [{ group: group.label, items }] : [];
  });
}

interface SellerMobileTopbarProps {
  tenantBrandingPromise: Promise<{ tenantName: string; tenantLogoUrl: string | null }>;
  featureAvailabilityPromise: Promise<SellerShellFeatureAvailability>;
  // Set once a tab-refocus revalidation (see SellerShell) resolves — takes
  // priority over the SSR-streamed promise without re-suspending this subtree.
  tenantBrandingOverride?: { tenantName: string; tenantLogoUrl: string | null };
  featureAvailabilityOverride?: SellerShellFeatureAvailability;
}

export function SellerMobileTopbar({
  tenantBrandingPromise,
  featureAvailabilityPromise,
  tenantBrandingOverride,
  featureAvailabilityOverride,
}: SellerMobileTopbarProps) {
  const streamedTenantBranding = use(tenantBrandingPromise);
  const streamedFeatureAvailability = use(featureAvailabilityPromise);
  const tenantBranding = tenantBrandingOverride ?? streamedTenantBranding;
  const featureAvailability = featureAvailabilityOverride ?? streamedFeatureAvailability;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount } = useSellerRealtimeContext();
  const { user, signOut } = useAuth();
  const { currentTenant } = useTenant();
  const { role, isSellerAdmin, isSellerAssistant } = useRole();
  const posthog = usePostHog();
  const pathname = usePathname();
  const router = useRouter();
  const tenantName = tenantBranding.tenantName || currentTenant?.business_name || 'Tenant';
  const userName = user?.displayName ?? user?.email ?? 'Team member';
  const userEmail = user?.email ?? '—';
  const roleLabel = isSellerAdmin ? 'Admin' : isSellerAssistant ? 'Assistant' : 'Seller';
  const nav = useMemo(() => filterNavItems(featureAvailability, role), [featureAvailability, role]);
  const isDashboard = isSellerMobileDashboardPath(pathname);
  const isDeep = isSellerMobileDeepPath(pathname);
  const chromeVisible = useSellerMobileChromeVisibility(isDeep);

  const drawer = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetContent side="left" className="w-[min(88vw,23rem)] bg-cream-50 p-0 md:hidden" showCloseButton>
        <SheetHeader className="px-4 pb-4 pt-5">
          <SheetTitle className="sr-only">Seller navigation</SheetTitle>
          <div className="flex items-center gap-3 pr-8">
            <Avatar size="lg" className="h-12 w-12">
              {tenantBranding.tenantLogoUrl ? <AvatarImage src={tenantBranding.tenantLogoUrl} alt={tenantName} /> : null}
              <AvatarFallback>{getInitials(userName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-5 text-cream-950">{userName}</p>
              <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-cream-600">
                {roleLabel} · {tenantName}
              </p>
              <p className="mt-1 truncate text-xs text-cream-600">{userEmail}</p>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="px-3 py-3">
          <Button asChild variant="primary" className="mb-3 h-11 w-full justify-center rounded-xl">
            <a
              href="/api/buyer/preview/launch"
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                posthog?.capture('seller_open_buyer_app_clicked', {
                  tenant_id: currentTenant?.id ?? null,
                  role: isSellerAdmin ? 'seller_admin' : isSellerAssistant ? 'seller_assistant' : 'seller',
                  destination: '/api/buyer/preview/launch',
                  source_surface: 'seller_mobile_menu',
                });
              }}
            >
              <ExternalLink size={15} />
              Open Buyer App
            </a>
          </Button>

          <nav className="space-y-4">
            {nav.map((group) => (
              <section key={group.group}>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">
                  {group.group}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                    return (
                      <Pressable key={item.href} asChild haptic>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            'flex h-11 items-center gap-3 rounded-xl px-3 text-[var(--b-text-body)]',
                            active
                              ? 'bg-[rgba(181,100,47,0.12)] font-semibold text-cream-950'
                              : 'font-medium text-cream-800 active:bg-cream-100',
                          )}
                        >
                          <item.icon size={17} className={active ? 'text-ember-500' : undefined} />
                          <span>{item.label}</span>
                        </Link>
                      </Pressable>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </SheetBody>

        <div className="border-t border-cream-200 p-3">
          <Button
            variant="ghost"
            className="h-11 w-full justify-start rounded-xl text-cream-900"
            onClick={() => void signOut()}
            haptic
          >
            <LogOut size={16} />
            Logout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <>
      {isDashboard ? (
        <header className="border-b border-transparent bg-[var(--bg-surface)] px-5 pb-2 pt-6 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-white text-cream-900"
              aria-label="Open seller navigation"
            >
              <Menu size={18} strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1">
              <p
                className="font-semibold uppercase text-cream-700"
                style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}
              >
                Seller cockpit
              </p>
              <h1
                className="mt-1.5 font-semibold leading-[0.96] text-cream-900"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page-sm)', letterSpacing: '-0.022em' }}
              >
                Dashboard
              </h1>
              <p className="mt-1.5 max-w-[30rem] font-medium leading-5 text-cream-500" style={{ fontSize: 'var(--b-text-sub)', letterSpacing: '-0.01em' }}>
                {tenantName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-white text-cream-900"
              aria-label="Notifications"
            >
              <Bell size={17} strokeWidth={2} />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-ember-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>
      ) : null}

      {isDeep ? (
        <header
          className={cn(
            'sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-cream-300 bg-cream-50/95 px-3 backdrop-blur-md transition-transform duration-300 md:hidden',
            !chromeVisible && '-translate-y-full',
          )}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] p-0 text-[var(--fg-2)] transition-colors active:bg-[var(--cream-100)]"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <p
            className="min-w-0 flex-1 truncate text-center font-semibold capitalize leading-tight text-cream-900"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-header)', letterSpacing: '-0.01em' }}
          >
            {getRouteTitle(pathname)}
          </p>
          <span className="h-10 w-10 shrink-0" aria-hidden />
        </header>
      ) : null}

      {drawer}

      <SellerNotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}

const bottomTabs = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Transactions', href: '/invoices', icon: ShoppingBag },
  { label: 'Search', href: '/search', icon: Search, center: true },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Products', href: '/products', icon: Package },
];

export function SellerMobileBottomTabs() {
  const pathname = usePathname();
  const visible = useSellerMobileChromeVisibility(isSellerMobileLandingPath(pathname));
  useIdleRoutePrefetch(SELLER_MOBILE_PREFETCH_HREFS);

  if (!isSellerMobileLandingPath(pathname)) return null;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex h-[calc(60px+env(safe-area-inset-bottom,0px))] border-t border-cream-300 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md transition-transform duration-300 md:hidden',
        !visible && 'translate-y-full',
      )}
      aria-label="Seller mobile navigation"
    >
      <div className="grid min-h-[60px] w-full grid-cols-5 items-stretch">
        {bottomTabs.map((tab) => {
          const active = isBottomTabActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Pressable key={tab.href} asChild haptic>
              <Link href={tab.href} className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-center">
                <span
                  className={cn(
                    'flex items-center justify-center',
                    tab.center
                      ? 'h-10 w-10 rounded-full bg-cream-900 text-white shadow-sm'
                      : active
                        ? 'text-ember-500'
                        : 'text-cream-600',
                  )}
                >
                  <Icon size={tab.center ? 19 : 21} strokeWidth={2} />
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[11px] font-semibold leading-tight tracking-0',
                    active ? 'text-ember-500' : 'text-cream-600',
                    tab.center && 'text-cream-700',
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </Pressable>
          );
        })}
      </div>
    </nav>
  );
}
