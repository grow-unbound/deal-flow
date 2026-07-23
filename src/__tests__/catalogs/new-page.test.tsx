import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/auth/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/seller/catalogs/CatalogComposer', () => ({
  CatalogComposer: ({ mode, catalogId }: { mode: string; catalogId?: string }) => (
    <div>
      Catalog composer {mode} {catalogId ?? ''}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-99' }),
}));

import NewCatalogPage from '../../../archived/app-seller-routes/campaigns/new/page';
import EditCatalogPage from '../../../archived/app-seller-routes/campaigns/edit/page';

describe('catalog composer routes', () => {
  it('renders the new catalog composer route', () => {
    render(<NewCatalogPage />);
    expect(screen.getByText(/Catalog composer create/i)).toBeInTheDocument();
  });

  it('renders the edit catalog composer route', () => {
    render(<EditCatalogPage />);
    expect(screen.getByText(/Catalog composer edit cat-99/i)).toBeInTheDocument();
  });
});
