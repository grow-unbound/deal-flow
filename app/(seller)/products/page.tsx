// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /products <-> /products/[id]. This page only exists so
// `/products` itself is a routable segment.
export default function ProductsPage() {
  return null;
}
