import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { BuyerShell } from '@/components/layout/BuyerShell';
import { BuyerCartProvider } from '@/contexts/BuyerCartContext';
import { BuyerDeliveryProvider } from '@/contexts/BuyerDeliveryContext';
import { DELIVERY_COOKIE_NAME } from '@/lib/buyer-delivery-location';

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialDeliveryCookie = cookieStore.get(DELIVERY_COOKIE_NAME)?.value ?? null;

  return (
    <ThemeProvider surface="buyer">
      <BuyerCartProvider>
        <BuyerDeliveryProvider initialPayload={initialDeliveryCookie}>
          <BuyerShell>{children}</BuyerShell>
        </BuyerDeliveryProvider>
      </BuyerCartProvider>
    </ThemeProvider>
  );
}
