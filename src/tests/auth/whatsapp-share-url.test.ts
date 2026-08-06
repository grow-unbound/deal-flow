import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInformSellerMessage,
  buildWhatsAppChatUrl,
  buildWhatsAppShareUrl,
  openWhatsAppShare,
  toWhatsAppSharePrefill,
} from '@/constants/auth-login-copy';

const toastMessage = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessage(...args),
  },
}));

describe('WhatsApp share URL encoding', () => {
  beforeEach(() => {
    toastMessage.mockReset();
  });

  it('keeps the full inform-seller draft in the text param (including apostrophes)', () => {
    const message = buildInformSellerMessage({
      signupLink: 'https://example.com/signup',
    });
    const url = buildWhatsAppShareUrl(message);

    expect(url).toContain('%27');
    expect(url).not.toMatch(/[?&]text=[^#]*'/);

    const text = new URL(url).searchParams.get('text');
    expect(text).toBe(message);
    expect(text).toContain("I'd like to order from you through Yukti");
    expect(text).toContain('Seller signup: https://example.com/signup');
    expect(text).toContain("Let me know once it's ready!");
  });

  it('strips https schemes for share prefill so WA does not collapse to the URL only', () => {
    const message = buildInformSellerMessage({
      signupLink: 'https://example.com/signup',
    });
    const prefill = toWhatsAppSharePrefill(message);

    expect(prefill).not.toContain('https://');
    expect(prefill).toContain('Seller signup: example.com/signup');
    expect(prefill).toContain("I'd like to order from you through Yukti");
    expect(prefill).toContain("Let me know once it's ready!");
  });

  it('copies the canonical https message and opens a scheme-stripped prefill', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const openedHrefs: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          openedHrefs.push(anchor.href);
        };
      }
      return el;
    }) as typeof document.createElement);

    const message = buildInformSellerMessage({
      signupLink: 'https://example.com/signup',
    });
    openWhatsAppShare(message);

    expect(writeText).toHaveBeenCalledWith(message);
    expect(openedHrefs[0]).toBeTruthy();
    const text = new URL(openedHrefs[0]!).searchParams.get('text') ?? '';
    expect(text).not.toContain('https://');
    expect(text).toContain('Seller signup: example.com/signup');
    expect(text).toContain("I'd like to order from you through Yukti");

    await vi.waitFor(() => {
      expect(toastMessage).toHaveBeenCalled();
    });
  });

  it('encodes chat URLs with a 91-prefixed phone and full text', () => {
    const message = "I'd like access — please enable me.";
    const url = buildWhatsAppChatUrl('9876500000', message);

    expect(url).toContain('phone=919876500000');
    expect(new URL(url).searchParams.get('text')).toBe(message);
    expect(url).toContain('%27');
  });
});
