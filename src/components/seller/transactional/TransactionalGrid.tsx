import type { ReactNode } from 'react';

export interface TransactionalGridProps {
  left: ReactNode;
  right: ReactNode;
}

export function TransactionalGrid({ left, right }: TransactionalGridProps) {
  return (
    <div className="mt-4 grid grid-cols-[1fr_380px] items-start gap-5">
      <div className="flex min-w-0 flex-col gap-3">{left}</div>
      <div className="flex min-w-0 flex-col gap-3">{right}</div>
    </div>
  );
}
