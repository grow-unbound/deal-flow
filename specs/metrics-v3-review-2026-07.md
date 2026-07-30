# Metrics v3 — Review & Filters Mapping

Date: 2026-07-30
Status: Review of `specs/metrics-v3-recommended.md` against (1) customer's explicit ask (financial = Today/Week/Month/Quarter/Year + Last-period; inventory = 90d evened) and (2) Phani's V1 simplification (This Month default everywhere, extendable to This Week/Quarter; NOW metrics for outstanding/overdue/enabled-disabled; almost all KPIs clickable → filter the table below).
Companion: `specs/metrics-v3-recommended.md`, `metrics-product-strategy-proposal-2026-07.md` (uploaded, full v2 rationale/feasibility)

## Verdict up front

24 of 52 metrics need a change before build. Five repeating problems, not 24 independent ones:

1. **Inventory/stock-risk metrics are scoped to "This Month" instead of 90 days — the one thing the customer explicitly asked to keep at 90d.** Products, Warehouses, and Categories all have "out of stock" / "running low" / "no sale" KPIs currently labelled "this month." On the 2nd of a month, a genuinely fast-moving SKU that sold 40 units in the trailing 90 days but hasn't sold yet this month would get miscounted as a false stockout signal, and a real recent stockout would get hidden until enough of the month has passed. This is 8 rows across 3 modules — the biggest fix in this review.
2. **"This Month" is used as a label on metrics that are actually NOW-basis** — Invoices page (Outstanding dues, Overdue receivables, Due in 7 days) and Locations page (Open demand, Overdue receivables) all say "This Month" in the table even though the same metric is correctly labelled "As of now" on the Dashboard row two lines above. Looks like a copy-paste artifact down the column. If built as literally specified, clicking "Overdue receivables" on the Invoices page would hide overdue invoices from prior months — the opposite of what the metric is for.
3. ~~"Contribute to 80% of business" is an arbitrary threshold, drop it~~ — **retracted for Customers.** Validated directly with your first customer: 10k+ buyers, top 562 = 80% of revenue, and the reaction was immediate — "give me that list, I'll take real care of them and campaign to them." That's a concrete action (account prioritization + targeted campaigns), which is exactly what my original objection said was missing. Keep it for Customers, but change two things before build: (a) run it on a stable window — 90d or trailing 12 months, not "This Month." On day 2 of a month, "top customers by this-month revenue" is mostly noise, and this metric only earns trust if the list doesn't reshuffle every few days. (b) frame it as a ranked list with a cutoff marker ("562 of 10,412 customers"), not a per-customer in/out badge — the boundary count drifting by a few customers period to period is fine and expected; what would feel broken is one specific named account flickering in and out of a "VIP" label. Brands and Locations still don't have an equivalent validated action — "take good care of" doesn't map onto a brand or a location the way it does a customer relationship. Keep those two in Explore for now rather than default Pulse, unless you've seen the same reaction there.
4. **Campaign metrics are scoped to "This Month" but campaigns don't respect calendar-month boundaries** — a campaign sent July 28 will show a partial, later-revised open rate at month-end. Trailing 90 days (list-level) or lifetime (per-campaign) is what the v2 doc already recommends here, for a reason.
5. **One vague metric ("Groups driving sales") and one workflow gap (Orders skips the confirmation-backlog stage in favor of two dispatch-adjacent cards).** Both called out below with a concrete replacement.

Financial-metric period selector (Today/Week/Month/Quarter/Year + Last-period) — your V1 scope-down to This Month default + This Week/This Quarter extension is the right call for now. Shipping "Last period" comparisons doubles the query surface (every flow metric needs a same-shape prior-period query) for a feature that's genuinely nice-to-have, not the thing your first customer complained about. Sequence it after the click-to-filter integration ships, not before.

## Detail page: keep KPIs, don't drop them for the split view

Two different things were living under "Detail page" and they don't get the same answer:

- **Documents (Estimate/Order/Invoice detail):** the v2 doc already recommends **zero** KPI cards here — the document itself (totals, status, line items, dates) already answers "what's the state of this thing." Adding a Performance strip on top duplicates it. This doesn't change with a split view; if anything a narrower pane makes the case for zero KPI cards stronger.
- **Entities (Customer/Product/Brand/Group/Pricelist/Location/Category detail):** these aren't self-describing the way a document is. Opening a customer needs "Overdue amount, Credit used, Invoiced 90d" to know whether to approve a new order or chase collections — that's decision context nothing else on the page provides. Don't drop these because the pane got narrower; compress them. Your own product-detail screenshot already proves the pattern works at reduced width (Units·MTD, Days of Cover, On Hand, Sell-through as four small stat blocks, not four large cards) — reuse that density in the split pane rather than removing the facts.

So: skip KPIs on document detail (already true today), keep them — compressed — on entity detail. Don't generalize "split view means no KPIs" across both.

## Full list with verdicts and filters

Legend — **Verdict:** ✅ agree · ⚠️ agree with change · ❌ disagree, replace. **Filters** = chips always available on that table, then what the KPI click adds on top.

### Dashboard

Table filters: n/a (dashboard has no table; each KPI click should route to the relevant module's filtered table).

| KPI | Verdict | Time basis | KPI-click destination + filter |
|---|---|---|---|
| Invoiced Sales · This Month | ✅ | Month | → Invoices table, date = this month |
| Demand · This Month | ✅ | Month | → Orders table if Orders enabled else Estimates, date = this month, status = non-cancelled |
| Outstanding dues | ✅ | NOW | → Invoices table, balance > 0 |
| Overdue receivables | ✅ | NOW | → Invoices table, overdue = true |

### Estimates

Table filters: Status, Customer, Location, Campaign, Source, Date range.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Estimates Value · This Month | ✅ | Month | date = this month |
| Open estimates | ✅ | NOW | status = open (sent/accepted, not converted/expired) |
| Awaiting action 3+ days | ✅ | NOW | status = sent, age ≥ 3d |
| Expiring in 7 days | ✅ | NOW | expiry ≤ 7d, status = open |

### Sales Orders

Table filters: Status, Customer, Location, Campaign, Source, Date range.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Orders Value · This Month | ✅ | Month | date = this month |
| Open orders | ✅ | NOW | status = non-terminal, non-cancelled |
| Awaiting dispatch 3+ days | ✅ | NOW | status = confirmed, age ≥ 3d |
| Dispatch in 7 days | ❌ — replace with **Waiting for confirmation** | NOW | status = received, not yet confirmed/rejected |

Reasoning: your order lifecycle is draft → received → confirmed → dispatched → delivered. "Awaiting dispatch" and "dispatch in 7 days" both watch the same late-stage bottleneck; the earlier, easier-to-forget bottleneck — orders sitting unconfirmed — has no card at all. That's usually the higher-risk queue (a customer waiting to hear if their order was even accepted). Swap "Dispatch in 7 days" for it.

### Invoices

Table filters: Status, Customer, Location, Campaign, Source, Date range.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Invoices Value · This Month | ⚠️ rename to "Invoiced Sales" for consistency with Dashboard/Products/Brands/Categories | Month | date = this month |
| Outstanding dues | ⚠️ fix label: NOW, not This Month | NOW | balance > 0 |
| Overdue receivables | ⚠️ fix label: NOW, not This Month | NOW | overdue = true |
| Due in 7 days | ⚠️ fix label: NOW, not This Month | NOW | due date ≤ 7d, balance > 0 |

### Customers

Table filters: Status (active/dormant), Group, Pricelist, Location, Buyer App access.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Active Customers · This Month | ✅ | Month | purchased ≥ 1x this month |
| Dormant Customers | ✅ — confirmed valuable, this is the customer's second explicit ask (win-back candidates for targeted campaigns). Window is flexible per your note; recommend defaulting to 90d rather than calendar month for the same stability reason as the revenue-concentration metric — "purchased before, nothing in the trailing 90 days" is a cleaner, less noisy signal than a month boundary that resets every 1st | 90D (or Month, your call) | → Customers table, purchased before window AND no purchase inside window; supports multi-select → Broadcast campaign |
| Overdue receivables | ✅ | NOW | overdue balance > 0 |
| Top customers driving 80% of revenue | ✅ — validated with customer, keep. Rename from "80% Revenue Customers"; run on 90d or trailing 12mo, not This Month; show as ranked list with cutoff count, not a per-customer badge | 90D or 12M | → Customers table sorted by trailing revenue desc, cutoff line at the 80% mark; supports multi-select → Broadcast campaign |

### Products

Table filters: Brand, Category, Status, Stock (in/low/out).

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Invoiced Sales · This Month | ✅ (financial metric, calendar month is the right mental model) | Month | date = this month |
| Products that sold · This Month | ⚠️ switch to 90d — this is a velocity/coverage metric, not a revenue metric, and reads noisy in the first days of a month | 90D | had ≥1 invoice line in trailing 90d |
| Products sold this month out of stock | ❌ switch to 90d | NOW+90D | sold in last 90d AND stock = 0 |
| Products sold this month running low | ❌ switch to 90d | NOW+90D | sold in last 90d AND stock ≤ cover threshold |

### Buyer App

Table filters: n/a (channel dashboard, not a list page) — Actions/Explore rows link out to Customers table.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| App sourced Invoiced Sales · This Month | ✅ | Month | → Invoices table, source = app, date = this month |
| Customers with app access | ✅ | NOW | → Customers table, app access = enabled |
| Customers submitting App Demand · This Month | ✅ | Month | → Customers table, submitted demand via app this month |
| Repeat App Customers | ⚠️ switch to 90d — "repeat" is a behavior accumulated over more than a calendar month; resets misleadingly on the 1st | 90D | → Customers table, ≥2 app demand docs in 90d |

### Campaigns

Table filters: Status (live/scheduled/expired), Location, Product.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Live Campaigns | ✅ | NOW | status = live |
| Campaign Open rate · This Month | ❌ switch to 90d trailing (list-level) — campaigns don't respect calendar-month boundaries, a campaign spanning month-end shows a partial number that later silently changes | 90D | campaigns with opens in trailing 90d |
| Campaign demand · This Month | ❌ switch to 90d trailing | 90D | campaigns with linked demand in trailing 90d |
| Campaign revenue · This Month | ❌ switch to 90d trailing | 90D | campaigns with linked invoices in trailing 90d |

### Customer Groups

Table filters: has active pricelist, has live campaign.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Active groups | ✅ | NOW | status = active |
| Customers assigned to a group | ✅ | NOW | → Customers table, group ≠ none |
| Valuable customers in no group | ✅ (define "valuable" = 90d invoiced sales above a threshold) | NOW+90D | → Customers table, group = none, 90d sales > threshold |
| Groups driving sales | ❌ — too vague as stated; replace with **"Grouped customers who purchased — count + % of grouped customers, 90d"** | 90D | member purchased in trailing 90d |

### Price Lists

Table filters: Status (active/expired), Scope (customer/group/all).

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Products with custom prices | ✅ | NOW | product has an override on an active pricelist |
| Customers with custom pricing | ✅ | NOW | → Customers table, has direct/group/all-buyer override |
| Products below base rate | ✅ | NOW | override price < base selling price |
| Price lists expiring in 7 days | ✅ | NOW | expiry ≤ 7d |

### Brands

Table filters: Status, Category.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Invoiced Sales · This Month | ✅ | Month | date = this month |
| Demand · This Month | ✅ | Month | date = this month |
| Active brands · This Month | ✅ | Month | ≥1 invoiced sale this month |
| Brands that contribute to 80% business · This Month | ⚠️ move to Explore, not Pulse — no validated action yet the way there is for Customers. If you want a fourth Pulse card instead, **"Brands with no sale in 90 days"** has a clearer action (renegotiate or delist) | — | 90d invoiced sales = 0 |

### Locations

Table filters: Status.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Invoiced Sales · This Month | ✅ | Month | date = this month |
| Open demand · This Month | ⚠️ fix label: drop "This Month," it's NOW | NOW | open primary-demand docs at this location |
| Overdue receivables · This Month | ⚠️ fix label: drop "This Month," it's NOW | NOW | overdue balance > 0 for invoices at this location |
| Locations that contribute to 80% business · This Month | ⚠️ move to Explore, not Pulse — same reasoning as Brands, no validated action yet | — | — |

### Warehouses

Table filters: linked location, stock status.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Sellable Units in stock | ✅ | NOW | stock = sellable |
| Unique SKUs across warehouses | ✅ | NOW | — (context card, weak click target; fine to leave non-clickable) |
| Products sold this month out of stock | ❌ switch to 90d | NOW+90D | sold in last 90d AND stock = 0 |
| Products with no sales this month | ❌ switch to 90d — this is literally the metric the customer asked to keep at 90d, currently scoped to a month | NOW+90D | stock > 0 AND no sale in last 90d |

### Categories

Table filters: Status.

| KPI | Verdict | Time basis | KPI-click filter |
|---|---|---|---|
| Invoiced Sales · This Month | ✅ | Month | date = this month |
| Categories that sold · This Month | ⚠️ switch to 90d, same reasoning as Products | 90D | ≥1 invoice line in trailing 90d |
| Categories sold this month out of stock | ❌ switch to 90d | NOW+90D | sold in last 90d AND stock = 0 |
| Categories sold this month running low | ❌ switch to 90d | NOW+90D | sold in last 90d AND stock ≤ cover threshold |

## Summary of changes needed before build

- **8 rows** (Products ×2, Warehouses ×2, Categories ×3, +Products "that sold" borderline) — switch window from This Month to 90d.
- **5 rows** (Invoices ×3, Locations ×2) — fix mislabeled time basis, NOW not This Month.
- **1 row** (Customers) — keep the 80%-of-revenue metric, validated with the customer; rename, move off calendar-month to 90d/12mo, reframe as ranked list not per-row badge.
- **2 rows** (Brands, Locations) — move the 80%-of-business version to Explore, not Pulse; no validated action there yet.
- **1 row** (Customers) — keep Dormant Customers, recommend 90d window over calendar month for stability, wire it to the Broadcast/campaign action.
- **3 rows** (Campaigns) — switch to 90d trailing.
- **2 rows** — replace: Orders "Dispatch in 7 days" → "Waiting for confirmation"; Groups "driving sales" → "Grouped customers who purchased."
- **1 naming fix** — "Invoices Value" → "Invoiced Sales" for consistency.

Everything else (38 of 52) confirmed as-is.
