# DealFlow Design System

> **Premium Comfort** for SMB multibrand distributors.
> An atmospheric, ember-and-cream interface system for distributors who run thirty-year-old family businesses but want to look ten times more organized to their retailers.

---

## 1. What is DealFlow?

DealFlow is a **distributor's command center**. Multibrand SMB distributors in India (and globally) juggle 5–15 brand principals — each with its own catalog, price list, and portal. They lose orders to chaos: agents don't know what's in stock, retailers don't see new arrivals, pricing is inconsistent across cohorts, and reconciliation is manual.

DealFlow gives them **one place** to:

- Manage every brand they carry, with master + tenant overrides.
- Publish geography- and cohort-specific catalogs to retailers ("New stock from Brand X for North Delhi A-class only").
- Run custom price lists per cohort, buyer, or geo.
- Capture orders through a buyer-side mobile PWA that retailers actually open.
- Export to Tally / Busy / Zoho via CSV (Phase 1) or live API (Phase 2).

The wedge: **no incumbent treats the distributor as the buyer.** Bizom, BeatRoute, FieldAssist all sell to brand principals who push the tool down. DealFlow sells to the distributor directly.

### The two surfaces

| Surface | Audience | Form | Mood |
|---|---|---|---|
| **Distributor Cockpit** | Sellers (admin + assistants), desk-bound, 8h/day | Desktop-first responsive web | Dense but calm. Private-banking dashboard, not a B2B SaaS console. |
| **Buyer App** | Retailers placing weekly orders | Mobile PWA, phone-OTP login | Lookbook, not SKU grid. Curated, breathable, aspirational. |

---

## 2. Sources

This design system was built from a written product spec, not a running codebase. The spec lives in the read-only mounted folder `deal-flow/` (provided via File System Access; not bundled into this project):

- `deal-flow/DealFlow App/DealFlow_Product-Spec_v1.md` — MVP scope, schemas, two-interface spec, §10 theme guidance.
- `deal-flow/DealFlow App/DealFlow_Strategic-Memo_v1.md` — positioning, pricing, scope discipline.
- `deal-flow/DealFlow App/DealFlow_Competitive-Teardown_v1.md` — what we're not.
- `deal-flow/DealFlow App/DealFlow_TAM-Monetization-Research_v1.md` — sizing.

No Figma file, no production app, no existing brand mark. Everything visual in this system — the logo, the screens, the iconography choice, the photography mood — was derived from the spec's `§10 Theme & Aesthetic — Premium Comfort` brief and Option A's "Ember & Cream" palette recommendation. **This means the design is a proposal, not a recreation; expect the user to push back on specifics.**

---

## 3. Theme: Ember & Cream

| Token | Hex | Use |
|---|---|---|
| `--cream-100` | `#FAF7F2` | Page background. Warm off-white; the whole product sits on this. |
| `--cream-300` | `#EFE9DF` | Hairline borders. Never use grey. |
| `--teal-500` | `#1F3A34` | Primary brand. Deep, calm, evergreen. Used sparingly. |
| `--ember-400` | `#C26E3A` | Accent. Warm copper. Used for moments: focus, primary CTA, "new" indicators. |
| `--cream-900` | `#1A1A1A` | Primary text. Near-black-warm — never pure `#000`. |
| `--cream-700` | `#6B6760` | Secondary text. |

The system is intentionally **two-color**: deep teal for trust, ember copper for moments of warmth. Semantic colors (success moss, warning burnt-gold, danger rust, info dusty-blue) all sit in the same warm, slightly-desaturated family so nothing feels neon or alarmist.

---

## 4. CONTENT FUNDAMENTALS

### Voice
**You speak as a trusted operations manager.** Confident, plain, never breathless. Imagine the founder of a 30-year family distributor explaining a feature to his son who just took over — that's the register.

- **Second person.** "Your catalogs," "your buyers," "you published this." Never "the user."
- **No exclamation marks.** Ever. Calm is the brand.
- **No "AI" word salad.** The spec is explicit: distributors don't buy on AI rhetoric, they buy on "₹X saved." Talk in concrete outcomes.
- **No emoji in product surfaces.** Emoji is informal and breaks the premium register. The single exception: status indicators may use small colored dots, never 🔴/🟢.

### Casing
- **Sentence case** for every UI label, button, menu item, page title. "Add a brand," not "Add A Brand" or "ADD BRAND."
- **UPPERCASE eyebrows** for section labels above headings. Tracked +0.14em. e.g. `LATEST ORDERS` above a panel title `This week's activity`.
- **Display serif (Fraunces)** for page titles and section headers — adds the "premium artisan" feel.

### Tone of copy

| Context | Sample |
|---|---|
| Empty state | "No catalogs published yet. Pick a cohort, choose products, set a validity window — your retailers see it within a minute." |
| Confirmation | "Catalog published to **North Delhi A-class** (12 buyers). Valid until 31 May." |
| Destructive confirm | "Archive this price list? Orders already placed under it will keep their prices. New orders will fall back to base." |
| Error | "We couldn't reach your Tally export endpoint. Your work is saved — try again in a moment." |
| Microcopy on a button | "Publish catalog" — not "Submit," not "Go live!" |
| Time | "Published 2 hours ago by Phani." Always include who. |
| Numbers | "₹12,40,000" (Indian comma grouping by default; setting flips to en-US). Always tabular numerals. |

### Don'ts
- ❌ "Empower," "leverage," "synergy," "seamless."
- ❌ "Order placed!! 🎉" — keep it to "Order placed. We've notified your buyer."
- ❌ "Oops!" or "Whoops!" — use "Something went wrong" calmly.
- ❌ Dark patterns — no countdown urgency, no "Are you sure you want to leave?" guilt.

---

## 5. VISUAL FOUNDATIONS

### Atmosphere
The system aims for **atmospheric calm** — like opening a curated print catalog from a private wine importer. Not flat-design SaaS, not Material, not glassmorphism. The cues:

- **Warm off-white page** (`#FAF7F2`) is the canvas everything sits on. Never pure white at the page level.
- **Generous whitespace.** Density-1 only on data tables; everything else breathes.
- **One serif for soul, one sans for clarity.** Fraunces (display) for moments; Inter for everything functional.
- **Texture is restrained.** No heavy patterns. Occasional subtle grain on hero areas (1–2% noise overlay) and a single linework "godown" motif on empty states. No emoji.
- **Photography mood (where used):** warm light, sunset/golden-hour cast, slightly desaturated. Think Aesop product photography, not Unsplash tech-stock. Imagery is layered with a low-opacity cream gradient at the bottom for text legibility ("protection gradient," not capsule chips on photo).

### Color usage rules
- **Teal is reserved.** Use it for: primary buttons, active nav items, brand mark, header glyphs. Never as a background panel except in a single hero strip.
- **Ember is precious.** Use it for: focus rings, primary destination CTA on a page (just one), "new" indicators, and one accent stroke per screen. If it's everywhere it stops meaning anything.
- **Semantic colors stay quiet.** Success is moss green, not Slack green. Danger is rust, not stoplight red.
- **Backgrounds** are cream, surface white, or a tinted teal-50 / ember-50 wash. Never a saturated color block.

### Typography rules
- **Headings = Fraunces, weight 400–500.** It's a soft serif — looks heavy at 700, so we use lower weights.
- **Body = Inter 400.** UI labels 500. Buttons 500–600.
- **Mono = JetBrains Mono** for SKUs (`SKU-2026-00471`), order numbers (`DF-2026-00123`), and any tabular ID. Never use mono for body copy.
- **Tabular numerals everywhere money lives.** `font-variant-numeric: tabular-nums` on prices, totals, table number columns.
- **Indian comma grouping by default**: `₹12,40,000` not `₹1,240,000`. Locale-flippable.

### Spacing
- Base unit **8px** with a 4px half-step.
- Page gutter: 32px on desktop, 16px on mobile.
- Card inner padding: 20–24px standard, 32–40px for hero / lookbook cards.
- Section spacing: 56–72px between major sections, 32px between subsections.

### Backgrounds
- **Page**: solid cream-100.
- **Surface cards**: white on cream, with a 1px cream-300 border. Shadow is optional — borders carry most of the weight.
- **Hero strips**: deep teal-500 with a faint film grain overlay; ember-400 used only as an accent rule or icon.
- **Empty states**: cream-50 panel, a single line illustration (the "ledger" motif), then helpful copy.
- **No full-bleed photography** except on the buyer-app catalog hero and login screen.

### Animation
- **Tone:** atmospheric, not snappy. Default ease `cubic-bezier(0.2, 0, 0, 1)`. Duration 200ms for UI, 320ms for panels, 600ms for hero reveals (parallax, fade-up).
- **No bounce on UI controls.** A soft bounce (`0.34, 1.2, 0.64, 1`) is OK only on the "order placed" success moment.
- **Fades > slides.** Cross-fade panel transitions; slide only when there's a directional metaphor (back/forward navigation).
- **No spinners on cards.** Use a content skeleton in cream-200 with a slow shimmer (1.6s).
- **No micro-interactions on hover for primary content.** The buyer app's catalog cards lift 2px on hover, that's all.

### Hover & press states
- **Hover** on interactive surfaces: shift background by one step toward warmer (`cream-100 → cream-200`) OR darken brand by ~6% (`teal-500 → teal-600`). Never use a pure black-overlay or a brightness filter.
- **Press / active**: shift one step further, plus 1px translateY downward for buttons. No scale-down.
- **Focus visible**: 3px ember ring (`box-shadow: 0 0 0 3px rgba(194, 110, 58, 0.25)`). Always visible on keyboard nav.
- **Disabled**: opacity 0.5, no pointer events. Don't grey-shift; the cream tones already feel soft enough.

### Borders & shadows
- **Default border**: 1px `--border-1` (cream-300).
- **Emphasized**: 1px `--border-2` (cream-400) for focused inputs, selected cards.
- **Shadows** are subtle and warm-tinted (teal at 4–8% alpha). Tokens: `xs`, `sm`, `md`, `lg`, `xl`. `xl` only for floating overlays (menus, toasts).
- **Inset shadow** on inputs adds a faint top-bevel — gives them a "pressed-in" calm feel rather than the Material outline.
- **Protection gradients** are used on photo overlays for buyer-app catalog hero. Capsule chips on photos are forbidden.

### Corner radii
- **4px** — tiny pills (status dots, table-cell highlights).
- **6px** — inputs, small buttons.
- **10px** — buttons, menu items, badges.
- **14px** — default card.
- **20px** — hero cards, lookbook catalog cards, modal sheets.
- **28px** — buyer-app full-bleed sheets and onboarding cards.

### Layout
- **Cockpit**: left sidebar 248px, fixed; topbar 64px, fixed; content area max 1280px, centered on wide screens.
- **Buyer app**: 360–420px PWA frame, single column, sticky bottom tab bar (4 items: Catalogs / Browse / Cart / Orders).

### Transparency & blur
- **Backdrop blur** only on: sticky topbar on scroll (8px blur, 80% cream-100), modal scrims, and the buyer-app cart drawer pull-up. Anywhere else, use solid surfaces.
- **Opacity** for disabled / muted only — never for "subtle" non-disabled elements (use lighter cream tones instead).

### Imagery mood
- **Warm, golden-hour, low-saturation.** Slightly hazy. Think morning chai, ledger paper, brass weights, jute sacks of cardamom. Cool / blue / studio-lit imagery breaks the system.
- **Product photos** for retailer-facing catalogs: brand-supplied; we render them on cream-50 with rounded-20 corners.

---

## 6. ICONOGRAPHY

DealFlow uses **Lucide** (lucide.dev) as its icon set — same family as the shadcn/ui ecosystem the spec commits to in §3.

- **Why Lucide:** stroke-based, 1.5px default weight, soft rounded line caps. Sits perfectly next to a 400-weight serif heading; never feels chunky.
- **Loading:** via CDN — `https://unpkg.com/lucide@latest/dist/lucide.min.js` and inline SVG renderers. UI kits import only the icons they need.
- **No icon font.** SVG only — sharp at any size, no FOUT, theme-able via `currentColor`.
- **Weight:** stroke 1.5 default, 1.75 for primary CTAs, 1.25 for dense tables.
- **Size scale:** 14 / 16 / 18 / 20 / 24px. Buyer app uses 20 / 24 / 28. Anything larger becomes an illustration, not an icon.
- **Color:** icons inherit `currentColor` and default to `--fg-3` (muted). Active nav icons use `--fg-brand` (teal); destructive icons use `--danger-500`.

### Emoji & unicode
- **No emoji in product UI**, ever. Decorative emoji breaks the calm register.
- **Unicode characters** allowed only as functional glyphs: `↗` external link, `↩` reply, `·` separator, `₹` rupee symbol, `→` next.
- **Status dots** are CSS circles in semantic colors, not emoji.

### Custom marks
- **Logo**: a hand-drawn deep-teal ligature of "DF" inside a soft rounded square, paired with the wordmark `DealFlow` set in Fraunces 500. See `assets/logo.svg`.
- **Empty-state illustrations**: single-weight linework in `--cream-500`, evoking ledger / godown shelves / kraft boxes. One per empty surface; never decorative on filled ones.
- **Avatars**: tenant initials on a tinted-cream block with ember accent border. Never gradient avatars.

### Substitution flag
We did **not** receive a brand-defined icon set or any production code. Lucide is a **proposed substitution** chosen because it (a) matches shadcn/ui, the spec's locked component framework, and (b) fits the stroke aesthetic of the Ember & Cream theme. If the user has a preferred icon library, swap the CDN reference and the size scale stays compatible.

---

## 7. Index

```
DealFlow Design System/
├── README.md                ← you are here
├── SKILL.md                 ← Agent Skills entry point (Claude Code compatible)
├── colors_and_type.css      ← CSS variables + element defaults
├── assets/
│   ├── logo.svg                                 ← Mark + wordmark lockup
│   ├── logo-mark.svg                            ← Standalone mark
│   ├── illustration-empty-catalog.svg           ← Linework ledger motif
│   ├── illustration-empty-orders.svg            ← Linework kraft-box motif
│   └── pattern-grain.svg                        ← Subtle noise overlay for hero areas
├── fonts/                   ← (empty — fonts served via Google CDN; see §8 caveats)
├── preview/                 ← Design-system specimen cards (registered for the Design System tab)
│   ├── _card.css                                ← Shared card chrome
│   ├── card-brand-*.html                        ← Voice, logo, logo-variants, illustrations
│   ├── card-color-*.html                        ← Teal, ember, cream, semantic, semantic-tokens
│   ├── card-type-*.html                         ← Display, body, mono, composition
│   ├── card-spacing-*.html                      ← Scale, radii, shadows
│   └── card-cmp-*.html                          ← Buttons, inputs, badges, table, nav, cards, empty, alerts, toggles, search, catalog/product cards
└── ui_kits/
    ├── cockpit/                                 ← Distributor Cockpit · desktop
    │   ├── README.md
    │   ├── index.html                           ← Open this to view the kit
    │   ├── cockpit.css
    │   ├── data.jsx · icons.jsx · Common.jsx · Shell.jsx
    │   ├── Dashboard.jsx · Catalogs.jsx · Publisher.jsx · Orders.jsx
    └── buyer-app/                               ← Buyer App · mobile PWA
        ├── README.md
        ├── index.html                           ← Open this to view the kit
        ├── buyer.css
        ├── ios-frame.jsx · data.jsx · icons.jsx
        └── Screens.jsx                          ← Login → Home → Catalog → Product → Cart → Placed → Orders
```

Source spec (read-only, mounted via File System Access): `deal-flow/DealFlow App/*.md` — kept outside this folder.

---

## 8. Caveats & open questions

- **Fonts are loaded via Google Fonts CDN, not bundled.** Fraunces and Inter are both there. For an offline / production build, download `Fraunces[opsz,wght].ttf`, `Inter-Variable.ttf`, `JetBrainsMono-Variable.ttf` into `fonts/` and replace the `@import` in `colors_and_type.css` with `@font-face` rules.
- **No real logo provided.** The DF ligature mark is a proposal; happy to iterate or swap for a wordmark-only treatment.
- **Lucide is a proposed icon set.** Flag in §6.
- **No photography assets provided.** UI kits use neutral product placeholders. Real catalog imagery should come from brand principals.
- **The competitive teardown calls out Zotok's "network CRM" framing as the thing to avoid.** DealFlow's design intentionally avoids any visual reference to chat-app aesthetics (WhatsApp green, bubble messaging) even though the buyer pipeline runs through WhatsApp in Phase 2.

---
