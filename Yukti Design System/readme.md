# Yukti Design System

The canonical design system for **Yukti** — the operating layer of the business. Charcoal + Copper · Mukta · India-first, globally credible.

**Namespace:** `window.YuktiDesignSystem_13a225`  
**Brand identity:** R10 Final (locked)  
**Canonical mode:** Light. Dark is a supported variant.

---

## Brand principles (non-negotiable — from Brand Brief §7–§14)

| Principle | Rule |
|---|---|
| **One palette** | Charcoal `#221E1A` + Copper `#B5642F` — no other brand colours |
| **Light canonical** | Light mode is the default; dark is a variant, not an equal |
| **Status = shape + label** | ~8% of users are colour-blind. Status is ALWAYS shape + label, never colour alone |
| **Mukta everywhere** | Baloo 2 is for the wordmark/logotype ONLY — never in UI copy |
| **Copper = accents only** | Copper fails AA contrast at small sizes — never use as body text |
| **No ledgers/coins** | Avoid accounting/compliance/paperwork imagery and visual language |
| **Owner is the hero** | Product copy puts the operator first — Yukti recommends, owner decides |
| **Tabular numerals** | All money, quantities, IDs must use `font-variant-numeric: tabular-nums` |
| **RTL-ready** | Use `dir="ltr"` root; mirror layout for Arabic/Gulf markets |

---

## Tokens (`styles.css`)

Load `styles.css` for all CSS custom properties:

```css
/* Colour */
--yk-ink: #221E1A          /* body text */
--yk-surface: #2B2825      /* dark surfaces */
--yk-copper: #B5642F       /* accents · light */
--yk-copper-lt: #D9894C    /* accents · dark */
--yk-paper: #F8F6F2        /* page background */
--yk-card: #FCFBF8         /* card surface */
--yk-card-line: #EAE3D9    /* borders */
--yk-sub: #64594E          /* muted text · 6.4:1 */
--yk-faint: #6F665C        /* label text · 5.3:1 */
--yk-on-dark: #F3EEE6      /* text on dark · 12.6:1 */

/* Spacing: --yk-space-1 (4px) → --yk-space-20 (80px) */
/* Radii:   --yk-radius-sm (6px) → --yk-radius-full */
/* Shadows: --yk-shadow-xs → --yk-shadow-xl (warm ink tint) */
/* Motion:  --yk-ease, --yk-duration-fast/base/slow */
```

---

## Components

| Component | File | Description |
|---|---|---|
| `YuktiMark` | `YuktiMark/` | Voussoir keystone — copper/ink/white/twoTone |
| `Button` | `Button/` | Primary · secondary · ghost · danger — sm/md/lg |
| `Badge` | `Badge/` | Pill label — shape + text, 5 semantic variants |
| `StatusChip` | `StatusChip/` | Order lifecycle + catalog + entity statuses |
| `Input` | `Input/` | Text — label, prefix/suffix, error, disabled |
| `Select` | `Select/` | Dropdown — label, placeholder, error, disabled |
| `Toggle` | `Toggle/` | Boolean switch with label + hint — sm/md |
| `Card` | `Card/` | Surface — light/dark/elevated/interactive |
| `Avatar` | `Avatar/` | Initials + image — xs/sm/md/lg/xl, circle/square |
| `Alert` | `Alert/` | System alerts — info/success/warning/error |
| `Stat` | `Stat/` | KPI card — value, label, trend up/down/neutral |
| `SearchBar` | `SearchBar/` | Search input — shortcut badge, clear, 3 sizes |
| `ProductCard` | `ProductCard/` | Buyer catalog card — image, price, availability |
| `Tabs` | `Tabs/` | Horizontal tabs — active indicator, count badge |
| `EmptyState` | `EmptyState/` | Empty states — 5 illustration presets |
| `DataTable` | `DataTable/` | Table — tabular numerals, sticky header |

---

## Using components in a @dsCard preview

```html
<script src="../_ds_bundle.js"></script>
<script type="text/babel" data-presets="env,react">
  const { Button, StatusChip } = window.YuktiDesignSystem_13a225;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <Button variant="primary" label="Publish catalog" />
  );
</script>
```

---

## Templates

| Template | Path | Description |
|---|---|---|
| **Seller Cockpit** | `templates/seller-cockpit/` | Distributor command center — sidebar nav, orders, products, buyers, cohorts, catalogs |
| **Buyer App** | `templates/buyer-app/` | Mobile PWA for retailers — catalog browse, cart, order history |

---

## Brand compliance checklist

- [ ] **Fonts:** only Mukta (UI) + Baloo 2 (wordmark) — never Inter, Roboto, Arial, Fraunces
- [ ] **Status chips:** always shape glyph + text label
- [ ] **Copper as text:** never — fails AA at small sizes
- [ ] **Tabular numerals:** all money/quantities use `font-variant-numeric: tabular-nums` + `IBM Plex Mono` for IDs/SKUs
- [ ] **Currency:** ₹ for INR; lakh/crore notation in marketing (₹ 4.2L), exact in data tables
- [ ] **Empty states:** no ledgers, coins, stamps, compliance, paperwork imagery
- [ ] **Shadows:** always `rgba(34,30,26,α)` — warm ink tint, never `rgba(0,0,0)` or cool grey
- [ ] **Focus ring:** `outline: 2px solid #B5642F` on `:focus-visible`
- [ ] **Touch targets:** minimum 44px on buyer mobile PWA
- [ ] **Contrast:** WCAG 2.1 AA on all text/background pairs
- [ ] **RTL:** `dir="ltr"` on root; icons and layout can mirror for Arabic/Gulf

---

## Voice & copy guidelines (§6 of Brand Brief)

| Use | Avoid |
|---|---|
| "3 prices need review." | "Leverage AI-powered insights to optimize." |
| "That didn't save. Here's how to fix it." | "An unexpected error occurred." |
| "Let's get your catalog live." | "Welcome to the platform!" |
| "You decide. Yukti makes it pay off." | "Let Yukti run your business for you." |
