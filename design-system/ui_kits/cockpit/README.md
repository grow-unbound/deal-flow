# DealFlow Cockpit — UI Kit

Desktop-first interface for the **distributor (seller-admin / seller-assistant)**. The cockpit is where a multibrand distributor runs the business: brands, products, buyers, cohorts, price lists, catalog publishing, orders.

## Scope of this kit
- 4 connected screens via a fake router (no real backend): **Dashboard → Catalogs → Catalog Publisher → Orders**.
- Components are split into small, copy-pasteable JSX files. Style comes from the root `colors_and_type.css`.

## Open the kit
Open `index.html` in a browser. The whole prototype loads in one page; the topbar nav switches "screens" by toggling sections (no real client-side router — kept simple).

## What's recreated
- Topbar with tenant switcher and global search.
- Left sidebar nav with active/hover states and counts.
- KPI strip + brand performance + recent-orders panel (dashboard).
- Published catalogs grid (lookbook tiles).
- Catalog publisher flow: cohort picker → product picker → preview → publish CTA.
- Orders table with status pills, filters, and detail drawer.

## What's intentionally not recreated
- Real data wiring (everything is in-memory mock data).
- Mobile responsiveness (desktop only — buyer app handles mobile).
- Settings, RBAC, exports panels.
