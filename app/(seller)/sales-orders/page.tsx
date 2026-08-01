// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /sales-orders <-> /sales-orders/[id]. This page only exists so
// `/sales-orders` itself is a routable segment.
export default function SalesOrdersPage() {
  return null;
}
