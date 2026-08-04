/** Shared typography + spacing for seller split-pane list panels (all entity + transaction rows). */
export const SELLER_SPLIT_LIST_ROW_PADDING_CLASS = 'px-4 py-3.5';

export const SELLER_SPLIT_LIST_PRIMARY_CLASS =
  'truncate text-[var(--b-text-body)] font-medium text-cream-900';

export const SELLER_SPLIT_LIST_META_CLASS = 'mt-1 truncate text-sm text-cream-600';

export const SELLER_SPLIT_LIST_TRAILING_CLASS =
  'max-w-[8.5rem] shrink-0 truncate text-right text-[var(--b-text-body)] font-medium text-cream-900';

export type SellerSplitListVariant = 'entity' | 'transaction';

/** Join supporting meta fragments with the split-pane list separator. */
export function joinSplitListMeta(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part && String(part).trim())).join(' · ');
}
