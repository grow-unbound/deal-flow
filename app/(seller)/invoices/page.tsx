// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /invoices <-> /invoices/[id]. This page only exists so
// `/invoices` itself is a routable segment.
export default function InvoicesPage() {
  return null;
}
