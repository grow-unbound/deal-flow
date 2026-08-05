import { formatWhatsappDestination } from '@/lib/phone';

export const AUTH_LOGIN_COPY = {
  login: {
    welcomeTitle: 'Welcome to Yukti',
    welcomeSubtitle:
      'Browse catalogs, place orders, track invoices, and manage sales, all in one place',
    landingBody: 'Enter your registered mobile number to get a WhatsApp OTP',
    emailBody: 'Sign in with your email and password',
    loginWithEmail: 'Login with Email',
    loginWithMobileOtp: 'Login with mobile OTP',
    sendOtp: 'Send OTP',
    sendingOtp: 'Sending OTP…',
    verifyOtp: 'Verify OTP',
    verifyingOtp: 'Verifying…',
    signIn: 'Sign in',
    signInLoading: 'Signing in…',
    forgotPassword: 'Forgot password?',
    createSellerAccount: 'New distributor? Create seller account',
    tryDifferentNumber: 'Try a different number',
    requestAccess: 'Request Access',
    informSeller: 'Inform your Seller',
    changeNumber: 'Change number',
    resendOtp: 'Resend OTP',
    backToLogin: 'Back to login',
    homeHref: 'https://useyukti.in',
    supportWhatsAppDisplay: '+91-9490744841',
    supportWhatsAppHref: 'https://wa.me/919490744841',
    supportHelpPrefix: 'Need help logging in? WhatsApp Support:',
    buyerInsteadPrefix: 'Buying from a distributor instead?',
    buyerInsteadCta: 'Let them know about Yukti',
  },
  resolution: {
    unregistered: {
      title: "We couldn't find your number",
      lines: [
        'Yukti works through a registered seller',
        'If you sell to other businesses, create your seller account below',
        "If you're trying to order from a business you work with, ask them to add you as a buyer",
      ],
    },
    sellerDisabled: {
      title: ({ sellerName }: { sellerName: string }) =>
        `Your account is not enabled by ${sellerName} for catalog access and ordering`,
      body: 'Ask them to enable your access.',
    },
    buyerDisabled: {
      title: ({ sellerName }: { sellerName: string }) =>
        `Your buyer profile with ${sellerName} is not enabled for catalog access and ordering`,
      body: 'Ask them to enable your access.',
    },
    chooseAccount: {
      title: 'Choose an account',
      body: ({ sellerName }: { sellerName: string }) =>
        `This number is linked to multiple buyer profiles with ${sellerName}. Pick one to continue.`,
    },
    chooseBusiness: {
      title: 'Choose a business',
      body: 'This number is linked to buyer accounts with multiple sellers. Select which one you’d like to open.',
    },
    previewMode: {
      title: 'Preview mode',
      body:
        "You don't have a buyer account here yet. You can browse the catalog, but won't be able to place orders until a seller adds you as a buyer.",
      continue: 'Continue',
      cancel: 'Cancel',
    },
  },
} as const;

export function buildRequestAccessMessage({
  sellerName,
  buyerName,
}: {
  sellerName: string;
  buyerName?: string | null;
}): string {
  const buyerLabel = buyerName?.trim() || 'the buyer';
  return [
    `Hi ${sellerName}, I'd like to get access to the Yukti buyer-app to view your catalog and place orders.`,
    "Can you please confirm once you've enabled my access.",
    `- ${buyerLabel}`,
  ].join(' ');
}

export function buildInformSellerMessage({
  signupLink,
}: {
  signupLink: string;
  /** @deprecated unused — kept for call-site compatibility */
  sellerName?: string;
  /** @deprecated unused — kept for call-site compatibility */
  buyerName?: string | null;
}): string {
  return [
    'Hi,',
    '',
    "I'd like to order from you through Yukti, but I don't have access yet.",
    'Yukti is a simple app for managing your catalog, pricing, and orders with buyers like me.',
    '',
    'Could you create your seller account and add me as a buyer, so I can browse your catalog and order?',
    '',
    `Seller signup: ${signupLink}`,
    '',
    "Let me know once it's ready!",
  ].join('\n');
}

/**
 * Build a WhatsApp click-to-chat / share URL.
 *
 * IMPORTANT: Do not use encodeURIComponent alone for the text param — it leaves
 * apostrophes (`'`) unescaped. Many mobile OS / WhatsApp intent parsers truncate
 * the query at the first raw `'`. URLSearchParams encodes `'` as %27.
 */
function buildWhatsAppSendUrl(params: { phone?: string; text: string }): string {
  const url = new URL(params.phone ? 'https://api.whatsapp.com/send' : 'https://wa.me/');
  if (params.phone) {
    url.searchParams.set('phone', params.phone);
  }
  url.searchParams.set('text', params.text);
  return url.toString();
}

export function buildWhatsAppChatUrl(phoneNumber: string, message: string): string {
  return buildWhatsAppSendUrl({
    phone: formatWhatsappDestination(phoneNumber),
    text: message,
  });
}

export function buildWhatsAppShareUrl(message: string): string {
  return buildWhatsAppSendUrl({ text: message });
}

/**
 * WhatsApp's no-recipient share path (contact picker) collapses any `text` that
 * contains an `https://` URL down to that URL alone — which is why Inform Seller
 * only showed the signup link. Strip schemes for the prefill; keep the real
 * https URL on the clipboard for paste.
 */
export function toWhatsAppSharePrefill(message: string): string {
  return message.replace(/https?:\/\//gi, '');
}

export function openWhatsAppShare(message: string): void {
  void navigator.clipboard?.writeText(message).catch(() => undefined);

  const href = buildWhatsAppShareUrl(toWhatsAppSharePrefill(message));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Soft fallback if WA still strips body on some clients
  void import('sonner').then(({ toast }) => {
    toast.message('Full message copied', {
      description: 'If WhatsApp shows only the link, paste into the chat.',
      duration: 6000,
    });
  });
}
