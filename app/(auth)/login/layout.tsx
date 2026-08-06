import { ReactNode } from 'react';
import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';

export default function LoginLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  const { homeHref, supportHelpPrefix, supportWhatsAppDisplay, supportWhatsAppHref } =
    AUTH_LOGIN_COPY.login;

  return (
    <div className="fixed inset-0 z-10 flex min-h-dvh flex-col overflow-y-auto bg-cream-50">
      <header className="shrink-0 px-4 py-3 sm:px-6">
        <a
          href={homeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex opacity-90 transition-opacity hover:opacity-100"
          aria-label="Yukti home"
        >
          <YuktiLogo variant="lockup" className="h-8" priority />
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="shrink-0 space-y-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-caption text-cream-600">
        <p>
          {supportHelpPrefix}{' '}
          <a
            href={supportWhatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ember-400 transition-colors hover:text-ember-500"
          >
            {supportWhatsAppDisplay}
          </a>
        </p>
        <p>
          <a
            href={homeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-cream-800"
          >
            © {year} Yukti
          </a>
        </p>
      </footer>
    </div>
  );
}
