'use client';

import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

interface MutationButtonProps extends ButtonProps {
  isPending?: boolean;
  pendingLabel?: string;
}

export function MutationButton({
  isPending = false,
  pendingLabel = 'Saving…',
  children,
  disabled,
  ...props
}: MutationButtonProps) {
  return (
    <Button disabled={disabled || isPending} {...props}>
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {isPending ? pendingLabel : children}
    </Button>
  );
}
