import type { Metadata } from 'next';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata: Metadata = sellerPageTitle(SELLER_PAGE_TITLES.notifications);

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
