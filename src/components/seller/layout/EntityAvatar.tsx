'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export type EntityAvatarHue = 'teal' | 'ember' | 'cream';

interface EntityAvatarProps {
  initials: string;
  hue: EntityAvatarHue;
  size?: number;
  imageUrl?: string | null;
  className?: string;
}

const hueClasses: Record<EntityAvatarHue, string> = {
  teal: 'border-teal-200 bg-teal-100 text-teal-700',
  ember: 'border-ember-200 bg-ember-50 text-ember-700',
  cream: 'border-cream-300 bg-cream-100 text-cream-700',
};

export function EntityAvatar({ initials, hue, size = 38, imageUrl, className }: EntityAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = imageUrl && !imgError;

  if (showImage) {
    return (
      <Image
        src={imageUrl}
        alt={initials}
        width={size}
        height={size}
        unoptimized
        onError={() => setImgError(true)}
        className={cn('shrink-0 rounded-[10px] border border-cream-200 object-contain bg-white', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[10px] border font-display font-medium uppercase leading-none',
        hueClasses[hue],
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.34)) }}
      aria-label={initials}
    >
      {initials}
    </div>
  );
}
