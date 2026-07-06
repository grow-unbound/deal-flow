import type { NextResponse } from 'next/server';
import {
  BUYER_PREVIEW_CONFIRMATION_COOKIE,
  BUYER_PREVIEW_TTL_SECONDS,
  createBuyerPreviewToken,
} from '@/lib/buyer-preview';

interface SetBuyerPreviewCookiesInput {
  tenantId: string;
  shareToken?: string | null;
  buyerId?: string | null;
  now?: number;
  requiresConfirmation?: boolean;
}

export async function setBuyerPreviewCookies(
  response: NextResponse,
  input: SetBuyerPreviewCookiesInput,
): Promise<void> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const previewToken = await createBuyerPreviewToken({
    tenantId: input.tenantId,
    shareToken: input.shareToken ?? null,
    buyerId: input.buyerId ?? null,
    now,
  });

  const cookieOptions = {
    httpOnly: true,
    path: '/',
    maxAge: BUYER_PREVIEW_TTL_SECONDS,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };

  response.cookies.set('buyer_preview', previewToken, cookieOptions);
  response.cookies.set('buyer_preview_exp', String(now + BUYER_PREVIEW_TTL_SECONDS), {
    ...cookieOptions,
    httpOnly: false,
  });
  if (input.requiresConfirmation) {
    response.cookies.set(BUYER_PREVIEW_CONFIRMATION_COOKIE, '1', {
      ...cookieOptions,
      httpOnly: false,
    });
  } else {
    response.cookies.set(BUYER_PREVIEW_CONFIRMATION_COOKIE, '', {
      ...cookieOptions,
      httpOnly: false,
      maxAge: 0,
    });
  }
}
