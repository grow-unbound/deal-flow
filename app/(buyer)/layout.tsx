import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { BuyerShell } from '@/components/layout/BuyerShell';
import { BuyerCartProvider } from '@/contexts/BuyerCartContext';

export default function BuyerLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider surface="buyer">
      <BuyerCartProvider>
        <BuyerShell>{children}</BuyerShell>
      </BuyerCartProvider>
    </ThemeProvider>
  );
}
