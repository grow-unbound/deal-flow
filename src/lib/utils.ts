import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import {
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
  type NumberFormatKind,
  type NumberFormatOptions,
} from '@/lib/number-format';

export type { NumberFormatKind, NumberFormatOptions };
export { formatNumberInput, formatNumberValue, parseNumberInput };

// Tell tailwind-merge which text-* classes are font-sizes (not colors).
// Without this, custom font-size tokens like `text-body-sm` conflict with
// color tokens like `text-cream-50`, and tailwind-merge drops the color.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', 'display-xl', 'display-lg', 'display-md', 'display-sm', 'h1', 'h2', 'h3', 'h4', 'body', 'body-sm', 'caption', 'eyebrow'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

export type PriceListStatus = 'active' | 'draft' | 'expired';

export function getPriceListStatus(pl: {
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}): PriceListStatus {
  const now = new Date();
  if (pl.valid_to && new Date(pl.valid_to) <= now) return 'expired';
  if (!pl.is_active) return 'draft';
  if (pl.valid_from && new Date(pl.valid_from) > now) return 'draft';
  return 'active';
}
