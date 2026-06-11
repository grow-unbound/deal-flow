import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  if (h.get('x-verified-role') !== 'seller_admin') {
    redirect('/dashboard');
  }
  return children;
}
