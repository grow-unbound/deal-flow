import { cn } from '@/lib/utils';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';

interface StatusTagProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

export function StatusTag({ label, tone, className }: StatusTagProps) {
  return <StatusPill label={label} tone={tone} className={cn(className)} />;
}

export type { StatusTone } from '@/components/ui/status-pill';
