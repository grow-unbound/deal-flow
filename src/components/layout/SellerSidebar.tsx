'use client';

import type { FC } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Link as LinkIcon,
  LogOut,
  MapPin,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useRole } from '@/hooks/useRole';
export type NavFlagKey =
  | 'df_brand_product_master'
  | 'df_customer_master'
  | 'df_cohorts'
  | 'df_pricing_engine'
  | 'df_catalog_publishing'
  | 'df_estimates'
  | 'df_sales_orders'
  | 'df_invoices'
  | 'df_tally_export';

type NavFlagConstant =
  | 'BRAND_PRODUCT_MASTER'
  | 'CUSTOMER_MASTER'
  | 'COHORTS'
  | 'PRICING_ENGINE'
  | 'CATALOG_PUBLISHING'
  | 'ESTIMATES'
  | 'SALES_ORDERS'
  | 'INVOICES'
  | 'TALLY_EXPORT';

export interface NavItem {
  label: string;
  href: string;
  icon: FC<{ size?: number; className?: string }>;
  adminOnly: boolean;
  /** PostHog flag key — item hidden when resolved flag is `false` */
  flagKey?: NavFlagKey;
  children?: NavItem[];
}

export interface NavGroup {
  label: 'OPERATIONS' | 'CUSTOMERS' | 'CATALOG' | 'ADMIN';
  items: NavItem[];
}

const FLAG_KEY_TO_FEATURE: Record<NavFlagKey, NavFlagConstant> = {
  df_brand_product_master: 'BRAND_PRODUCT_MASTER',
  df_customer_master: 'CUSTOMER_MASTER',
  df_cohorts: 'COHORTS',
  df_pricing_engine: 'PRICING_ENGINE',
  df_catalog_publishing: 'CATALOG_PUBLISHING',
  df_estimates: 'ESTIMATES',
  df_sales_orders: 'SALES_ORDERS',
  df_invoices: 'INVOICES',
  df_tally_export: 'TALLY_EXPORT',
};

export const navGroups: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon, adminOnly: false },
      { label: 'Estimates', href: '/estimates', icon: EstimatesIcon, adminOnly: false, flagKey: 'df_estimates' },
      { label: 'Sales Orders', href: '/sales-orders', icon: SalesOrdersIcon, adminOnly: false, flagKey: 'df_sales_orders' },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIcon, adminOnly: false, flagKey: 'df_invoices' },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { label: 'Customers', href: '/customers', icon: BuyersIcon, adminOnly: false, flagKey: 'df_customer_master' },
      { label: 'Cohorts', href: '/cohorts', icon: CohortsIcon, adminOnly: true, flagKey: 'df_cohorts' },
    ],
  },
  {
    label: 'CATALOG',
    items: [
      { label: 'Catalogs', href: '/catalogs', icon: CatalogsIcon, adminOnly: false, flagKey: 'df_catalog_publishing' },
      { label: 'Price Lists', href: '/price-lists', icon: PriceListsIcon, adminOnly: true, flagKey: 'df_pricing_engine' },
      { label: 'Products', href: '/products', icon: ProductsIcon, adminOnly: false, flagKey: 'df_brand_product_master' },
      { label: 'Brands', href: '/brands', icon: BrandsIcon, adminOnly: false, flagKey: 'df_brand_product_master' },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { label: 'Exports', href: '/exports', icon: ExportsIcon, adminOnly: false, flagKey: 'df_tally_export' },
      {
        label: 'Settings',
        href: '/settings',
        icon: SettingsIcon,
        adminOnly: true,
        children: [
          { label: 'Team', href: '/settings/team', icon: Users as FC<{ size?: number; className?: string }>, adminOnly: true },
          { label: 'Modules', href: '/settings/modules', icon: Zap as FC<{ size?: number; className?: string }>, adminOnly: true },
          { label: 'Locations', href: '/settings/locations', icon: MapPin as FC<{ size?: number; className?: string }>, adminOnly: true },
          {
            label: 'Integrations',
            href: '/settings/integrations',
            icon: LinkIcon as FC<{ size?: number; className?: string }>,
            adminOnly: true,
          },
          {
            label: 'Billing & Plan',
            href: '/settings/billing',
            icon: CreditCard as FC<{ size?: number; className?: string }>,
            adminOnly: true,
          },
        ],
      },
    ],
  },
];

export interface CollectPrefetchHrefsInput {
  isSellerAdmin: boolean;
  /** Return `false` to hide flag-gated item; `undefined` / `true` keeps it */
  getFlag: (key: NavFlagKey) => boolean | undefined;
}

/** Pure helper for tests — mirrors sidebar prefetch href derivation from `navGroups`. */
export function collectPrefetchHrefs(
  groups: readonly NavGroup[],
  { isSellerAdmin, getFlag }: CollectPrefetchHrefsInput
): string[] {
  function isNavItemVisible(item: NavItem): boolean {
    if (!item.flagKey) return true;
    const fk = item.flagKey as keyof typeof FLAG_KEY_TO_FEATURE;
    if (!(fk in FLAG_KEY_TO_FEATURE)) return true;
    return getFlag(fk) !== false;
  }

  return groups
    .flatMap((g) => g.items)
    .filter(isNavItemVisible)
    .filter((item) => !item.adminOnly || isSellerAdmin)
    .flatMap((item) => [
      item.href,
      ...(item.children?.filter((child) => !child.adminOnly || isSellerAdmin).map((child) => child.href) ?? []),
    ]);
}

const SETTINGS_SUBMENU_LS_KEY = 'df_sidebar_settings_expanded';

const ROLE_LABELS: Record<string, string> = {
  seller_admin: 'Seller admin',
  seller_assistant: 'Seller assistant',
  buyer_admin: 'Buyer admin',
  buyer_assistant: 'Buyer assistant',
};

interface SellerSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  canCollapse?: boolean;
}

export function SellerSidebar({
  isCollapsed = false,
  onToggleCollapse = () => undefined,
  canCollapse = true,
}: SellerSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { currentTenant } = useTenant();
  const { isSellerAdmin, role } = useRole();
  const isUnderSettingsRoute = pathname === '/settings' || pathname.startsWith('/settings/');
  const [settingsSubmenuOpen, setSettingsSubmenuOpen] = useState(true);

  useEffect(() => {
    if (isUnderSettingsRoute) {
      setSettingsSubmenuOpen(true);
      return;
    }
    try {
      const raw = localStorage.getItem(SETTINGS_SUBMENU_LS_KEY);
      if (raw === 'true') setSettingsSubmenuOpen(true);
      else if (raw === 'false') setSettingsSubmenuOpen(false);
    } catch {
      // ignore
    }
  }, [pathname, isUnderSettingsRoute]);
  const brandProductFlag = useFlagState('BRAND_PRODUCT_MASTER');
  const customerMasterFlag = useFlagState('CUSTOMER_MASTER');
  const cohortsFlag = useFlagState('COHORTS');
  const pricingEngineFlag = useFlagState('PRICING_ENGINE');
  const catalogPublishingFlag = useFlagState('CATALOG_PUBLISHING');
  const estimatesFlag = useFlagState('ESTIMATES');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const invoicesFlag = useFlagState('INVOICES');
  const tallyExportFlag = useFlagState('TALLY_EXPORT');

  function getFlag(key: NavFlagKey): boolean | undefined {
    const map: Record<NavFlagKey, boolean | undefined> = {
      df_brand_product_master: brandProductFlag,
      df_customer_master: customerMasterFlag,
      df_cohorts: cohortsFlag,
      df_pricing_engine: pricingEngineFlag,
      df_catalog_publishing: catalogPublishingFlag,
      df_estimates: estimatesFlag,
      df_sales_orders: salesOrdersFlag,
      df_invoices: invoicesFlag,
      df_tally_export: tallyExportFlag,
    };
    return map[key];
  }

  function isNavItemVisible(item: NavItem): boolean {
    if (!item.flagKey) return true;
    const fk = item.flagKey as keyof typeof FLAG_KEY_TO_FEATURE;
    if (!(fk in FLAG_KEY_TO_FEATURE)) return true;
    return getFlag(fk) !== false;
  }

  const prefetchHrefs = collectPrefetchHrefs(navGroups, { isSellerAdmin, getFlag });

  useIdleRoutePrefetch(prefetchHrefs);

  async function handleLogout() {
    await signOut();
    router.push('/login');
  }

  function renderNavItem(item: NavItem) {
    const visibleChildren = item.children?.filter((c) => !c.adminOnly || isSellerAdmin) ?? [];
    const isSettingsGroup = item.href === '/settings' && visibleChildren.length > 0;

    if (isSettingsGroup) {
      const childActive = visibleChildren.some((c) => pathname === c.href);
      const parentActive = pathname === '/settings' && !childActive;
      const showChildren = !isCollapsed && settingsSubmenuOpen;

      return (
        <div key={item.href} className="space-y-0.5">
          <div
            className={[
              'flex items-center rounded-[12px] text-body-sm font-medium transition-colors duration-fast',
              parentActive ? 'bg-teal-500 text-cream-50' : 'text-cream-800',
            ].join(' ')}
          >
            <Link
              href={item.href}
              className={[
                'flex min-w-0 flex-1 items-center px-3 py-2.5 transition-colors duration-fast',
                isCollapsed ? 'justify-center gap-0' : 'gap-3',
                parentActive ? '' : 'hover:bg-cream-200 hover:text-cream-900',
              ].join(' ')}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon size={16} className={parentActive ? 'text-cream-50' : 'text-cream-600'} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
            {!isCollapsed ? (
              <button
                type="button"
                className={[
                  'mr-1 shrink-0 rounded-md p-1.5 transition-colors duration-fast',
                  parentActive
                    ? 'text-cream-50 hover:bg-teal-600/80'
                    : 'text-cream-600 hover:bg-cream-200 hover:text-cream-900',
                ].join(' ')}
                aria-expanded={settingsSubmenuOpen}
                aria-label={settingsSubmenuOpen ? 'Collapse settings sections' : 'Expand settings sections'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSettingsSubmenuOpen((prev) => {
                    const next = !prev;
                    try {
                      localStorage.setItem(SETTINGS_SUBMENU_LS_KEY, String(next));
                    } catch {
                      // ignore
                    }
                    return next;
                  });
                }}
              >
                {settingsSubmenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : null}
          </div>

          {showChildren
            ? visibleChildren.map(({ label: childLabel, href: childHref, icon: ChildIcon }) => {
                const childIsActive = pathname === childHref;
                return (
                  <Link
                    key={childHref}
                    href={childHref}
                    className={[
                      'ml-6 flex items-center gap-3 rounded-[10px] px-3 py-2 text-body-sm font-medium transition-colors duration-fast',
                      childIsActive ? 'bg-teal-500 text-cream-50' : 'text-cream-700 hover:bg-cream-200 hover:text-cream-900',
                    ].join(' ')}
                  >
                    <ChildIcon size={15} className={childIsActive ? 'text-cream-50' : 'text-cream-500'} />
                    {childLabel}
                  </Link>
                );
              })
            : null}
        </div>
      );
    }

    const childActive = item.children?.some((c) => pathname === c.href) ?? false;
    const active =
      !childActive &&
      (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)));
    return (
      <div key={item.href} className="space-y-0.5">
        <Link
          href={item.href}
          className={[
            'flex items-center rounded-[12px] px-3 py-2.5 text-body-sm font-medium transition-colors duration-fast',
            isCollapsed ? 'justify-center gap-0' : 'gap-3',
            active ? 'bg-teal-500 text-cream-50' : 'text-cream-800 hover:bg-cream-200 hover:text-cream-900',
          ].join(' ')}
          title={isCollapsed ? item.label : undefined}
        >
          <item.icon size={16} className={active ? 'text-cream-50' : 'text-cream-600'} />
          {!isCollapsed && item.label}
        </Link>

        {!isCollapsed &&
          item.children
            ?.filter((c) => !c.adminOnly || isSellerAdmin)
            .map(({ label: childLabel, href: childHref, icon: ChildIcon }) => {
              const childIsActive = pathname === childHref;
              return (
                <Link
                  key={childHref}
                  href={childHref}
                  className={[
                    'ml-6 flex items-center gap-3 rounded-[10px] px-3 py-2 text-body-sm font-medium transition-colors duration-fast',
                    childIsActive ? 'bg-teal-500 text-cream-50' : 'text-cream-700 hover:bg-cream-200 hover:text-cream-900',
                  ].join(' ')}
                >
                  <ChildIcon size={15} className={childIsActive ? 'text-cream-50' : 'text-cream-500'} />
                  {childLabel}
                </Link>
              );
            })}
      </div>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 flex h-screen flex-col border-r border-cream-300 bg-cream-100 transition-[width] duration-base"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="relative flex h-16 shrink-0 items-center border-b border-cream-300 px-4">
        {canCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute right-2 top-2 rounded-md p-1 text-cream-600 transition-colors duration-fast hover:bg-cream-200 hover:text-cream-900"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        ) : null}

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-teal-500">
          <span className="text-cream-50 font-display font-medium text-sm leading-none">DF</span>
        </div>
        {!isCollapsed && (
          <div className="min-w-0 pl-2.5">
            <p className="truncate font-display text-lg font-medium leading-[1.05] text-teal-500">DealFlow</p>
            <p className="mt-0.5 truncate text-caption text-cream-600">{currentTenant?.business_name ?? 'Tenant'}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const visibleItems = group.items
            .filter(isNavItemVisible)
            .filter((item) => !item.adminOnly || isSellerAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              {!isCollapsed && (
                <p className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">{visibleItems.map((item) => renderNavItem(item))}</div>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 px-4 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="mb-3 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-body-sm font-medium text-cream-800 transition-colors duration-fast hover:bg-cream-200 hover:text-cream-900"
          title={isCollapsed ? 'Log out' : undefined}
        >
          <LogOut size={16} className="text-cream-600" />
          {!isCollapsed && 'Log out'}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100">
            <span className="text-caption font-medium uppercase text-teal-600">
              {(user?.displayName ?? user?.email)?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-cream-900">{user?.displayName ?? user?.email ?? '—'}</p>
              <p className="text-caption text-cream-600">{role ? ROLE_LABELS[role] : '—'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function DashboardIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function BrandsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function ProductsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function BuyersIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CohortsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="12" r="3" />
      <circle cx="17" cy="7" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M12 12h2" />
      <path d="M14 7h-2a3 3 0 0 0-3 3" />
      <path d="M14 17h-2a3 3 0 0 1-3-3" />
    </svg>
  );
}
function PriceListsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function CatalogsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
/** ClipboardCheck — clipboard with tick */
function SalesOrdersIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function EstimatesIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}
/** Receipt with ₹ */
function ReceiptIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2" />
      <path d="M8 10h5a2 2 0 1 0 0-4H8v8" />
      <path d="M8 14h6" />
      <text x="12" y="11" fill="currentColor" fontSize="7" fontWeight="700" textAnchor="middle" stroke="none">
        ₹
      </text>
    </svg>
  );
}
function ExportsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function SettingsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
