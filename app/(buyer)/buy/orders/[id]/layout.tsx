import type { Metadata } from 'next';
import { loadBuyerOrderTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const label = await loadBuyerOrderTitle(id);
  return storefrontPageTitle(label ?? 'Order');
}

export default function OrderDetailLayout({ children }: LayoutProps) {
  return children;
}
