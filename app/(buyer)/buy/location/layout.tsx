import type { Metadata } from 'next';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const metadata: Metadata = storefrontPageTitle('Location');

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
