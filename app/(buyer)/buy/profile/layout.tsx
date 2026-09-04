import type { Metadata } from 'next';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

export const metadata: Metadata = storefrontPageTitle('Profile');

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
