# DealFlow Claude Instructions

Follow the repo `AGENTS.md` as the source of truth for product, UI, and workflow rules.

## Spacing Standard
- Forms, dialogs, alert dialogs, and confirmation sheets must use explicit `header` / `body` / `footer` spacing.
- Keep modal padding balanced and consistent: header at the top, roomy body spacing, and a dedicated footer row for actions.
- Prefer the shared dialog primitives (`DialogHeader`, `DialogBody`, `DialogFooter`) instead of hand-rolled spacing blocks.
- In two-column form layouts, keep labels, inputs, and helper text aligned to the grid and avoid letting helper text spill into the action row.

## Navigation & Perceived Performance Standard
- Use SPA navigation for all internal routes (`next/link`, `router.push`, `router.replace`). Do not use raw `<a href="/...">` for in-app pages.
- Keep route shells persistent and add `loading.tsx` skeleton boundaries for seller and buyer route segments.
- Every critical view must render a skeleton/pending state first; do not allow blank transition states.
- For CTA-driven mutations, default to optimistic UI with React Query (`onMutate` + rollback in `onError` + revalidate in `onSettled`).
- Avoid unnecessary `router.refresh()` calls; prefer targeted query updates and invalidation.
