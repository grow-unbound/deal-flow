# Yukti Design System — Revision Brief R11

This is a targeted revision of the locked R10 design system. The brand identity (Charcoal + Copper palette, Voussoir keystone mark, Mukta + Baloo 2 font roles, Paper ground, tagline) is **unchanged**. Only the execution decisions listed below are revised. Do not re-explore brand direction.

---

## 1. Typography — scale, hierarchy, and weight

**Problem:** Base text at 14px with uniform Mukta weights creates a flat visual hierarchy. The system reads as dense and undifferentiated compared to premium B2B products.

**Fix:**

- Bump base UI text from **14px → 15px**
- Establish an explicit heading tier using **Mukta 700–800** with tight tracking (`letter-spacing: -0.025em`) to create a genuine hierarchy signal without a third font face. Reference sizes:
  - Page title / section hero: Mukta 800, 22–24px, tracking -0.025em
  - Section heading: Mukta 700, 18px, tracking -0.02em
  - Card/group heading: Mukta 600, 15px, tracking -0.015em
  - Body: Mukta 400, 15px
  - Caption / label: Mukta 500, 12px, tracking +0.02em, uppercase optional
- The goal: a page title and a body paragraph should feel separated by visual weight alone. No third display font is needed — Mukta 800 at large sizes is architectural and on-brand. A serif would introduce editorial softness that contradicts the "confident operator" voice.

---

## 2. Mono font — swap IBM Plex Mono → JetBrains Mono

**Problem:** IBM Plex Mono is narrow and low-contrast against Mukta at small sizes (10–13px). In a data-dense B2B product where operators read SKUs, quantities, and prices all day, the mono distinction needs to be visible at small sizes.

**Fix:**

- Replace `IBM Plex Mono` with **JetBrains Mono** across all numeric and ID contexts
- JetBrains Mono is a Google Font, loads alongside Mukta with no infrastructure change
- Keep the same usage rule: JetBrains Mono for prices, quantities, IDs, SKUs, order numbers, stat values. Mukta tabular-nums (`font-variant-numeric: tabular-nums`) for inline numeric text that doesn't need the mono treatment
- Verify the Stat component, DataTable, and any price display at 11–13px — the distinction should be unambiguous at these sizes

---

## 3. ₹ currency symbol spacing

**Problem:** The `₹` prefix in the Stat component renders with too much separation from the number value, making them feel disconnected.

**Fix:**

- In the Stat component JSX, ensure there is **no whitespace text node** between `{prefix}` and `{value}`
- Set `marginRight: '1px'` on the prefix `<span>` (down from 3px)
- The ₹ symbol and the number should read as one unit visually
- Apply same rule to any other currency prefix across the system (price cells, product cards, order totals)

---

## 4. Primary CTA color — copper → charcoal

**Problem:** Copper (#B5642F) is used as the fill for all primary buttons. Copper is a warm accent color — using it as the dominant action color makes the UI feel loud and sales-y rather than confident and premium. It also contradicts the Brand Brief (§10): "Copper = mark and accents only."

**Fix:**

- **Primary button:** `background: #221E1A` (charcoal), `color: #F8F6F2` (paper). This is the confident, authoritative action. Every premium B2B tool (Linear, Vercel, Notion, WisprFlow) uses a near-black primary. It reads as "this is the right move" rather than "click me urgently."
- **Secondary button:** unchanged — `#FCFBF8` surface, charcoal text, `#EAE3D9` border
- **Ghost button:** unchanged — transparent background, charcoal text
- **Accent/copper button:** `background: #B5642F`, `color: #F8F6F2` — exists as a **named variant** (`variant="accent"`) to be used sparingly. See §4a below.
- Update button preview cards to show: Primary (charcoal) → Secondary → Ghost → Accent (copper) in that order

### 4a. When to use the accent (copper) button

The accent button is the **single most important action on a screen** when it needs to stand out from other charcoal primaries. Use cases:

- "Publish catalog" — the irreversible, high-intent action on the catalog publish page (one per screen)
- "Place order" — the terminal CTA in the buyer checkout flow
- A featured/promotional CTA on a marketing landing page

Do NOT use copper buttons for: form submits, save actions, standard navigation CTAs, any action that appears more than once on a screen. If in doubt, use charcoal primary. Copper being rare is what makes it feel premium and intentional — it signals "this is the moment."

---

## 5. Sidebar — light in light mode, dark only in dark mode

**Problem:** The seller cockpit sidebar uses `#2B2825` (charcoal surface) as its background in light mode. This creates a bimodal interface — dark chrome on the left, light body on the right — that demands split visual attention and makes the light body feel less airy. It also breaks dark mode: there is no "darker" state to go to.

**Fix — light mode sidebar:**

- Sidebar background: `#FCFBF8` (card surface token `--yk-card`)
- Sidebar right border: `1px solid #EAE3D9` (`--yk-card-line`)
- Nav item default: transparent background, `#64594E` text (`--yk-sub`)
- Nav item hover: `rgba(34,30,26,0.05)` background — a barely-there warm tint, not a colored block. Reference: WisprFlow, Linear, Notion all use a sub-5% opacity hover state. The hover should be felt, not seen.
- Nav item active: `rgba(34,30,26,0.08)` background + `2px solid #B5642F` left border + `#221E1A` text weight 600. This gives a clear active signal without a solid dark block fighting the page content. The copper left border is the brand moment; the background is almost invisible.
- The Yukti mark at the top of the sidebar remains in copper — this becomes the only prominent copper element in the sidebar, which makes it iconic.

**Fix — dark mode sidebar:**

- Sidebar background: `#2B2825` — the charcoal surface token, now correctly used only in dark mode
- Active item: `rgba(181,100,47,0.18)` background + `#D9894C` text (copper-light)

---

## 6. Stat / KPI card numbers — size and weight

The Stat component currently renders its value in IBM Plex Mono at 28px/500. With JetBrains Mono replacing IBM Plex Mono, verify:

- Value: JetBrains Mono, 28px, weight 500, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.02em`
- Label above: JetBrains Mono, 10px, uppercase, `letter-spacing: 0.10em`, `--yk-sub` color — this tight mono label above a bold number is the visual pattern that gives stat cards their "data instrument" feel
- Trend line: Mukta 12px/600 for the percentage — mixing JetBrains (the number) and Mukta (the label) in the same card is intentional and correct

---

## 7. Page-level spacing — increase breathing room

The current system's 4px grid is correct. The application of it is too tight, especially at the page level.

- Page content padding (cockpit main area): increase from `16px` to `24px` horizontal, `20px` top
- Section-to-section gap within a page: `32px` minimum (8 grid units)
- Card internal padding: `20px` (was 16px for most cards)
- Top bar height: target `56–60px` — gives the page title area more presence

These changes cost nothing in density for a desktop-first product where the operator's screen is 1440px+.

---

## 8. Buyer mobile app — copper overuse

The buyer PWA uses copper extensively for CTAs, the tab bar active indicator, product cards, and badges. Apply the same logic as §4:

- Primary CTA on checkout/cart: switch to charcoal. The buyer placing an order is a high-intent moment — charcoal reads "confirm" better than copper reads "urgent."
- Tab bar active indicator: use the copper left/bottom border pattern (2px) with slightly heavier text weight, not a solid copper fill
- Product card price: JetBrains Mono, `--yk-ink` color. Never copper for prices (contrast fails at small sizes per Brand Brief §10)
- Reserve copper for: the "Add to cart" button only — this is the one moment in the buyer flow where the accent treatment is earned

---

## 9. Icons — stroke weight

**Problem:** Lucide icons at default `strokeWidth=1.5` feel thin and pale at the sizes used in the product (16–18px in the cockpit sidebar, 20–22px in the buyer tab bar). At these small rendered sizes, 1.5px strokes optically fade, especially on the warm paper background. DealFlow's custom icons used 1.8 stroke at 13px specifically to compensate for this — the same visual weight principle applies here at larger sizes.

**Library:** Keep **Lucide**. It is the correct library — the path vocabulary matches the structural/clean aesthetic, it is tree-shakeable, and the SVG viewBox is 24×24 which scales cleanly to all sizes needed. Do not switch libraries.

**Fix — stroke-weight system:**

Establish a global default and context-specific overrides. Apply these in the icon helper/wrapper:

| Context | Icon size | strokeWidth | Rationale |
|---|---|---|---|
| Cockpit sidebar nav | 17px | **2.25** | Nav icons sit beside text labels — need to hold visual weight at label size |
| Topbar / action bar | 16px | **2.0** | Button-adjacent icons; 2.0 at 16px matches the button label weight |
| Inline in buttons | 14–16px | **2.0** | Must not feel lighter than the button text |
| Table / list row | 14–16px | **2.0** | Inline contextual icons (edit, copy, status) need to be readable at a glance |
| Card icons / section icons | 18–20px | **1.85** | Slightly more breathing room at larger sizes |
| Buyer tab bar | 22–24px | **2.0** | Mobile nav icons need solid presence; default 1.5 at 22px reads as ghosted |
| Empty state illustrations | 32–48px | **1.5** | Decorative/illustrative — lighter weight is correct here |
| Stat card trend arrows | 12px | **2.0** | Tiny — must be solid to read at all |

**Implementation note:** Update the `Icon` base component to accept a `strokeWidth` prop defaulting to `2.0` (not 1.5). In the cockpit sidebar `nav-item`, pass `size={17} strokeWidth={2.25}`. In the buyer `BIcon` base, change default from 1.5 to 2.0.

**Color:** Icons in the sidebar nav (inactive state) should use `--yk-sub` (`#64594E`), not `--yk-ink`. This is already warmer and slightly lighter than the full charcoal, preventing the icon from competing with the label for attention. Active state icons use `--yk-ink` (`#221E1A`) at full weight.

**Do not add fill to nav icons.** Filled icons as the "active" state indicator (used by some mobile-first systems) conflicts with Yukti's architectural/precise aesthetic. The active indicator is the copper left border (§5) — the icon stays outlined.

---

## 10. Design system completeness — developer handover standard

**Problem:** The current Yukti DS has individual component cards and skeleton templates for the seller cockpit and buyer app. It does not match the breadth and depth of the DealFlow design system, which included fully built-out screens for every product section, composer UIs, tabbed detail pages, and documented patterns. The revision must produce a design system that a developer can treat as a single reference for implementing or upgrading every screen in the product. No gaps, no "to be designed" sections.

### 10a. Seller cockpit — all 10 sections, fully built out

Each cockpit section must be built as a complete screen with realistic data. Use the latest DealFlow V2/V3 patterns as the structural baseline, updated to the Yukti R11 tokens. See page 'Brands Landing v3.html' and 'Settings.html' for reference. Sections required:

| Section | Must include |
|---|---|
| **Dashboard** | KPI stat row (6 stats), activity feed, top buyers table, recent orders list, low-stock alert banner |
| **Brands** | Entity list (brand cards with logo, product count, active toggle), search + filter bar, empty state |
| **Products** | Filterable table view (SKU, brand, price, stock, status), bulk select, CSV import CTA, empty state |
| **Customers (Buyers)** | Buyer list table, cohort badge column, credit limit column, search + filter, add buyer CTA |
| **Cohorts** | Cohort cards (name, member count, rule preview), builder preview, empty state |
| **Price Lists** | Price list table, active/scheduled/expired status chips, assign CTA, empty state |
| **Catalogs** | Catalog cards (published/draft), share link, buyer count, publish CTA, empty state |
| **Orders** | Order table (order number, buyer, status, value, date), status filter chips, expandable row |
| **Exports** | Export type list (Tally Item Master, Sales Voucher, Ledger Master, Zoho), date range picker, download CTA |
| **Settings** | All 7 tabs: General, Team, Billing, Integrations, Locations, Features, Notifications |

### 10b. Seller cockpit — composer UIs (add/edit flows)

These are the dialogs and slideovers a distributor uses to create and edit records. Every composer must be built as both a slide-over panel (primary pattern) and referenced as the inline form pattern for mobile. See page 'Dialogs and Overlays.html' for reference. Required:

- Add / Edit Brand (name, logo upload, description, active toggle)
- Add / Edit Product (multi-step: details → pricing → images → publish)
- Add / Edit Buyer (name, GSTIN, credit limit, delivery address, cohort assignment)
- Create Cohort (name → rule builder → preview count → save)
- Create Price List (name → products table → prices → validity window)
- Publish Catalog (select price list → select buyers/cohorts → preview → publish with share token)
- Order status update (single-action confirm dialog with status progression)
- Add Team Member (email, role dropdown, invite button)
- Zoho connect / disconnect (OAuth flow states: disconnected, connecting, connected, error)

### 10c. Seller cockpit — tabbed detail pages

Detail pages open when a user clicks a brand, product, buyer, or order from the list view. They follow a consistent pattern: header with entity identity + status + actions, then a tabbed body. See page 'Details Pages v2.html' for reference. Required:

- **Brand detail:** tabs — Overview (product count, top products, revenue by brand) | Products (filtered list) | Settings
- **Product detail:** tabs — Overview (price history, stock levels, recent orders) | Pricing (price list assignments) | Media (image gallery)
- **Buyer detail:** tabs — Overview (KPIs: spend, orders, credit used) | Orders (order history) | Price Lists (assigned) | Activity log
- **Order detail:** tabs — Items (line items, quantities, prices, total) | Fulfilment (status timeline) | Notes | Invoice PDF preview

### 10d. Buyer PWA — all screens

All screens must be built in the phone frame at 390px width (iPhone 14 viewport). Use the latest V3 screen designs from DealFlow as the structural baseline, updated to Yukti R11 tokens. Required:

| Screen | Must include |
|---|---|
| **OTP login** | Phone entry, OTP input, resend timer, WhatsApp branding note |
| **Home** | Distributor name header, KPI row (spend, orders, credit), "order again" horizontal scroll, new catalogs section, recent activity list |
| **Catalog** | Search bar, delivery location chip, filter chips (brand, category), catalog cards horizontal scroll, category grid, product grid |
| **Product detail** | Image (with fallback), product name + brand, price (JetBrains Mono, large), quantity stepper, availability badge, add-to-cart CTA (charcoal), similar products |
| **Cart** | Line items (image, name, qty stepper, subtotal), order summary card, place order CTA (copper accent — one of the two approved copper CTA uses) |
| **Checkout** | Delivery address card, notes field, order summary, confirm CTA |
| **Order placed** | Confirmation illustration, order number (JetBrains Mono), "track order" CTA, "continue shopping" ghost |
| **Orders — list** | Sub-tabs (Orders / Enquiries / Invoices), status filter chips, order cards |
| **Order detail** | Status timeline, line items, totals, invoice download |
| **Profile** | Business name + GSTIN, credit used bar, delivery address, logout |

### 10e. Shared patterns and documentation required in R11

These must be included as dedicated sections in the design system, not assumed:

**Component guidelines (for each component):**
- When to use vs when not to use
- Do / Don't examples with visual pairs
- Size variants and when to choose each
- Accessibility notes (contrast, touch target, keyboard behavior)

**Interaction patterns:**
- Optimistic UI: how mutations should behave visually before server confirmation (React Query `onMutate` pattern)
- Error states: inline form errors, API failure banners, empty states post-error
- Loading states: skeleton screens for list pages, spinner placement rules, no blank transitions
- Empty states: one per product section, consistent illustration style (structural/geometric, no coins/ledgers per brand brief), with a primary CTA to resolve the empty state

**Navigation patterns:**
- Cockpit: sidebar-first, active state rules, breadcrumb on detail pages
- Buyer PWA: tab bar rules (4 primary tabs only), back navigation on deep screens (no tab bar), scroll behavior on sticky headers

**Data display rules:**
- All prices: JetBrains Mono, `font-variant-numeric: tabular-nums`, `--yk-ink` color, ₹ prefix tight with no gap
- All quantities: JetBrains Mono, right-aligned in tables
- All dates: `DD MMM YYYY` format, Mukta regular, `--yk-sub` color
- Lakh/crore display: `₹4.2L` in summary/marketing contexts; full precision in data tables
- Status chips: always `shape glyph + text label`, never color alone — document all status values across Orders, Catalogs, Products with their exact color tokens and shape glyphs

**Developer handover checklist (end of document):**
- Font load instructions (Google Fonts import, fallback stack)
- CSS custom property full reference table
- Component props API for every component
- Accessibility compliance statement (WCAG 2.1 AA confirmed pairs)
- RTL readiness notes (which components need mirroring for Gulf markets)
- Dark mode implementation notes (which tokens change, sidebar background rule)
- Tailwind config mapping (if applicable — map `--yk-*` tokens to Tailwind custom values)

### 10f. Version and change summary

Include a changelog section at the top of the system documentation:

| Version | Changes |
|---|---|
| R10 | Brand identity locked — palette, mark, type roles, tagline |
| **R11 (this revision)** | Sidebar light in light mode · Charcoal primary buttons · Copper accent reserved · Base 15px · JetBrains Mono · Icon stroke 2.0 default · ₹ spacing · Page spacing increased · Full screen coverage for all cockpit + buyer sections |

---

## What is NOT changing

- Brand palette: Charcoal `#221E1A` + Copper `#B5642F` + Paper `#F8F6F2` — locked
- Font roles: Mukta (all UI), Baloo 2 (wordmark only) — locked
- Status system: shape + label, never color alone — locked
- Token naming (`--yk-*`) and structure — locked
- Shadows, border radii, motion tokens — unchanged
- The mark, tagline, signature story — locked per R10

---

## Acceptance criteria

Before marking R11 complete, verify:

1. Sidebar in light mode reads as one unified surface with the body — no dark/light split
2. Primary buttons are charcoal. Copper buttons appear on at most 1 CTA per screen
3. Page titles and body text are visibly different weight tiers without hovering/inspecting
4. JetBrains Mono is clearly distinct from Mukta in a table row at 12px
5. ₹ and the number value look like one unit, not two
6. The active nav item is indicated by a copper left border + slightly darker text — not a solid filled block
7. WisprFlow sidebar comfort test: the sidebar should not draw more attention than the page content
