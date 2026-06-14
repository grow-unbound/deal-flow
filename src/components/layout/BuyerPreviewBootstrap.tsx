'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BUYER_PREVIEW_QUERY_PARAM,
} from '@/lib/buyer-preview';
import {
  clearStoredBuyerPreviewToken,
  setStoredBuyerPreviewToken,
} from '@/lib/auth-session';

export function BuyerPreviewBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewToken = searchParams.get(BUYER_PREVIEW_QUERY_PARAM);
  const [ready, setReady] = useState(previewToken === null);
  const processedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!previewToken) {
      processedTokenRef.current = null;
      setReady(true);
      return;
    }

    if (processedTokenRef.current === previewToken) {
      return;
    }

    processedTokenRef.current = previewToken;
    setReady(false);
    setStoredBuyerPreviewToken(previewToken);

    const params = new URLSearchParams(searchParams.toString());
    params.delete(BUYER_PREVIEW_QUERY_PARAM);
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, previewToken, router, searchParams]);

  useEffect(() => {
    if (pathname.startsWith('/login')) {
      clearStoredBuyerPreviewToken();
    }
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-surface)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
