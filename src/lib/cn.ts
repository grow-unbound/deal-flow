import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

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
