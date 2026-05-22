import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
