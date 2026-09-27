// List rendering lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /today <-> /today/[id]. This page only exists so
// `/today` itself is a routable segment.
export default function TodayPage() {
  return null;
}
