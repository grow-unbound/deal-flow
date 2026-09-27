'use client';

import { useMemo } from 'react';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useRole } from '@/hooks/useRole';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { SELLER_ROUTES } from '@/lib/seller-routes';
import { WorkspaceTabs, type WorkspaceTab } from './WorkspaceTabs';

export function SellerSalesWorkspaceTabs() {
  const estimatesFlag = useFlagState('ESTIMATES');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const invoicesFlag = useFlagState('INVOICES');
  const { data: settings } = useTenantSettings();
  const features = settings?.modules.orders.features;

  const tabs = useMemo<WorkspaceTab[]>(() => {
    if (!features || estimatesFlag === undefined || salesOrdersFlag === undefined || invoicesFlag === undefined) return [];
    const configuredTabs: Array<WorkspaceTab & { enabled: boolean }> = [
      {
        label: 'Invoices',
        href: SELLER_ROUTES.sales.invoices,
        match: (pathname) => pathname.startsWith(SELLER_ROUTES.sales.invoices) || pathname.startsWith('/invoices'),
        enabled: invoicesFlag !== false && features.invoices !== false,
      },
      {
        label: 'Orders',
        href: SELLER_ROUTES.sales.orders,
        match: (pathname) => pathname.startsWith(SELLER_ROUTES.sales.orders) || pathname.startsWith('/sales-orders'),
        enabled: salesOrdersFlag !== false && features.sales_orders !== false,
      },
      {
        label: 'Estimates',
        href: SELLER_ROUTES.sales.estimates,
        match: (pathname) => pathname.startsWith(SELLER_ROUTES.sales.estimates) || pathname.startsWith('/estimates'),
        enabled: estimatesFlag !== false && features.enquiries !== false,
      },
    ];
    return configuredTabs.filter((tab) => tab.enabled);
  }, [estimatesFlag, features, invoicesFlag, salesOrdersFlag]);

  return <WorkspaceTabs tabs={tabs} />;
}

export function SellerProductsWorkspaceTabs() {
  const { isSellerAssistant } = useRole();
  const tabs: WorkspaceTab[] = [
    { label: 'Products', href: SELLER_ROUTES.products.root, match: (pathname) => pathname === SELLER_ROUTES.products.root || pathname.startsWith('/products/') && !pathname.startsWith('/products/brands') && !pathname.startsWith('/products/categories') },
    ...(isSellerAssistant ? [] : [
      { label: 'Brands', href: SELLER_ROUTES.products.brands, match: (pathname: string) => pathname.startsWith(SELLER_ROUTES.products.brands) || pathname.startsWith('/brands') },
      { label: 'Categories', href: SELLER_ROUTES.products.categories, match: (pathname: string) => pathname.startsWith(SELLER_ROUTES.products.categories) || pathname.startsWith('/categories') },
    ]),
  ];

  return <WorkspaceTabs tabs={tabs} />;
}

export function SellerBusinessWorkspaceTabs() {
  return (
    <WorkspaceTabs
      tabs={[
        { label: 'Branches', href: SELLER_ROUTES.business.branches, match: (pathname) => pathname.startsWith(SELLER_ROUTES.business.branches) || pathname.startsWith('/locations') },
        { label: 'Warehouses', href: SELLER_ROUTES.business.warehouses, match: (pathname) => pathname.startsWith(SELLER_ROUTES.business.warehouses) || pathname.startsWith('/warehouses') },
        { label: 'Team', href: SELLER_ROUTES.business.team, match: (pathname) => pathname.startsWith(SELLER_ROUTES.business.team) || pathname.startsWith('/settings/team') },
      ]}
    />
  );
}

export function SellerSettingsWorkspaceTabs() {
  return (
    <WorkspaceTabs
      tabs={[
        { label: 'General', href: SELLER_ROUTES.settings.general, match: (pathname) => pathname === SELLER_ROUTES.settings.general },
        { label: 'Integrations', href: SELLER_ROUTES.settings.integrations },
        { label: 'Billing', href: SELLER_ROUTES.settings.billing },
      ]}
    />
  );
}
