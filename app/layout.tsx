import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { TenantProvider } from '@/contexts/TenantContext';
import { PostHogProvider } from '@/components/providers/PostHogProvider';

export const metadata: Metadata = {
  title: 'DealFlow — Distributor Command Center',
  description: 'Manage multibrand catalogs, publish cohort pricing, capture orders.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>
          <AuthProvider>
            <TenantProvider>{children}</TenantProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
