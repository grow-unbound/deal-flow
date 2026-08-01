// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /brands <-> /brands/[id]. This page only exists so
// `/brands` itself is a routable segment.
export default function BrandsPage() {
  return null;
}
