// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /price-lists <-> /price-lists/[id]. This page only exists so
// `/price-lists` itself is a routable segment.
export default function PriceListsPage() {
  return null;
}
