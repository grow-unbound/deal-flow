import { YuktiLogo } from '@/components/brand/YuktiLogo';
import { AUTH_LOGIN_COPY } from '@/constants/auth-login-copy';
import { cn } from '@/lib/utils';

interface PoweredByYuktiProps {
  className?: string;
  /** When set, wraps the row in a link to the Yukti marketing site. */
  href?: string;
}

export function PoweredByYukti({ className, href }: PoweredByYuktiProps) {
  const row = (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 text-caption text-cream-500',
        className,
      )}
    >
      <span>Powered by</span>
      <YuktiLogo variant="mark-copper" className="h-4 w-4" priority={false} />
      <span className="font-medium text-cream-600">Yukti</span>
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex transition-opacity hover:opacity-80"
      >
        {row}
      </a>
    );
  }

  return row;
}

export function PoweredByYuktiFooterLink({ className }: { className?: string }) {
  return <PoweredByYukti href={AUTH_LOGIN_COPY.login.homeHref} className={className} />;
}
