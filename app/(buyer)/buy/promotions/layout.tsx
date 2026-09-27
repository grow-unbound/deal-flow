import type { Metadata } from 'next';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const metadata: Metadata = storefrontPageTitle('Promotions');

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
