'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';

const navItems = [
  { label: 'Dashboard',    href: '/dashboard',      icon: DashboardIcon,    adminOnly: false },
  { label: 'Brands',       href: '/brands',         icon: BrandsIcon,       adminOnly: false },
  { label: 'Products',     href: '/products',       icon: ProductsIcon,     adminOnly: false },
  { label: 'Customers',    href: '/customers',      icon: BuyersIcon,       adminOnly: false },
  { label: 'Cohorts',      href: '/cohorts',        icon: CohortsIcon,      adminOnly: true  },
  { label: 'Price lists',  href: '/price-lists',    icon: PriceListsIcon,   adminOnly: true  },
  { label: 'Catalogs',     href: '/catalogs',       icon: CatalogsIcon,     adminOnly: false },
  { label: 'Orders',       href: '/orders',         icon: OrdersIcon,       adminOnly: false },
  { label: 'Exports',      href: '/exports',        icon: ExportsIcon,      adminOnly: false },
  {
    label: 'Settings',
    href: '/settings',
    icon: SettingsIcon,
    adminOnly: true,
    children: [
      { label: 'Users & Roles', href: '/settings/team', icon: UsersRoundIcon, adminOnly: true },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  seller_admin: 'Seller admin',
  seller_assistant: 'Seller assistant',
  buyer_admin: 'Buyer admin',
  buyer_assistant: 'Buyer assistant',
};

export function SellerSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isSellerAdmin, role } = useRole();

  async function handleLogout() {
    await signOut();
    router.push('/login');
  }

  return (
    <aside
      className="fixed left-0 top-0 flex h-screen flex-col border-r border-cream-300 bg-cream-100"
      style={{ width: 'var(--sidebar-w)' }}
    >
      {/* Brand mark */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-cream-300 px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-teal-500">
          <span className="text-cream-50 font-display font-medium text-sm leading-none">DF</span>
        </div>
        <span className="font-display text-lg font-medium leading-none text-teal-500">DealFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.filter(item => !item.adminOnly || isSellerAdmin).map(({ label, href, icon: Icon, children }) => {
          const childActive = children?.some((item) => pathname === item.href) ?? false;
          const active =
            !childActive && (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)));
          return (
            <div key={href} className="space-y-0.5">
              <Link
                href={href}
                className={[
                  'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-body-sm font-medium transition-colors duration-fast',
                  active
                    ? 'bg-teal-500 text-cream-50'
                    : 'text-cream-800 hover:bg-cream-200 hover:text-cream-900',
                ].join(' ')}
              >
                <Icon
                  size={16}
                  className={active ? 'text-cream-50' : 'text-cream-600'}
                />
                {label}
              </Link>

              {children?.filter((item) => !item.adminOnly || isSellerAdmin).map(({ label: childLabel, href: childHref, icon: ChildIcon }) => {
                const childIsActive = pathname === childHref;
                return (
                  <Link
                    key={childHref}
                    href={childHref}
                    className={[
                      'ml-6 flex items-center gap-3 rounded-[10px] px-3 py-2 text-body-sm font-medium transition-colors duration-fast',
                      childIsActive
                        ? 'bg-teal-500 text-cream-50'
                        : 'text-cream-700 hover:bg-cream-200 hover:text-cream-900',
                    ].join(' ')}
                  >
                    <ChildIcon size={15} className={childIsActive ? 'text-cream-50' : 'text-cream-500'} />
                    {childLabel}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 px-4 py-4 mt-auto">
        <button
          onClick={handleLogout}
          className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-caption font-medium text-cream-700 transition-colors duration-fast hover:bg-cream-200 hover:text-cream-900"
        >
          <LogOut size={15} />
          Log out
        </button>
        <div className="border-t border-cream-300 pt-3">
          <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <span className="text-teal-600 font-medium text-caption uppercase">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-cream-900 truncate">
              {user?.email ?? '—'}
            </p>
            <p className="text-caption text-cream-600">{role ? ROLE_LABELS[role] : '—'}</p>
          </div>
        </div>
        </div>
      </div>
    </aside>
  );
}

// Minimal inline icons (Lucide-compatible stroke icons)
function DashboardIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function BrandsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CohortsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="12" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M12 12h2" /><path d="M14 7h-2a3 3 0 0 0-3 3" /><path d="M14 17h-2a3 3 0 0 1-3-3" />
    </svg>
  );
}
function PriceListsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function CatalogsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function OrdersIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function ExportsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function SettingsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function UsersRoundIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </svg>
  );
}
