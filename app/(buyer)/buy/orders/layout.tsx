import type { Metadata } from 'next';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const metadata: Metadata = storefrontPageTitle('Orders');

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
