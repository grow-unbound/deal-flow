import type { Metadata } from 'next';
import { Baloo_2, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { TenantProvider } from '@/contexts/TenantContext';
import { PostHogProvider } from '@/components/providers/PostHogProvider';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

const baloo2 = Baloo_2({
  subsets: ['latin'],
  variable: '--font-wordmark',
  weight: ['600'],
});

export const metadata: Metadata = {
  title: 'yukti — Distributor Command Center',
  description: 'Manage multibrand catalogs, publish cohort pricing, capture orders.',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/app-icon-dark.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/brand/favicon.svg',
    apple: '/brand/app-icon-light.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${baloo2.variable}`}>
      <body>
        <PostHogProvider>
          <ReactQueryProvider>
            <AuthProvider>
              <TenantProvider>{children}</TenantProvider>
            </AuthProvider>
          </ReactQueryProvider>
        </PostHogProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
