import type { Metadata } from 'next';
import { loadBuyerEstimateTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const label = await loadBuyerEstimateTitle(id);
  return storefrontPageTitle(label ?? 'Estimate');
}

export default function EstimateDetailLayout({ children }: LayoutProps) {
  return children;
}
