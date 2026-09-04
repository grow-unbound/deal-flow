import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.workspaces);

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider surface="buyer">
      <div className="min-h-dvh bg-cream-50">
        {children}
      </div>
    </ThemeProvider>
  );
}
