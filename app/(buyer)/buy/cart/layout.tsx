import type { Metadata } from 'next';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const metadata: Metadata = storefrontPageTitle('Cart Details');

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
