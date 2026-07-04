'use client';

import type { FC } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIdleRoutePrefetch } from '@/hooks/useIdleRoutePrefetch';
import { Pressable } from '@/components/ui/pressable';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { useRole } from '@/hooks/useRole';
import { ROLES } from '@/constants';
import type { SellerShellFeatureAvailability } from '@/lib/server/seller-features';

export type NavFlagKey =
  | 'df_brand_product_master'
  | 'df_customer_master'
  | 'df_cohorts'
  | 'df_pricing_engine'
  | 'df_catalog_publishing'
  | 'df_buyer_app'
  | 'df_estimates'
  | 'df_sales_orders'
  | 'df_invoices'
  | 'df_tally_export'
  | 'df_integrations';

type NavFlagConstant =
  | 'BRAND_PRODUCT_MASTER'
  | 'CUSTOMER_MASTER'
  | 'COHORTS'
  | 'PRICING_ENGINE'
  | 'CATALOG_PUBLISHING'
  | 'BUYER_APP'
  | 'ESTIMATES'
  | 'SALES_ORDERS'
  | 'INVOICES'
  | 'TALLY_EXPORT'
  | 'INTEGRATIONS';

export interface NavItem {
  label: string;
  href: string;
  icon: FC<{ size?: number; className?: string }>;
  roles: Array<typeof ROLES.SELLER_ADMIN | typeof ROLES.SELLER_ASSISTANT>;
  /** PostHog flag key — item hidden when resolved flag is `false` */
  flagKey?: NavFlagKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const FLAG_KEY_TO_FEATURE: Record<NavFlagKey, NavFlagConstant> = {
  df_brand_product_master: 'BRAND_PRODUCT_MASTER',
  df_customer_master: 'CUSTOMER_MASTER',
  df_cohorts: 'COHORTS',
  df_pricing_engine: 'PRICING_ENGINE',
  df_catalog_publishing: 'CATALOG_PUBLISHING',
  df_buyer_app: 'BUYER_APP',
  df_estimates: 'ESTIMATES',
  df_sales_orders: 'SALES_ORDERS',
  df_invoices: 'INVOICES',
  df_tally_export: 'TALLY_EXPORT',
  df_integrations: 'INTEGRATIONS',
};

export const navGroups: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT] },
      { label: 'Estimates', href: '/estimates', icon: EstimatesIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT], flagKey: 'df_estimates' },
      { label: 'Sales Orders', href: '/sales-orders', icon: SalesOrdersIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT], flagKey: 'df_sales_orders' },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT], flagKey: 'df_invoices' },
      { label: 'Customers', href: '/customers', icon: BuyersIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT], flagKey: 'df_customer_master' },
      { label: 'Products', href: '/products', icon: ProductsIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT], flagKey: 'df_brand_product_master' },
    ],
  },
  {
    label: 'GROWTH',
    items: [
      { label: 'Buyer App', href: '/buyer-app', icon: BuyerAppIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_buyer_app' },
      { label: 'Campaigns', href: '/campaigns', icon: CatalogsIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_catalog_publishing' },
      { label: 'Customer Groups', href: '/customer-groups', icon: CohortsIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_cohorts' },
      { label: 'Pricelists', href: '/price-lists', icon: PriceListsIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_pricing_engine' },
      { label: 'Brands', href: '/brands', icon: BrandsIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_brand_product_master' },
      { label: 'Locations', href: '/locations', icon: LocationsIcon, roles: [ROLES.SELLER_ADMIN] },
      { label: 'Warehouses', href: '/warehouses', icon: WarehousesIcon, roles: [ROLES.SELLER_ADMIN] },
      { label: 'Categories', href: '/categories', icon: TagIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_brand_product_master' },
    ],
  },
  {
    label: 'SETUP',
    items: [
      { label: 'Settings', href: '/settings', icon: SettingsIcon, roles: [ROLES.SELLER_ADMIN] },
      { label: 'Team', href: '/settings/team', icon: TeamIcon, roles: [ROLES.SELLER_ADMIN] },
      { label: 'Integrations', href: '/settings/integrations', icon: IntegrationsIcon, roles: [ROLES.SELLER_ADMIN], flagKey: 'df_integrations' },
      { label: 'Recommendations', href: '/settings/recommendations', icon: RecommendationsIcon, roles: [ROLES.SELLER_ADMIN] },
      { label: 'Billing & Plan', href: '/settings/billing', icon: BillingIcon, roles: [ROLES.SELLER_ADMIN] },
    ],
  },
];

export interface CollectPrefetchHrefsInput {
  role: typeof ROLES.SELLER_ADMIN | typeof ROLES.SELLER_ASSISTANT;
  /** Return `false` to hide flag-gated item; `undefined` / `true` keeps it */
  getFlag: (key: NavFlagKey) => boolean | undefined;
}

const ASSISTANT_NAV_ORDER = [
  '/dashboard',
  '/estimates',
  '/sales-orders',
  '/invoices',
  '/customers',
  '/products',
] as const;

/** Pure helper for tests — mirrors sidebar prefetch href derivation from `navGroups`. */
export function collectPrefetchHrefs(
  groups: readonly NavGroup[],
  { role, getFlag }: CollectPrefetchHrefsInput
): string[] {
  function canAccessNavItem(item: NavItem): boolean {
    return item.roles.includes(role);
  }
  function isNavItemVisible(item: NavItem): boolean {
    if (!item.flagKey) return true;
    const fk = item.flagKey as keyof typeof FLAG_KEY_TO_FEATURE;
    if (!(fk in FLAG_KEY_TO_FEATURE)) return true;
    return getFlag(fk) !== false;
  }
  return groups
    .flatMap((g) => g.items)
    .filter(isNavItemVisible)
    .filter(canAccessNavItem)
    .map((item) => item.href);
}

interface SellerSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  canCollapse?: boolean;
  featureAvailability: SellerShellFeatureAvailability;
}

export function SellerSidebar({
  isCollapsed = false,
  onToggleCollapse = () => undefined,
  canCollapse = true,
  featureAvailability,
}: SellerSidebarProps) {
  const pathname = usePathname();
  const { isSellerAssistant, role } = useRole();
  const sellerRole = role === ROLES.SELLER_ADMIN || role === ROLES.SELLER_ASSISTANT ? role : null;

  function getFlag(key: NavFlagKey): boolean | undefined {
    const map: Record<NavFlagKey, boolean | undefined> = {
      df_brand_product_master: featureAvailability.brandProductMaster,
      df_customer_master: featureAvailability.customerMaster,
      df_cohorts: featureAvailability.cohorts,
      df_pricing_engine: featureAvailability.pricingEngine,
      df_catalog_publishing: featureAvailability.catalogPublishing,
      df_buyer_app: featureAvailability.buyerApp,
      df_estimates: featureAvailability.estimates,
      df_sales_orders: featureAvailability.salesOrders,
      df_invoices: featureAvailability.invoices,
      df_tally_export: featureAvailability.tallyExport,
      df_integrations: featureAvailability.integrations,
    };
    return map[key];
  }

  function isNavItemVisible(item: NavItem): boolean {
    if (!item.flagKey) return true;
    const fk = item.flagKey as keyof typeof FLAG_KEY_TO_FEATURE;
    if (!(fk in FLAG_KEY_TO_FEATURE)) return true;
    return getFlag(fk) !== false;
  }

  function canAccessNavItem(item: NavItem): boolean {
    return sellerRole != null && item.roles.includes(sellerRole);
  }

  const prefetchHrefs = sellerRole ? collectPrefetchHrefs(navGroups, { role: sellerRole, getFlag }) : [];
  useIdleRoutePrefetch(prefetchHrefs);

  function renderNavItem(item: NavItem) {
    // /settings is exact-match only — sub-pages have their own nav items in Group 3
    const active =
      pathname === item.href ||
      (item.href !== '/dashboard' &&
        item.href !== '/settings' &&
        pathname.startsWith(`${item.href}/`));
    return (
      <Pressable key={item.href} asChild haptic>
        <Link
          href={item.href}
          className={[
            'flex items-center rounded-[12px] px-3 py-2.5 text-base font-medium transition-colors duration-fast',
            isCollapsed ? 'justify-center gap-0' : 'gap-3',
            active
              ? 'bg-[rgba(181,100,47,0.09)] text-[#221E1A]'
              : 'text-[#3D3630] hover:bg-[var(--yk-hover-tint)] hover:text-[#221E1A]',
          ].join(' ')}
          title={isCollapsed ? item.label : undefined}
        >
          <item.icon size={17} className={active ? 'text-[#221E1A]' : 'text-[#3D3630]'} />
          {!isCollapsed && item.label}
        </Link>
      </Pressable>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 flex h-screen flex-col border-r border-cream-300 bg-cream-100 transition-[width] duration-base"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="relative flex h-16 shrink-0 items-center border-b border-cream-300 px-3">
        {canCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-cream-600 transition-colors duration-fast hover:bg-[var(--yk-hover-tint)] hover:text-cream-900"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        ) : null}

        {isCollapsed ? <YuktiLogo variant="app-icon" className="h-11 w-11" priority /> : null}
        {!isCollapsed && (
          <div className="min-w-0">
            <YuktiLogo variant="lockup" className="h-8 w-[138px]" priority />
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {isSellerAssistant ? (
          <div className="space-y-0.5">
            {ASSISTANT_NAV_ORDER
              .map((href) => navGroups.flatMap((group) => group.items).find((item) => item.href === href) ?? null)
              .filter((item): item is NavItem => item != null)
              .filter(isNavItemVisible)
              .filter(canAccessNavItem)
              .map((item) => renderNavItem(item))}
          </div>
        ) : (
          navGroups.map((group) => {
            const visibleItems = group.items.filter(isNavItemVisible).filter(canAccessNavItem);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                {!isCollapsed && (
                  <p className="px-3 pt-5 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8A7E74]">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">{visibleItems.map((item) => renderNavItem(item))}</div>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}

// ─── Icon functions ────────────────────────────────────────────────────────────

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
function SalesOrdersIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
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
function ProductsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function BuyerAppIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
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
function CatalogsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
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
function BrandsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
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
function ModulesIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="13 2 13 9 20 9" />
      <path d="M20 2H13L2 13l9 9 11-11V2z" />
    </svg>
  );
}
function TeamIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IntegrationsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function BillingIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function LocationsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function WarehousesIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.25V20h14V9.25" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}
function TagIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2H8a2 2 0 0 0-1.414.586l-4 4A2 2 0 0 0 2 8v4a2 2 0 0 0 .586 1.414l9 9a2 2 0 0 0 2.828 0l7-7a2 2 0 0 0 0-2.828l-9-9A2 2 0 0 0 12 2z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RecommendationsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}
