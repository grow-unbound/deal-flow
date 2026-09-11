import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const useBuyerMeMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: () => useBuyerMeMock(),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/components/brand/YuktiLogo', () => ({
  YuktiLogo: () => <div data-testid="logo" />,
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

const basePendingMe = {
  mode: 'pending' as const,
  tenant: { id: 't1', name: 'Acme', slug: 'acme', logo_url: null, outlets: [] },
  pending: {
    intake_submitted: false,
    is_returning_yukti_user: false,
    seller_whatsapp_number: null,
    prefill_full_name: null,
    prefill_email: null,
  },
};

describe('/onboarding page', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    replaceMock.mockReset();
    useBuyerMeMock.mockReset();
    useBuyerMeMock.mockReturnValue({ data: basePendingMe, isLoading: false });
    // Default: existing-profiles returns none; other calls can be overridden per test.
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/onboarding/existing-profiles') {
        return Promise.resolve(jsonResponse({ profiles: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  it('shows the new business-toggle copy', async () => {
    const { default: BuyerOnboardingPage } = await import('../../../app/onboarding/page');
    render(<BuyerOnboardingPage />);
    expect(await screen.findByText('I want to buy as a registered business')).toBeInTheDocument();
    expect(screen.queryByText("I'm ordering for a business")).not.toBeInTheDocument();
  });

  it('renders the ProfilePicker when existing-profiles returns rows, and autofills on selection', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/onboarding/existing-profiles') {
        return Promise.resolve(
          jsonResponse({
            profiles: [
              {
                buyer_id: 'b2',
                tenant_id: 't2',
                tenant_name: 'Other Tenant',
                business_name: 'Acme Traders',
                contact_name: 'Alice',
                phone: '9990000001',
                gstin: '29AAVIC9992H1Z0',
                is_business: true,
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const { default: BuyerOnboardingPage } = await import('../../../app/onboarding/page');
    render(<BuyerOnboardingPage />);

    expect(await screen.findByText(/We found 1 business profile/)).toBeInTheDocument();
    expect(screen.getByText('Acme Traders')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Acme Traders'));

    // Picker should be dismissed and business toggle turned on with autofilled fields.
    await waitFor(() => {
      expect(screen.queryByText(/We found 1 business profile/)).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Business name')).toHaveValue('Acme Traders');
    expect(screen.getByLabelText('GSTIN (optional)')).toHaveValue('29AAVIC9992H1Z0');
  });

  it('"None of these, start fresh" dismisses the picker and leaves the form blank', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/onboarding/existing-profiles') {
        return Promise.resolve(
          jsonResponse({
            profiles: [
              {
                buyer_id: 'b2',
                tenant_id: 't2',
                tenant_name: 'Other Tenant',
                business_name: null,
                contact_name: 'Bob',
                phone: '9990000001',
                gstin: null,
                is_business: false,
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const { default: BuyerOnboardingPage } = await import('../../../app/onboarding/page');
    render(<BuyerOnboardingPage />);

    expect(await screen.findByText(/We found 1 profile/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('None of these, start fresh'));

    await waitFor(() => {
      expect(screen.queryByText(/We found 1 profile/)).not.toBeInTheDocument();
    });
    expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('');
  });

  it('runs the document upload state machine (presign -> PUT -> confirm) and requires shop image before submit', async () => {
    const originalFetch = global.fetch;
    const putMock = vi.fn().mockResolvedValue({ ok: true });
    // @ts-expect-error test override
    global.fetch = putMock;

    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/onboarding/existing-profiles') {
        return Promise.resolve(jsonResponse({ profiles: [] }));
      }
      if (url === '/api/buyer/documents/presign') {
        return Promise.resolve(
          jsonResponse({ key: 'buyers/b1/personal/shop_image/uuid-1', upload_url: 'https://r2.example/put' }),
        );
      }
      if (url === '/api/buyer/documents/confirm') {
        return Promise.resolve(jsonResponse({ id: 'doc-1' }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const { default: BuyerOnboardingPage } = await import('../../../app/onboarding/page');
    render(<BuyerOnboardingPage />);

    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Jane Doe' } });
    fireEvent.click(screen.getByText('I want to buy as a registered business'));
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Jane Traders' } });

    const file = new File(['hello'], 'shop.png', { type: 'image/png' });
    const shopInput = document.getElementById('shop_image') as HTMLInputElement;
    fireEvent.change(shopInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/buyer/documents/presign',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(putMock).toHaveBeenCalledWith('https://r2.example/put', expect.objectContaining({ method: 'PUT' }));
    await waitFor(() => {
      expect(screen.getByText('shop.png')).toBeInTheDocument();
    });

    global.fetch = originalFetch;
  });
});
