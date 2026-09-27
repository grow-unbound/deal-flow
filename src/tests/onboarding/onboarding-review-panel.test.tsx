import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-fetch', () => ({
  apiPatch: vi.fn(),
}));

import { OnboardingReviewPanel } from '@/components/seller/onboarding/OnboardingReviewPanel';
import type { ImportAnomaly } from '@/lib/onboarding/types';

function renderPanel(ui: ReactElement) {
  return render(ui);
}

describe('onboarding review panel', () => {
  const rows: ImportAnomaly[] = [
    { sku: '', productName: 'Nails 10mm clips', kind: 'missing_sku', message: 'SKU missing', productId: 'p1' },
    { sku: 'NC-10MM', productName: 'Nails 10mm clips', kind: 'missing_gst', message: 'GST rate missing', productId: 'p1' },
    { sku: 'CAM-1', productName: 'Dome cam', kind: 'zero_price', message: 'Base selling rate missing', productId: 'p2' },
  ];

  it('renders a desktop table with product, issue, and prefilled SKU', () => {
    renderPanel(
      <OnboardingReviewPanel
        anomalies={rows}
        existingSkus={['taken']}
        closeMode="dismiss"
        onClose={() => undefined}
        onIgnore={() => undefined}
      />,
    );
    expect(screen.getByText('Product name')).toBeInTheDocument();
    expect(screen.getByText('Issue')).toBeInTheDocument();
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('nails-10mm-clips').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('Price')[0]).toHaveValue('');
    expect(screen.getAllByLabelText('Save').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Ignore').length).toBeGreaterThan(0);
  });
});
