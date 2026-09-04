import type { Metadata } from 'next';
import { loadBuyerInvoiceTitle } from '@/lib/server/buyer-page-titles';
import { storefrontPageTitle } from '@/lib/server/storefront-metadata';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const label = await loadBuyerInvoiceTitle(id);
  return storefrontPageTitle(label ?? 'Invoice');
}

export default function InvoiceDetailLayout({ children }: LayoutProps) {
  return children;
}
