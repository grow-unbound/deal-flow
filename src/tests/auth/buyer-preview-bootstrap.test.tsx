import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BuyerPreviewBootstrap } from '@/components/layout/BuyerPreviewBootstrap';
import { BUYER_PREVIEW_CONFIRMATION_COOKIE } from '@/lib/buyer-preview';

describe('BuyerPreviewBootstrap', () => {
  const originalClose = window.close;

  beforeEach(() => {
    document.cookie = 'buyer_preview_exp=9999999999; path=/';
    document.cookie = `${BUYER_PREVIEW_CONFIRMATION_COOKIE}=1; path=/`;
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    document.cookie = 'buyer_preview_exp=; Max-Age=0; path=/';
    document.cookie = `${BUYER_PREVIEW_CONFIRMATION_COOKIE}=; Max-Age=0; path=/`;
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: originalClose,
    });
  });

  it('shows the preview confirmation gate in the buyer app and dismisses it on continue', async () => {
    render(
      <BuyerPreviewBootstrap>
        <div>Buyer app content</div>
      </BuyerPreviewBootstrap>,
    );

    expect(screen.getByText('Preview mode')).toBeInTheDocument();
    expect(
      screen.getByText(
        "You don't have a buyer account here yet. You can browse the catalog, but won't be able to place orders until a seller adds you as a buyer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.queryByText('Preview mode')).not.toBeInTheDocument();
    });
    expect(document.cookie).not.toContain(BUYER_PREVIEW_CONFIRMATION_COOKIE);
  });
});
