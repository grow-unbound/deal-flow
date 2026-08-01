// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /customer-groups <-> /customer-groups/[id]. This page only
// exists so `/customer-groups` itself is a routable segment.
export default function CohortsPage() {
  return null;
}
