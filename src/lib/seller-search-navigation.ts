/** Append landing-list `search` query param when opening a split-pane detail from global search. */
export function withSellerLandingSearch(urlPath: string, searchQuery: string): string {
  const trimmed = searchQuery.trim();
  if (!trimmed) return urlPath;

  const separator = urlPath.includes('?') ? '&' : '?';
  return `${urlPath}${separator}search=${encodeURIComponent(trimmed)}`;
}
