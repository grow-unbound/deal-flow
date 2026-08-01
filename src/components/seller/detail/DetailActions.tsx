import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface DetailActionItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface DetailActionsProps {
  /** Primary/accent-styled CTAs — rendered inline, unchanged. */
  inline?: ReactNode;
  /** Remaining (ghost/outline/secondary) actions — collapsed into a 3-dot menu. */
  overflow?: DetailActionItem[];
}

export function DetailActions({ inline, overflow = [] }: DetailActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {inline}
      {overflow.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-cream-300 bg-cream-50 text-cream-700 hover:bg-cream-100"
          >
            <MoreVertical size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={item.onClick}
                disabled={item.disabled}
                destructive={item.destructive}
                className={cn(item.disabled && 'cursor-not-allowed')}
              >
                {item.icon}
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export type { DetailActionsProps };
