// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /customers <-> /customers/[id]. This page only exists so
// `/customers` itself is a routable segment.
export default function CustomersPage() {
  return null;
}
