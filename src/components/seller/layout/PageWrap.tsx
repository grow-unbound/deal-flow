import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageWrapProps {
  children: ReactNode;
  className?: string;
}

export function PageWrap({ children, className }: PageWrapProps) {
  return <div className={cn('mx-auto w-full max-w-[1920px] px-4 py-4 md:px-6 md:py-4', className)}>{children}</div>;
}
