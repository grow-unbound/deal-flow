// List rendering now lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /categories <-> /categories/[id]. This page only exists so
// `/categories` itself is a routable segment.
export default function CategoriesPage() {
  return null;
}
