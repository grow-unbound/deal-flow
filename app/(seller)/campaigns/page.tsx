// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /campaigns <-> /campaigns/[id]. This page only exists so
// `/campaigns` itself is a routable segment.
export default function CampaignsPage() {
  return null;
}
