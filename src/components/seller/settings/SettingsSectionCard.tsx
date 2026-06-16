'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SettingsSectionCardProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function SettingsSectionCard({ title, subtitle, icon: Icon, children, footer, className }: SettingsSectionCardProps) {
  return (
    <section
      className={cn(
        'mb-6 overflow-hidden rounded-xl border border-cream-300 bg-white shadow-xs',
        className,
      )}
    >
      <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-600 shadow-sm ring-1 ring-cream-200">
            <Icon size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-cream-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-base text-cream-700">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
      {footer ? <footer className="border-t border-cream-200 bg-cream-50 px-5 py-3">{footer}</footer> : null}
    </section>
  );
}
