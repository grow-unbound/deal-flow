import { normalizeIndianPhone } from '@/lib/phone';

export const AUTH_LOGIN_COPY = {
  login: {
    landingBody: 'Enter your mobile number to get a WhatsApp OTP.',
    emailBody: 'Sign in with your email and password.',
    loginWithEmail: 'Login with Email',
    loginWithMobileOtp: 'Login with mobile OTP',
    sendOtp: 'Send OTP',
    sendingOtp: 'Sending OTP…',
    verifyOtp: 'Verify OTP',
    verifyingOtp: 'Verifying…',
    signIn: 'Sign in',
    signInLoading: 'Signing in…',
    forgotPassword: 'Forgot password?',
    createSellerAccount: 'Create seller account',
    tryDifferentNumber: 'Try a different number',
    requestAccess: 'Request Access',
    informSeller: 'Inform your Seller',
    changeNumber: 'Change number',
    resendOtp: 'Resend OTP',
    backToLogin: 'Back to login',
  },
  resolution: {
    unregistered: {
      title: "We couldn't find your number.",
      lines: [
        'Yukti works through a registered seller.',
        'If you sell to other businesses, create your seller account below.',
        "If you're trying to order from a business you work with, ask them to add you as a buyer.",
      ],
    },
    sellerDisabled: {
      title: ({ sellerName }: { sellerName: string }) =>
        `Your account is not enabled by ${sellerName} for catalog access and ordering.`,
      body: 'Ask them to enable your access.',
    },
    buyerDisabled: {
      title: ({ sellerName }: { sellerName: string }) =>
        `Your buyer profile with ${sellerName} is not enabled for catalog access and ordering.`,
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
  sellerName,
  signupLink,
  buyerName,
}: {
  sellerName: string;
  signupLink: string;
  buyerName?: string | null;
}): string {
  const buyerLabel = buyerName?.trim() || 'your buyer';
  return [
    `Hi ${sellerName},`,
    '',
    'I tried to place an order on Yukti, but I could not find your buyer access yet.',
    'Please create your seller account and add me as a buyer so I can order from your catalog.',
    '',
    `Seller signup: ${signupLink}`,
    '',
    'Once it is set up, please reply here so I can continue.',
    '',
    `- ${buyerLabel}.`,
  ].join('\n');
}

export function buildWhatsAppChatUrl(phoneNumber: string, message: string): string {
  const normalized = normalizeIndianPhone(phoneNumber);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
