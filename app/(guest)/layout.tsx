import { ReactNode } from 'react';

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-page)' }}
    >
      <div className="max-w-lg mx-auto">
        {children}
      </div>
    </div>
  );
}
