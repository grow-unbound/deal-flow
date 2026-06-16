import Image from 'next/image';
import { cn } from '@/lib/utils';

interface YuktiLogoProps {
  variant?: 'lockup' | 'stacked-lockup' | 'mark' | 'app-icon';
  theme?: 'light' | 'dark';
  className?: string;
  priority?: boolean;
}

const sources = {
  mark: {
    light: '/brand/mark-ink.svg',
    dark: '/brand/mark-white.svg',
  },
  'mark-copper': {
    light: '/brand/mark-copper.svg',
    dark: '/brand/mark-copper-lt.svg',
  },
  'app-icon': {
    light: '/brand/app-icon-dark.svg',
    dark: '/brand/app-icon-light.svg',
  },
} as const;

export function YuktiLogo({
  variant = 'lockup',
  theme = 'light',
  className,
  priority = false,
}: YuktiLogoProps) {
  if (variant === 'lockup') {
    return (
      <div
        className={cn('flex items-center gap-2.5 shrink-0', className)}
        aria-label="Yukti"
      >
        <div className="relative h-7 w-7 shrink-0">
          <Image
            src={sources['mark-copper'][theme]}
            alt=""
            fill
            unoptimized
            className="object-contain"
            priority={priority}
            aria-hidden="true"
          />
        </div>
        <span
          className={cn(
            'font-semibold leading-none tracking-[-0.01em] [font-family:var(--font-wordmark)]',
            theme === 'dark' ? 'text-cream-50' : 'text-[#221E1A]'
          )}
          style={{ fontSize: '24px' }}
        >
          Yukti
        </span>
      </div>
    );
  }

  if (variant === 'stacked-lockup') {
    return (
      <div
        className={cn('flex w-20 shrink-0 flex-col items-center', className)}
        aria-label="Yukti"
      >
        <div className="relative h-9 w-9 shrink-0">
          <Image
            src={sources['mark-copper'][theme]}
            alt=""
            fill
            unoptimized
            className="object-contain"
            priority={priority}
            aria-hidden="true"
          />
        </div>
        <span
          className={cn(
            '-mt-1 font-semibold leading-none tracking-[-0.01em] [font-family:var(--font-wordmark)]',
            theme === 'dark' ? 'text-cream-50' : 'text-[#221E1A]'
          )}
          style={{ fontSize: '20px' }}
        >
          Yukti
        </span>
      </div>
    );
  }

  const src = sources[variant][theme];

  return (
    <div
      className={cn(
        'relative block shrink-0',
        variant === 'mark' && 'h-8 w-8',
        variant === 'app-icon' && 'h-9 w-9',
        className
      )}
    >
      <Image
        src={src}
        alt="Yukti"
        fill
        unoptimized
        className="object-contain object-left"
        priority={priority}
      />
    </div>
  );
}
