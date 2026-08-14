'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { BuyerLocationPickerBody, safeReturnTo } from '@/components/buyer/layout/BuyerLocationPickerBody';

export default function BuyerLocationPage(): ReactNode {
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  return <BuyerLocationPickerBody returnTo={returnTo} mode="page" />;
}
