'use client';

import type { LucideIcon } from 'lucide-react';
import { Ban, CheckCircle2, Clock3, Info, Minus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info';

interface StatusPillProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  success: 'border-success-100 bg-success-50 text-success-700',
  warning: 'border-warning-100 bg-warning-50 text-warning-700',
  danger: 'border-danger-100 bg-danger-50 text-danger-700',
  neutral: 'border-cream-300 bg-cream-100 text-cream-700',
  accent: 'border-ember-100 bg-ember-50 text-ember-700',
  info: 'border-info-100 bg-info-50 text-info-700',
};

const toneGlyphs: Record<StatusTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success-700' },
  warning: { icon: Clock3, className: 'text-warning-700' },
  danger: { icon: Ban, className: 'text-danger-700' },
  neutral: { icon: Minus, className: 'text-cream-700' },
  accent: { icon: Sparkles, className: 'text-ember-700' },
  info: { icon: Info, className: 'text-info-700' },
};

export function StatusPill({ label, tone, className }: StatusPillProps) {
  const Glyph = toneGlyphs[tone].icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-[0.08em]',
        toneStyles[tone],
        className,
      )}
    >
      <Glyph className={cn('h-3.5 w-3.5 shrink-0', toneGlyphs[tone].className)} strokeWidth={2.2} />
      <span>{label}</span>
    </span>
  );
}

export function StatusGlyph({
  tone,
  className,
}: {
  tone: StatusTone;
  className?: string;
}) {
  const Glyph = toneGlyphs[tone].icon;
  return <Glyph className={cn('h-3.5 w-3.5 shrink-0', toneGlyphs[tone].className, className)} strokeWidth={2.2} />;
}
