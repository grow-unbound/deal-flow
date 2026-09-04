import type { Metadata } from 'next';

/** Section titles for seller/auth/catalog surfaces (root layout adds `| Yukti`). */
export function sellerPageTitle(section: string): Metadata {
  return { title: section };
}

export const SELLER_PAGE_TITLES = {
  dashboard: 'Dashboard',
  products: 'Products',
  brands: 'Brands',
  categories: 'Categories',
  customers: 'Customers',
  customerGroups: 'Customer Groups',
  priceLists: 'Price Lists',
  campaigns: 'Campaigns',
  estimates: 'Estimates',
  salesOrders: 'Sales Orders',
  invoices: 'Invoices',
  warehouses: 'Warehouses',
  locations: 'Locations',
  settings: 'Settings',
  settingsBilling: 'Billing',
  settingsTeam: 'Team',
  settingsIntegrations: 'Integrations',
  settingsRecommendations: 'Recommendations',
  buyers: 'Buyers',
  buyerApp: 'Buyer App',
  buyerAppAccess: 'Buyer App Access',
  exports: 'Exports',
  notifications: 'Notifications',
  search: 'Search',
  catalogSetup: 'Catalog Setup',
  workspaces: 'Workspaces',
  login: 'Log in',
  signup: 'Sign up',
  verify: 'Verify',
  forgotPassword: 'Forgot Password',
  resetPassword: 'Reset Password',
  setupPassword: 'Setup Password',
  selectContext: 'Select Context',
  activate: 'Activate',
  acceptInvite: 'Accept Invite',
  verifyAccount: 'Verify Account',
} as const;
