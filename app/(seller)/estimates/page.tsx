// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /estimates <-> /estimates/[id]. This page only exists so
// `/estimates` itself is a routable segment.
export default function EstimatesPage() {
  return null;
}
