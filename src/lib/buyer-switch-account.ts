import { apiPost } from '@/lib/api-fetch';
import { catalogOriginForRequest } from '@/lib/storefront-host';
import type { LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

const SESSION_CONTEXTS_KEY = 'yukti_auth_contexts';

type SwitchContextResponse = {
  contexts?: LoginOtpCandidate[];
  ref_id?: string;
  error?: string;
};

export async function redirectToBuyerAccountSelector(currentHost: string = window.location.host): Promise<void> {
  const res = await apiPost('/api/auth/switch-context', {});
  const data = (await res.json()) as SwitchContextResponse;

  if (!res.ok || !data.ref_id || !Array.isArray(data.contexts)) {
    throw new Error(data.error ?? 'No other accounts linked to this number.');
  }

  try {
    sessionStorage.setItem(SESSION_CONTEXTS_KEY, JSON.stringify(data.contexts));
  } catch {
    // Cross-origin redirects cannot rely on this; /login/select-context can
    // reload verified candidates by ref_id when sessionStorage is unavailable.
  }

  const catalogOrigin = catalogOriginForRequest(currentHost);
  window.location.assign(`${catalogOrigin}/login/select-context?ref_id=${encodeURIComponent(data.ref_id)}`);
}
