'use client';

import { useState } from 'react';
import Image from 'next/image';
import { r2Url } from '@/lib/r2-url';

const PALETTE = [
  '#B45309', '#0F766E', '#7C3AED', '#BE185D', '#1D4ED8',
  '#B91C1C', '#047857', '#A16207', '#4338CA', '#C2410C',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function resolveLogoSrc(logoUrl: string): string {
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  return r2Url(logoUrl) ?? logoUrl;
}

/**
 * Tenant storefront branding, with graceful degradation: real logo when
 * app.tenants.logo_url is set, otherwise an auto-generated colored-initials
 * tile (deterministic per tenant name) — same "brand monogram tile" pattern
 * documented in the onboarding journey spec for missing product photos.
 */
export function TenantLogo({
  name,
  logoUrl,
  size = 48,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const resolvedSrc = logoUrl && !imgError ? resolveLogoSrc(logoUrl) : null;

  if (resolvedSrc) {
    return (
      <Image
        src={resolvedSrc}
        alt={`${name} logo`}
        width={size}
        height={size}
        unoptimized
        className={`rounded-full object-cover ${className ?? ''}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${name} logo`}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colorForName(name),
        fontSize: size * 0.4,
      }}
    >
      {initialsForName(name)}
    </div>
  );
}
