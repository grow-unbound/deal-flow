/**
 * Shared layout tokens for seller composer screens (documents, catalogs, cohorts, price lists).
 * Kept in a non–'use client' module so route `loading.tsx` can mirror the same structure.
 */

/** Page column: fill viewport under global header + shell padding (see ComposerShell). */
export const composerPageMinHeightClass = 'min-h-[calc(100dvh-10rem)]';

/** Three-panel body: grows within a flex-1 min-h-0 column so side/center/right stretch to full height. */
export const composerThreePanelGridClass =
  'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] items-stretch gap-5 lg:grid-cols-[260px_minmax(0,1fr)_248px]';
