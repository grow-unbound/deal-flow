# Metrics v4 — Final list for build

Date: 2026-07-30
Status: Final. Supersedes `metrics-v3-recommended.md` and `metrics-v3-review-2026-07.md` — this is the doc to hand to Claude Code.

## Time-basis framework

Two kinds of KPI, and they behave differently on a period selector:

**Flow metrics** (value/count *created* in a window — Invoiced Sales, Demand created, Campaign sends): valid at any grain. Today, This Week, This Month, This Quarter, Last Month, Last Quarter all produce a real, correctly-small-or-large number. No floor needed — a small number on "Today" is the truth, not a bug.

**Coverage/velocity metrics** (did this entity sell, is it dormant, is it repeat-active — Products that sold, Did-not-sell, Out-of-stock-recently-sold, Running low, Repeat App Customers, Active/Dormant Customers, Grouped customers who purchased, Top-revenue concentration): these need enough transaction density to mean anything. A B2B wholesale buyer might order every 2–4 weeks, so "Today" or "This Week" on these cards will read as false near-zeros, not real signal.

**Rule:** flow metrics take whatever the page-level selector is set to (default This Month, options Today / This Week / This Month / This Quarter / Last Month / Last Quarter). Coverage/velocity metrics default to **This Quarter** regardless of the page selector, and simply don't offer Today/This Week as choices on those specific cards — grey out or omit rather than show a misleading number. This replaces "90 days" as a concept everywhere; This Quarter is calendar-predictable and close enough in size to do the same job.

**One exception, and why it's not an inconsistency:** Brands and Locations keep **This Month** for their coverage-style cards (Active brands, Did-not-sell, Dormant brands, Top-80% lists) rather than This Quarter. Reason: cardinality. You have ~15 brands and a handful of locations, vs. 451+ products and thousands of customers — a low-cardinality entity doesn't need a wide window to produce a stable, non-noisy count. Products, Categories, and Customers default to This Quarter for the same reason in reverse: high cardinality needs the wider window to avoid noise.

**Dropped ₹ cards aren't lost** — Products, Brands, and Categories had their Invoiced Sales / Demand headline cards removed from Pulse per your instructions below. That revenue figure still exists as a sortable table column on each of those pages; it's just not competing for one of the four card slots anymore. Revenue already has a clear home on Dashboard, Invoices, and (for Locations) the Locations page.

## Dashboard

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Invoiced Sales · This Month | Y customers · Z invoices | Month | → Invoices, this month |
| Demand · This Month | Y customers · Z estimates/orders | Month | → Orders (or Estimates), this month |
| Outstanding dues | Y customers · Z invoices | NOW | → Invoices, balance > 0 |
| Overdue receivables | Y customers · Z invoices | NOW | → Invoices, overdue = true |

## Estimates

Table toolbar owns its own selector (Today/Week/Month/Quarter/Custom), default This Month. Pulse/Actions below stay NOW except the headline value card.

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Estimate value created | Y customers · Z estimates | Month (selector) | date = selected period |
| Open estimates | Y customers · Z estimates | NOW | status = open |
| Awaiting action 3+ days | Y customers · Z estimates | NOW | status = sent, age ≥ 3d |
| Expiring in 7 days | Y customers · Z estimates | NOW | expiry ≤ 7d |

## Sales Orders

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Order value created | Y customers · Z orders | Month (selector) | date = selected period |
| Open orders | Y customers · Z orders | NOW | status = non-terminal |
| Waiting for confirmation | Y customers · Z orders | NOW | status = received, unconfirmed |
| Awaiting dispatch 3+ days | Y customers · Z orders | NOW | status = confirmed, age ≥ 3d |

## Invoices

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Invoiced Sales · This Month | Y customers · Z invoices | Month (selector) | date = selected period |
| Outstanding dues | Y customers · Z invoices | NOW | balance > 0 |
| Overdue receivables | Y customers · Z invoices | NOW | overdue = true |
| Due in 7 days | Y customers · Z invoices | NOW | due date ≤ 7d |

## Customers

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Active Customers | X% purchased at least once | This Quarter | purchased ≥1x in quarter |
| Dormant Customers | ₹X sales in prior period | This Quarter | purchased before window, not inside it |
| Overdue receivables | Y customers · Z invoices | NOW | overdue balance > 0 |
| Top customers driving 80% of revenue | "562 of 10,412 customers" | This Quarter (or trailing 12mo) | sorted by revenue desc, cutoff marker at 80%; multi-select → Broadcast |

Active and Dormant both moved off This Month/Today to This Quarter — a Today or month-start read would show near-zero active customers and near-everyone as dormant, which is the exact false signal you flagged. All three customer-value cards (Active, Dormant, Top-80%) now share one timeline, which also makes them usable together (e.g., "dormant but was in the top 80%" is now a coherent cross-filter).

## Products

Invoiced Sales removed from Pulse (still a table column). Page becomes pure inventory/velocity signal.

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Products that sold | Y products · Z% of all products | This Quarter | sold ≥1x in quarter |
| Recently sold, now out of stock | Y products · Z% of all products | This Quarter + NOW | sold in quarter AND stock = 0 |
| Products running low | Y products · Z% of all products | This Quarter + NOW | sold in quarter AND stock ≤ cover threshold |
| Products that did not sell | Y products · current stock units (secondary text) | This Quarter + NOW | not sold in quarter AND stock > 0 |

## Buyer App

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Customers with app access | Y% of customers | NOW | → Customers, access = enabled |
| Customers submitting App Demand | Y% of enabled customers | Month (selector) | → Customers, submitted demand this period |
| App-sourced Demand (Orders/Estimates) | Y% of total demand | Month (selector) | → Orders/Estimates, source = app |
| Repeat App Customers | Y% of enabled customers | This Quarter | → Customers, ≥2 app demand docs in quarter |

"App-sourced Demand" replaces "App-sourced Invoiced Sales" — demand (an order or estimate submitted through the app) is the direct signal of buyer engagement with the app itself. Whether that demand becomes an invoice depends on your team confirming and dispatching it — that's outlet execution, not buyer behavior, and belongs on Orders/Invoices, not here.

## Campaigns

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Live Campaigns | Y expiring in 7 days | NOW | status = live |
| Campaign Open rate | X of Y customers viewed | This Quarter | campaigns with opens in quarter |
| Campaign demand | Y customers · Z estimates/orders | This Quarter | campaigns with linked demand in quarter |
| Campaign revenue | Y customers · Z invoices | This Quarter | campaigns with linked invoices in quarter |

> Note - useful callouts that are being removed - Live Campaigns with weak opens; Many openers, no demand; Expiring campaigns with engaged non-buyers;

## Customer Groups

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Active groups | Y customers | NOW | status = active |
| Customers assigned to a group | of Y total customers | NOW | → Customers, group ≠ none |
| Valuable customers in no group | of Y total customers | This Quarter + NOW | → Customers, group = none, quarter sales > threshold |
| Grouped customers who purchased | of Y groups | This Quarter | member purchased in quarter |

## Price Lists

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Products with custom prices | Y% of all products | NOW | has override on active pricelist |
| Customers with custom pricing | Y% of all customers | NOW | → Customers, has override |
| Products below base rate | Y price lists | NOW | override < base price |
| Price lists expiring in 7 days | of Y price lists | NOW | expiry ≤ 7d |

## Brands

₹ cards removed from Pulse (Invoiced Sales, Demand — still table columns). This Month kept intentionally — low cardinality (~15 brands) makes a month window stable; see framework note above.

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Active brands | Y% of all brands | Month | ≥1 sale this month |
| Top 80% brands | "X of Y brands" | Month | sorted by revenue desc, cutoff marker |
| Brands that did not sell | Y% of all brands | Month | 0 sales this month |
| Dormant brands (sold last month, not this) | Y% of all brands | Month (current vs. prior month) | sold last month AND not this month |

## Locations

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Invoiced Sales · This Month | Y locations · Z invoices | Month | → Invoices, this location, this month |
| Open demand | Y locations · Z estimates/orders | NOW | open primary-demand at location |
| Overdue receivables | Y locations | NOW | overdue balance > 0 |
| Top 80% locations | "X of Y locations" | Month | sorted by revenue desc, cutoff marker |

## Warehouses

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Sellable Units in stock | Y products | NOW | stock = sellable |
| Unique SKUs across warehouses | Y warehouses | NOW | — (context card) |
| Recently sold, now out of stock | Y warehouses | This Quarter + NOW | sold in quarter AND stock = 0 |
| No sales in period | Y warehouses | This Quarter + NOW | stock > 0 AND no sale in quarter |

## Categories

₹ card removed from Pulse (Invoiced Sales — still a table column).

| KPI | Supporting text | Time basis | Filter on click |
|---|---|---|---|
| Categories that sold | Y categories · Z% of all categories | This Quarter | sold ≥1x in quarter |
| Recently sold, now out of stock | Y categories · Z% of all categories | This Quarter + NOW | sold in quarter AND stock = 0 |
| Categories running low | Y categories · Z% of all categories | This Quarter + NOW | sold in quarter AND stock ≤ threshold |
| Categories that did not sell | Y categories · current stock units | This Quarter + NOW | not sold in quarter AND stock > 0 |

## Open questions before build

- "Cover threshold" for running-low needs a number (days of stock remaining) — not specified yet.
- "Valuable" for Groups' no-group-customers card and "high-value" wording elsewhere needs one shared threshold definition, reused everywhere it appears.
- Confirm whether Last Month / Last Quarter comparison values (e.g. "+12% vs last quarter") ship in this pass or later — this doc specifies the periods themselves, not delta/comparison rendering.
