import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { BuyerShell } from '@/components/layout/BuyerShell';

export default function BuyerLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider surface="buyer">
      <BuyerShell>{children}</BuyerShell>
    </ThemeProvider>
  );
}
