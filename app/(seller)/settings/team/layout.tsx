import type { Metadata } from 'next';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata: Metadata = sellerPageTitle(SELLER_PAGE_TITLES.settingsTeam);

export default function SettingsTeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
