// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /locations <-> /locations/[id]. This page only exists so
// `/locations` itself is a routable segment.
export default function LocationsPage() {
  return null;
}
