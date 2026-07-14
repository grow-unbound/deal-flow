import { NextResponse } from 'next/server';
import { PAGE_SIZE } from '@/lib/pagination';
import type { createTimer } from '@/lib/server-timing';

export const SELLER_GET_CACHE_CONTROL = 'private, max-age=15, stale-while-revalidate=60';
export const SELLER_REFERENCE_CACHE_CONTROL = 'private, max-age=30, stale-while-revalidate=120';
export const SELLER_NO_STORE_CACHE_CONTROL = 'no-store';
export const APP_GET_CACHE_CONTROL = 'private, max-age=15, stale-while-revalidate=60';

export const SELLER_CACHE_PERSONAL = { 'Cache-Control': SELLER_GET_CACHE_CONTROL } as const;
export const SELLER_CACHE_REFERENCE = { 'Cache-Control': SELLER_REFERENCE_CACHE_CONTROL } as const;
export const SELLER_CACHE_NONE = { 'Cache-Control': SELLER_NO_STORE_CACHE_CONTROL } as const;

export type LargeDataSurface = 'summary' | 'rows' | 'options' | 'preview';

export function parseBoundedLimit(
  value: string | null | undefined,
  fallback: number,
  max: number = PAGE_SIZE.MAX,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(fallback, max);
  return Math.min(Math.floor(parsed), max);
}

export function parseRowsLimit(value: string | null | undefined, fallback: number = PAGE_SIZE.SELLER) {
  return parseBoundedLimit(value, fallback, PAGE_SIZE.MAX);
}

export function parseRowsOffset(value: string | null | undefined, max: number = 10_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), max);
}

export function parseOptionsLimit(value: string | null | undefined, fallback: number = PAGE_SIZE.COMPOSER) {
  return parseBoundedLimit(value, fallback, 50);
}

export function jsonWithServerTiming(
  body: unknown,
  timer: ReturnType<typeof createTimer>,
  label: string,
  init?: ResponseInit,
  cacheControl?: string,
) {
  const response = NextResponse.json(body, init);
  response.headers.set('Server-Timing', timer.header(label));
  if (cacheControl && (!init?.status || (init.status >= 200 && init.status < 300))) {
    response.headers.set('Cache-Control', cacheControl);
  }
  return response;
}
