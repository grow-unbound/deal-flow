---
name: dealflow-design
description: Use this skill to generate well-branded interfaces and assets for DealFlow, either for production or throwaway prototypes/mocks/etc. DealFlow is a distributor command center for multibrand SMB distributors — premium-comfort aesthetic, Ember & Cream palette, Fraunces + Inter type. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file at the root of this skill, and explore the other available files.

The system is organized at:
- `README.md` — full design rationale, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — all CSS custom properties and base element styles. **Always import this** in any HTML artifact you make.
- `assets/` — logo (mark + lockup), illustrations, grain pattern.
- `preview/` — small design-system specimen cards. Useful as visual reference for components.
- `ui_kits/cockpit/` — the desktop distributor cockpit, with reusable JSX components (`Shell`, `Common`, `Dashboard`, `Catalogs`, `Publisher`, `Orders`) and a shared `cockpit.css`.
- `ui_kits/buyer-app/` — the mobile PWA buyer app, with `Screens.jsx` (Login/Home/Catalog/Product/Cart/Placed/OrdersList) and `buyer.css`. Renders inside an iOS device frame.

Quick rules for designing in this brand:
- **Always start on a warm cream page** (`#FAF7F2`), never pure white.
- **Use teal-500 (`#1F3A34`) sparingly** — nav active, primary CTA, brand mark.
- **Use ember-400 (`#C26E3A`) preciously** — one accent moment per screen (focus ring, "new" badge, single destination CTA).
- **Fraunces for display, Inter for UI, JetBrains Mono for SKUs/IDs/numerals.** Tabular numerals on prices.
- **Indian comma grouping by default:** `₹12,40,000` not `₹1,240,000`.
- **No emoji in product surfaces.** Sentence case for labels. Uppercase only for eyebrows and order-status pills.
- **Generous whitespace; density-1 only on cockpit tables.** Cards have 14px radius, 1px cream-300 borders, subtle warm shadows.
- **Animation is atmospheric, not snappy** — 200ms standard, 320ms panels, 600ms hero reveals. No bounce on UI controls.
- **Lucide icons, stroke 1.5.** Never draw your own SVG icons; if a needed glyph isn't in Lucide, propose a Lucide substitute and flag it.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc): copy `colors_and_type.css` and any needed assets out, then create static HTML files. Reference UI-kit components by reading the JSX directly — they're built to be copy-paste-able.

If working on production code (React + Vite + Tailwind + shadcn/ui per the locked stack): translate the CSS variables in `colors_and_type.css` into your tailwind config, and use the UI kit's JSX as a reference for component composition.

If the user invokes this skill without other guidance, ask them what they want to build or design, ask a handful of focused questions (which surface? which screen? variations?), and act as an expert designer who outputs HTML artifacts or production code, depending on the need.
