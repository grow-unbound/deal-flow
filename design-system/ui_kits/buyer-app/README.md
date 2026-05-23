# DealFlow Buyer App — UI Kit (v3)

Mobile-first PWA for the **retailer**. Premium-comfort aesthetic on a tiny canvas.

## Information architecture (v3)

**No top headers on landing tabs** — every landing tab leads with an inline page title (eyebrow + Fraunces title) plus a right-aligned icon action. This reclaims vertical space and treats the page title itself as the header.

**4 landing tabs** — visible bottom tab bar:

| Tab | Page title | Right action | Content |
|---|---|---|---|
| **Home** | _Good evening, Rajan_ / **Your shelf, this month.** | Notifications bell | KPIs (year spend, open orders, available credit), distributors list, Order-again carousel, New catalogs carousel, Recent activity |
| **Catalog** | _Browse_ / **Catalog** | Help | Search bar → Location card → Inline filter chips → Catalogs / Categories / Top brands sections |
| **Orders** | _Activity_ / **Your orders** | Search | **Sub-tabs**: Orders / Enquiries / Invoices, each with its own list. Status filter chips inside Orders. 8 mock orders to demonstrate scroll. |
| **Profile** | (dark-teal hero with avatar) | — | Account block (Business · GSTIN · Credit · Locations), Preferences block, Logout. Business row opens a **bottom-sheet editor**. |

**4 deep screens** — tab bar HIDDEN to reclaim space; sticky header + sticky action bar:

| Screen | Notes |
|---|---|
| **Product list** | New — drill-down from a category tile, catalog card, or brand chip. Eyebrow shows the source kind (Category/Catalog/Brand), title shows its name, search within the list, sort pill, then the full grid. |
| **Product detail** | Sticky qty picker + "Add · ₹X" bar. Header keeps the search icon. Includes a Product attributes spec list and "More from this brand" rail. |
| **Cart** | Sticky "Place order · ₹X" CTA in ember. Totals card → **delivery card** below it (location + address + 2–3 days + Change link). |
| **Order placed** | Sticky "Back to catalog" CTA. |

**Cart is not a tab.** When the cart has items, a centered floating "View Cart · N · ₹X" pill appears at the bottom of the **Catalog** and **Product list** screens, sitting above the tab bar.

**Bottom sheet** — `<BottomSheet>` is the reusable shell (backdrop + handle + title + subtitle + footer actions). `<BusinessEditSheet>` is the worked example on Profile → Business details. Use it as the pattern for any inline edit: GSTIN, Credit-limit display, Notifications, Language, etc.

**Login** (OTP) sits outside the tab/deep system — full-bleed brand hero with the WhatsApp OTP form on a cream bottom sheet.

## Layout primitives
- `.b-app` is a flex column with three slots: sticky **header** (flex-shrink:0), scrollable **body** (.b-scroll, flex:1), optional sticky **footer** (flex-shrink:0). Status-bar safe area reserved via `.b-app { padding-top: 50px }`.
- For landing tabs the "header" is the page-head row (`.b-page-head-row`) rather than a true app header — eyebrow + title on the left, icon button on the right.
- Sub-tabs (`.b-subtabs`) are a segmented control with rounded background pills; use for high-level sibling collections (Orders/Enquiries/Invoices).
- The View Cart button (`<ViewCartButton>`) is a positioned overlay, not a flex child — it floats above whatever is currently in the body.
- The bottom sheet (`<BottomSheet>`) renders into the same positioned wrapper as the tab bar; it slides up via `transform: translateY()`.

## Files
- `index.html` — open this. Routes via `useState`; left-side panel lets you jump between screens.
- `Screens.jsx` — all screens in one file. Components: `Login`, `Home`, `Catalog`, `ProductList`, `Product`, `Cart`, `Placed`, `OrdersList`, `Profile`, `BottomSheet`, `BusinessEditSheet`, `ViewCartButton`, `PageHeader`, `Bottle`.
- `buyer.css` — all buyer-app styles (uses tokens from root `colors_and_type.css`).
- `data.jsx` — mock data: catalogs, products, orders, enquiries, invoices, locations, distributors, categories, brands, profile.
- `icons.jsx` — Lucide-style inline SVG icons.
- `ios-frame.jsx` — iOS device chrome (status bar, dynamic island, home indicator).

## What's intentionally not built
- Real OTP delivery, real cart persistence, real payment integration.
- Location picker bottom sheet.
- Order tracking detail, enquiry detail, invoice detail screens.
- Distributor-detail page, credit-limit drill-down.
