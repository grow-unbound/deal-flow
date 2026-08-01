// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /warehouses <-> /warehouses/[id]. This page only exists so
// `/warehouses` itself is a routable segment.
export default function WarehousesPage() {
  return null;
}
