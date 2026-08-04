/** Non-detail child segments under split-pane base paths (composer/import routes). */
const SPLIT_PANE_NON_DETAIL_SEGMENTS = new Set([
  'import',
  'new',
  'broadcasts',
  'access',
  'edit',
]);

/** True when the current URL is a detail pane route (`/products/[id]`), not list-only or composer sub-routes. */
export function isSplitPaneDetailPath(
  basePath: string,
  pathname: string | null | undefined,
  id?: string,
): boolean {
  if (id != null && id.length > 0) return true;
  if (!pathname?.startsWith(`${basePath}/`)) return false;

  const rest = pathname.slice(basePath.length + 1);
  const firstSegment = rest.split('/')[0] ?? '';
  if (!firstSegment || SPLIT_PANE_NON_DETAIL_SEGMENTS.has(firstSegment)) return false;

  return true;
}
