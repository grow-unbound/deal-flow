# Yukti Metrics Product Strategy — Proposal

Date: 2026-07-14

Status: Product proposal for review; not yet the canonical metric dictionary

Scope: Seller navbar modules under Operations and Growth, plus the Seller Dashboard and Buyer App contribution dashboard
Out of scope: physical data models, trigger/RPC design, refresh jobs, and migration sequencing

## Executive recommendation

Yukti should not try to win by showing the most numbers. It should win by answering four questions on every screen:

1. **What needs attention now?** Exceptions with money, customer, owner, age, and next action.
2. **Where is value being won or lost?** Revenue, margin, conversion, collections, and stock availability.
3. **What lever can the distributor pull?** Call, collect, price, replenish, transfer, publish, or enable.
4. **What changed enough to matter?** Comparisons only where they alter a decision and are cheap enough to sustain.

The default UI should use four recommended KPIs (marked `★`) from each six-option portfolio and three recommended callouts from each four-option portfolio. The other options are alternates for tenant maturity, permissions, or later experimentation.

## Cost and maintenance guardrails

This proposal deliberately does not prescribe tables. It classifies the *kind of computation* so the later data-design phase can choose the lightest implementation.

| Code | Computation class | Product rule |
|---|---|---|
| `NOW` | Current state, balance, status, date, or count | Cheapest. Prefer for operational landing pages and table rows. |
| `PERIOD` | One bounded aggregate for the selected period | Good for tenant totals and low-cardinality dimensions. |
| `DETAIL` | Entity-scoped calculation when its details page opens | Preferred for buyer/product history and mixes. Never precompute it for every entity every day. |
| `SMALL-HIST` | Period history for a small dimension such as brand, category, location, warehouse, campaign, or group | Acceptable when the comparison changes a decision. Monthly or weekly buckets are normally enough. |
| `EVENT` | Existing campaign/app event funnel | Use bounded event queries or counters; do not duplicate them into buyer-by-day facts. |

Hard rules:

- Do **not** maintain daily history per buyer or per product merely to display a trend arrow. Buyer/product tables should show current posture plus one bounded rolling aggregate; richer history is calculated when details open.
- Prefer rolling 90-day values for high-cardinality row ranking. MTD is too volatile early in a month and previous-MTD growth per buyer/SKU is noisy and expensive.
- Keep trends for tenant totals and small dimensions. Monthly buckets are sufficient for strategy; daily buckets are reserved for short-lived campaign funnels or genuine operational SLAs.
- A callout is a ranked worklist, not a leaderboard. Every item needs a reason, value at risk/opportunity, age or deadline, and a direct action.
- Counts alone are secondary. Pair count with rupee exposure, affected buyers, affected units, or conversion opportunity.
- Gross margin is seller-admin only. Seller-assistant equivalents should use revenue, units, fulfillment, or location-scoped exposure.
- “Buyer App contribution” means source/channel contribution. Do not label it incremental revenue unless Yukti later runs a defensible holdout or causal test.
- Empty states should state the threshold used and what “healthy” means; “none right now” without a rule is not intelligence.

## Shared definitions to finalize in the canonical dictionary

- **Selected-period sales:** order value for flow/operations decisions; invoiced value for realized sales and stock-clearance decisions. Each card must name the document basis.
- **Active buyer:** buyer with at least one non-void business document in the selected period. On customer surfaces, prefer an order/invoice-based variant to avoid classifying a quote-only lead as a purchasing buyer.
- **Dormant / win-back buyer:** no order for longer than the buyer's expected cadence (fallback fixed threshold only when history is sparse), with prior meaningful spend. Never treat every never-ordered record as a dormant buyer.
- **Open order book:** value of non-terminal, non-cancelled orders not fully fulfilled.
- **At-risk order value:** open-order value past promised/expected milestone or blocked by stock, credit, or approval.
- **Receivables / overdue:** positive outstanding balance on eligible invoices; overdue only when due date has passed.
- **Conversion:** cohort of eligible source documents, not a ratio assembled from unrelated period totals. Always show numerator, denominator, and window.
- **Stock cover:** available stock divided by recent fulfilled/invoiced daily velocity; return “insufficient history” rather than infinity.
- **Dead/slow stock:** inventory with no or low fulfilled/invoiced movement over a configurable window, shown as inventory value, not merely SKU count.
- **Buyer penetration:** purchasing buyers divided by eligible/active buyers in the same scope and period.

---

# Operations modules

## 1. Estimates

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Open estimate pipeline — count + value | How much quoted demand still needs progression? | `NOW` | Include |
| ★ Follow-up overdue — count + value older than SLA | Where is seller follow-up already late? | `NOW` | Include |
| ★ Expiring in 7 days — count + value | What must be recovered before the commercial window closes? | `NOW` | Include |
| ★ Estimate-to-order conversion — cohort rate + converted value | Are estimates becoming real demand? | `PERIOD` | Include |
| Median time to order | Is the sales cycle slowing enough to intervene? | `PERIOD` | Exclude |
| Buyer App estimate share — value + share | How much qualified demand is self-serve? | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ High-value follow-ups due | Open estimates ordered by value × age; call/message owner or buyer. | `NOW` | Include |
| ★ Expiring without response | Soonest expiry, then value; extend, revise, or close. | `NOW` | Include |
| ★ Availability or price risk | Estimates containing unavailable items, expired prices, or margin-floor breaches; substitute/reprice. | `NOW` | Include |
| Stale drafts | Drafts never sent after an SLA; finish or discard. | `NOW` | Exclude |

**Table-row intelligence:** do not add historical aggregates. Show document value, age/expiry or follow-up due, and item/availability exception count. Source and owner remain useful dimensions, not aggregates.

### Estimate details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Estimate value | Commercial size of this opportunity. | `NOW` | Include |
| ★ Days open / days to expiry | Urgency. | `NOW` | Include |
| ★ Expected gross margin ₹ and % | Whether the quote is worth winning; admin only. | `NOW` | Include |
| ★ Availability coverage — % lines/units available | Whether it can be fulfilled as quoted. | `NOW` | Include |
| Buyer credit headroom after conversion | Whether conversion creates a credit block. | `DETAIL` |
| Item count / total units | Operational complexity. | `NOW` |

Do not add a generic Performance trend for a single estimate. Use an **Opportunity intelligence** tab:

| Card | Format | What to show |
|---|---|---|
| Quote composition | Stacked bar + list | Value by brand/category and top-value lines. |
| Price and margin exceptions | Exception list | Discount, price source, margin-floor breaches, and repricing action. |
| Fulfillment readiness | Progress bar + exceptions | Available, short, and unassigned quantities by warehouse. |
| Buyer context | Compact scorecard | Last order, 90-day spend, overdue amount, credit headroom. |
| Engagement timeline | Event timeline | Created, sent, viewed/responded if known, revised, expiry, owner follow-up. |
| Conversion path | Status flow | Linked order or explicit reason lost/expired; no fabricated trend. |

## 2. Sales Orders

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Open order book — count + value | How much committed demand remains to fulfill? | `NOW` | Include |
| ★ At-risk / overdue fulfillment — count + value | What revenue or trust is in danger now? | `NOW` | Include |
| ★ Stock-blocked demand — orders + value short | What must be replenished, substituted, or transferred? | `NOW` | Include |
| ★ Dispatch due today / next 7 days — count + value | What must operations execute next? | `NOW` | Include |
| Fill rate — fulfilled units ÷ ordered units | Are we serving demand completely? | `PERIOD` | Exclude |
| Cancellation rate + cancelled value | Is order quality or fulfillment failure worsening? | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Orders blocked by stock | Value at risk, short SKUs, promised date; allocate, transfer, substitute. | `NOW` | Include |
| ★ Dispatch SLA breached | Oldest/highest-value overdue milestones; assign and dispatch. | `NOW` | Include |
| ★ High-value orders awaiting confirmation | Value × age; approve, verify credit, or contact buyer. | `NOW` | Include |
| Credit/payment blocked orders | Headroom shortfall or payment prerequisite; collect or override with authority. | `NOW` | Exclude |

**Table-row intelligence:** aggregates/trends are not worthwhile. Show order value, age/promised date, and fulfillment coverage or shortage count. Keep source, status, and buyer as dimensions.

### Sales order details

| Header KPI option | Decision supported | Class | Descision |
|---|---|---|---|
| ★ Order value | Commercial commitment. | `NOW` | Include |
| ★ Fulfillment coverage / fill rate | Readiness and remaining work. | `NOW` | Include |
| ★ Gross margin ₹ and % | Profitability; admin only. | `NOW` | Include |
| ★ Promised-date status | Days remaining or overdue. | `NOW` | Include |
| Payment received / amount due | Whether payment blocks execution. | `NOW` | Exclude |
| Units and lines remaining | Operational workload. | `NOW` | Exclude |

Use an **Execution intelligence** tab rather than a document trend:

| Card | Format | What to show |
|---|---|---|
| Fulfillment readiness | Line-level progress | Ordered, allocated, fulfilled, cancelled, and short quantities. |
| Stock exceptions | Ranked list | Short SKUs, warehouse options, transfer/substitute action. |
| SLA tracker | Milestone timeline | Confirmation, allocation, dispatch, delivery and lateness. |
| Payment and credit | Scorecard | Paid/due, buyer exposure, headroom, blocking reason. |
| Margin and mix | Bar + exceptions | Contribution by category/brand and low-margin lines. |
| Document chain | Flow | Source estimate/app, invoice(s), shipment and status; highlight missing next document. |

## 3. Invoices

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Total receivables — amount + invoice count | How much cash remains to collect? | `NOW` | Include |
| ★ Overdue receivables — amount + count + buyer count | How much exposure already needs action? | `NOW` | Include |
| ★ Due in next 7 days — amount + count | What collections work should be scheduled now? | `NOW` | Include |
| ★ 30+ day overdue — amount + share of receivables | Where is loss risk concentrated? | `NOW` | Include |
| Collection efficiency — cash collected ÷ amount due in period | Is collections execution effective? | `PERIOD` | Exclude |
| Invoiced gross margin ₹ and % | Is realized business profitable? Admin only. | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Largest overdue exposures | Buyer + oldest invoice + total overdue; call/collect. | `NOW` | Include |
| ★ Newly overdue | Invoices crossing due date since last review; intervene early. | `NOW` | Include |
| ★ Due soon, high value | Next 7 days ranked by value and buyer exposure; schedule reminder. | `NOW` | Include |
| Credit-limit pressure | Buyers whose receivables plus open orders exceed policy; hold/review. | `NOW` | Exclude |

**Table-row intelligence:** no historical aggregate is needed. Show invoice total, outstanding/paid amount, and days to due or days overdue. Status is essential but not an aggregate.

### Invoice details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Invoice total | Original obligation. | `NOW` | Include |
| ★ Outstanding amount | Cash still due. | `NOW` | Include |
| ★ Days to due / overdue | Collection urgency. | `NOW` | Include |
| ★ Paid amount and payment status | Collection progress. | `NOW` | Include |
| Gross margin ₹ and % | Realized profitability; admin only. | `NOW` | Exclude |
| Buyer total overdue / credit headroom | Wider account risk. | `DETAIL` | Exclude |

Use a **Collection intelligence** tab rather than a trend for one invoice:

| Card | Format | What to show |
|---|---|---|
| Payment timeline | Timeline | Issue, due, reminders, payments/adjustments, current state. |
| Aging context | Aging strip | This invoice and buyer's total exposure by 0–30/31–60/61–90/90+ days. |
| Collection next action | Decision card | Owner, last contact, promised payment date, recommended next step. |
| Buyer payment behavior | Compact comparison | Recent invoices paid on time/late and median days late, calculated on open. |
| Line profitability | Ranked list | Value, tax, margin and exception lines; admin only. |
| Source document flow | Flow | Order, dispatch/delivery evidence, invoice and any missing dependency. |

## 4. Customers

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Purchasing buyers — count + % of active customer base | How broad is current revenue participation? | `PERIOD` | Include |
| ★ Win-back revenue pool — prior-period value from now-dormant buyers | How much recoverable demand is inactive? | `PERIOD` | Include |
| ★ Overdue receivables — amount + affected buyers | Which relationships need collection intervention? | `NOW` | Include |
| ★ Repeat buyer rate | Are customers returning, not merely ordering once? | `PERIOD` | Include |
| 90-day buyer GMV | Scale of the currently monetized base. | `PERIOD` | Exclude |
| Commercial coverage gap — buyers missing app, group, or price assignment | How much of the base cannot receive the intended growth strategy? | `NOW` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Win-back candidates | Dormant buyers ranked by prior 90-day value and cadence breach; call/message. | `PERIOD` | Include |
| ★ Collection risk | Overdue amount × age × open-order exposure; collect or hold. | `NOW` | Include |
| ★ Reorder due | Buyers past their normal reorder interval for repeat SKUs; create estimate/message. | `DETAIL` or bounded on demand | Include |
| Cross-sell whitespace | High-value buyers missing a commonly co-purchased brand/category; propose campaign. | `DETAIL` or periodic batch, optional | Exclude |

**Table-row intelligence:** 90-day order/invoice value, days since last order versus expected cadence, and overdue amount. Credit utilization may replace value for credit-led tenants. Drop per-buyer MoM growth from the default table.

### Customer details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ 90-day spend | Meaningful recent account value. | `DETAIL` | Include |
| ★ Days since last order vs usual cadence | Reorder/win-back urgency. | `DETAIL` | Include |
| ★ Overdue amount | Collection risk. | `NOW` | Include |
| ★ Credit used / headroom | Ability to accept more demand. | `NOW` | Include |
| 90-day orders and AOV | Purchase frequency and order quality. | `DETAIL` | Exclude |
| Gross margin contribution | Account profitability; admin only. | `DETAIL` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Spend and order cadence | Monthly line + order markers | Last 12 months, calculated only when this buyer opens; annotate cadence breach. | Include |
| Reorder playbook | Ranked SKU list | Repeat SKUs, typical quantity, last purchase, next expected date, one-click estimate. | Include |
| Category/brand mix and whitespace | 100% stacked bar + suggestions | Current mix and relevant missing categories/brands, not a decorative pie. | Include |
| Payment behavior | Aging + scorecard | Open/overdue, median days late, on-time share, promised payment. | Include |
| Margin and price realization | Distribution + exceptions | Realized margin/discount by major lines; admin only. | Include |
| Channel and engagement | Funnel/summary | Assisted vs Buyer App value, app recency, campaign-to-order actions; avoid raw open counts. | Include |

## 5. Products

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Invoiced sales — value + units | What product demand was actually realized? | `PERIOD` | Include |
| ★ Gross margin contribution — ₹ and % | Which assortment creates profit? Admin only. | `PERIOD` | Include |
| ★ Revenue at stockout risk — value + affected SKUs | How much proven demand may be lost? | `PERIOD` + `NOW` | Include |
| ★ Dead/slow stock value | How much working capital is trapped? | `PERIOD` + `NOW` | Include |
| Product productivity — % active SKUs sold in 90 days | Is the assortment earning its shelf space? | `PERIOD` | Exclude |
| Open demand coverage — available units ÷ open ordered units | Can current inventory serve committed demand? | `NOW` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Proven sellers at stockout risk | Recent velocity × shortage; replenish or transfer. | `PERIOD` + `NOW` | Include |
| ★ Dead/slow inventory | Inventory value × days without movement; discount, bundle, or stop buying. | `PERIOD` + `NOW` | Include |
| ★ Margin leakage | High-volume SKUs below margin floor or with falling realization; reprice. | `PERIOD` | Include |
| Demand without stock | Open/quoted quantity with no availability; substitute or source. | `NOW` | Exclude |

**Table-row intelligence:** total available/on-hand, trailing 90-day units or invoiced value, and open-demand shortage or margin %. Do not maintain a previous-period growth arrow for every SKU.

### Product details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Available/on-hand units | Current ability to sell. | `NOW` | Include |
| ★ 90-day units sold / invoiced value | Proven velocity and value. | `DETAIL` | Include |
| ★ Stock cover days | Replenishment urgency. | `DETAIL` | Include |
| ★ Open demand shortage | Committed/quoted demand at risk. | `NOW` | Exclude |
| Gross margin ₹ and % | Profit contribution; admin only. | `DETAIL` | Include |
| Purchasing-buyer count / penetration | Breadth of demand. | `DETAIL` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Sales and velocity trend | Monthly line/columns | Last 12 months, calculated when opened; units and invoiced value. | Include |
| Inventory by warehouse | Bars + transfer hints | Available, committed, short, and excess posture. | Include |
| Demand and stock cover | Forecast-free decision card | Recent velocity, open demand, cover, reorder/transfer threshold. | Include |
| Buyer penetration | Ranked list | Top buyers, repeat buyers, lapsed buyers, and relevant customer groups. | Include |
| Price and margin realization | Distribution + exception list | Realized price versus base/list and margin-floor breaches. | Include |
| Channel/campaign contribution | Split + list | Buyer App/assisted mix and campaigns that generated demand; source contribution only. | Include |

---

# Growth modules

## 6. Buyer App

Buyer App is already a tenant-level contribution dashboard, not an entity module. It should not gain a duplicate “Buyer App buyer details” page; buyer rows should deep-link to the existing Customer details page.

### Landing/dashboard header and action row

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ App-enabled coverage — enabled ÷ eligible buyers | How much of the customer base can self-serve? | `NOW` | Include |
| ★ Ordering-buyer adoption — app-ordering buyers ÷ enabled buyers | Is access turning into commercial use? | `PERIOD` + `EVENT` | Include |
| ★ App-sourced order value + share of total order value | How much business flows through self-service? | `PERIOD` | Include |
| ★ Repeat app buyer rate — 2+ app orders in a useful window | Is the habit becoming durable? | `PERIOD` | Include |
| App estimate-to-order conversion | Does app-created intent progress to an order? | `PERIOD` |  Exclude |
| App order quality — cancellation/fill rate versus assisted | Is channel growth operationally healthy? | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ High-value offline buyers not enabled | Offline 90-day value, contact/access state; enable and onboard. | `PERIOD` + `NOW` | Include |
| ★ Enabled but not activated | Enabled date, last app event, prior offline value; assist first login/order. | `EVENT` | Include |
| ★ Opened/started but did not order | Last funnel step and value/cart if available; nudge or support. | `EVENT` | Include |
| Lapsed app buyers | Prior app value, cadence breach, last app order; re-engage. | `PERIOD` | Exclude |

**Buyer opportunity table:** last app activity/funnel stage, app order value and count for the selected period, and app share of that buyer's order value. Do not show a buyer-level daily trend. Deep-link to Customer details.

There is no separate entity details specification. The 10+ card portfolio for this dashboard appears later in this document.

## 7. Campaigns

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Live campaign reach — unique reached ÷ eligible target buyers | Did the offer actually reach its intended market? | `EVENT` | Include |
| ★ Engaged buyer rate — unique viewers ÷ reached | Is the proposition interesting enough to inspect? | `EVENT` | Include |
| ★ Buyer conversion — unique ordering buyers ÷ unique viewers/reached | Is engagement becoming demand? Show both denominators in drill-down. | `EVENT` | Include |
| ★ Attributed order value | What sourced value did campaigns create? | `PERIOD` | Include |
| Estimate-to-order progression from campaigns | Is campaign intent progressing downstream? | `PERIOD` | Exclude |
| Expiring/no-response campaigns — count + audience/value opportunity | Which live campaigns need intervention? | `NOW` + `EVENT` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Live with weak reach | Large eligible audience but low delivered/viewed rate after SLA; resend/fix access. | `EVENT` | Include |
| ★ High engagement, low conversion | Many viewers but few orders; review price, stock, assortment, or CTA. | `EVENT` | Include |
| ★ Expiring with open opportunity | Time remaining × engaged non-buyers × value proxy; extend or nudge. | `NOW` + `EVENT` | Include |
| Coverage gap | Valuable buyers/groups absent from all live campaigns; create/expand campaign. | `NOW` | Exclude |

**Table-row intelligence:** target/reached buyer count, unique view rate, and ordering buyers + attributed order value. Product/brand counts and validity remain useful configuration fields. Previous-campaign growth should not be a default row metric because campaigns differ in audience and assortment.

### Campaign details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Unique reached / eligible audience | Distribution quality. | `EVENT` | Include |
| ★ Unique engaged / engagement rate | Proposition interest. | `EVENT` | Include |
| ★ Ordering buyers / conversion rate | Commercial response. | `EVENT` | Include |
| ★ Attributed order value | Sourced business value. | `PERIOD` | Include |
| Estimates and estimate-to-order rate | Downstream progression. | `PERIOD` | Exclude |
| Days left / engaged non-buyers | Remaining recovery opportunity. | `NOW` + `EVENT` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Reach-to-order funnel | Funnel | Eligible → notified/delivered → viewed → estimated → ordered, unique buyers at every stage. | Include |
| Engagement timing | Short cumulative line | First 7/14 days or campaign lifetime; event-derived, not a permanent daily entity fact. | Include |
| Conversion and value | Scorecard + cohort table | Orders, buyers, AOV, attributed value, estimate progression. | Include |
| Product response | Ranked list | Viewed/ordered products, units, value, stock/margin exceptions. | Include |
| Audience response | Group/location table | Reach and conversion by a few strategic dimensions; avoid per-buyer trend storage. | Include |
| Recovery queue | Ranked buyers | Engaged non-buyers, abandoned intent, or unreachable valuable buyers with direct action. | Include |

## 8. Customer Groups

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Buyer coverage — assigned unique buyers ÷ eligible buyers | Is segmentation operationally complete? | `NOW` | Include |
| ★ Unassigned valuable buyers — count + 90-day value | What valuable demand is outside strategy? | `NOW` + `PERIOD` | Include |
| ★ Purchasing-member rate | Are groups commercially active? | `PERIOD` | Include |
| ★ Group-attributed order value | How much business is addressed through groups? Deduplicate overlapping members. | `PERIOD` | Include |
| Pricing/campaign-ready coverage | Members in groups with an active pricelist and live/recent campaign. | `NOW` | Exclude |
| Stale dynamic groups | Groups whose rule result is old/failed or has changed materially. | `NOW` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ High-value buyers unassigned | 90-day value and location; assign or create a group. | `NOW` + `PERIOD` | Include |
| ★ Groups without an active commercial play | Member value but no active pricelist/campaign; price or activate. | `NOW` | Include |
| ★ Under-engaged valuable groups | Strong historical value but low recent purchasing-member rate; campaign/review. | `SMALL-HIST` | Exclude (complex for now) |
| Assignment conflicts | Buyers in overlapping groups with ambiguous price/campaign priority; resolve. | `NOW` | Include |

**Table-row intelligence:** unique active/total members, trailing 90-day order value or purchasing-member rate, and active pricelist/campaign coverage. Never sum group GMV across overlapping memberships without explicit deduplication.

### Customer group details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Unique members | Addressable audience. | `NOW` |
| ★ Purchasing-member rate | Commercial activation. | `PERIOD` |
| ★ 90-day order value | Group value. | `DETAIL` or `SMALL-HIST` |
| ★ Active price/campaign coverage | Whether strategy can reach the group. | `NOW` |
| AOV / order frequency | Buying pattern. | `DETAIL` |
| Overdue receivables or gross margin contribution | Risk or profit quality; admin choice. | `DETAIL` |

| Performance card | Format | What to show |
|---|---|---|
| Value and active-member trend | Monthly columns + line | Group order value and purchasing members; small dimension only. | Include |
| Member health distribution | Segmented bar | Active, reorder due, dormant, overdue, new. | Include |
| Product/brand affinity | Ranked bars | Distinctive categories/brands and repeat products. | Include |
| Price realization and margin | Distribution + exceptions | Discount/margin by assigned pricing path; admin only. | Include |
| Campaign and app adoption | Funnel/split | Reach, engagement, orders, app-enabled and app-ordering members. | Include |
| Member opportunity queue | Ranked table | High-value dormant, unpriced, not-on-app, or cross-sell candidates. | Include |

## 9. Pricelists

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Buyer pricing coverage — buyers resolved beyond base price | Is differentiated pricing actually deployed? | `NOW` |  Include |
| ★ High-value uncovered buyers — count + 90-day value | Where is base-price fallback undermining strategy? | `NOW` + `PERIOD` | Include |
| ★ Expiring in 7/30 days — lists + covered buyer value | What pricing needs renewal before disruption? | `NOW` | Include |
| ★ Margin-floor exposure — items + recent/open demand value | Where could pricing destroy profit? Admin only. | `NOW` + bounded demand | Include |
| Sellable-SKU coverage — priced SKUs ÷ eligible SKUs | How complete is the assortment pricing? | `NOW` | Exclude |
| Price conflict count — buyers/SKUs with competing eligible paths | Where will priority produce surprising prices? | `NOW` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Expiring commercial coverage | List, days left, assigned buyer value; renew/replace. | `NOW` | Exclude (unclear what this is) |
| ★ High-value buyers/groups on base fallback | Recent value and missing assignment; assign. | `NOW` + `PERIOD` | Include |
| ★ Below-floor or negative-margin items | Demand/value exposure and resolved price; reprice. | `NOW` + bounded demand | Include |
| Assignment/priority conflicts | Competing paths and affected buyers/SKUs; resolve priority. | `NOW` | Include |

**Table-row intelligence:** assigned unique buyers/groups, active SKU count or sellable-SKU coverage, and average discount/margin-floor exception count. Validity, priority, and strategy are configuration fields. A time trend is not worthwhile.

### Pricelist details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Unique buyers reached | Commercial reach after group deduplication. | `DETAIL` | Include |
| ★ Eligible SKU coverage | Completeness. | `NOW` | Include |
| ★ Median/weighted discount | Pricing posture; prefer weighted only when demand basis is explicit. | `DETAIL` | Include |
| ★ Margin-floor exceptions | Profit risk; admin only. | `NOW` | Include |
| 90-day order value resolved through this list | Actual adoption/value. | `DETAIL` | Exculde |
| Days to expiry | Renewal urgency. | `NOW` | Exclude |

Use a **Pricing effectiveness** tab; do not add a generic time trend:

| Card | Format | What to show | Decision |
|---|---|---|---|
| Assignment reach | Coverage tree | Direct buyers, groups, unique resolved buyers, exclusions. | Include |
| SKU coverage | Progress + gaps | Priced, base fallback, unavailable, excluded SKUs. | Include |
| Discount distribution | Histogram/bands | Item count and recent demand value by discount band. | Include |
| Margin impact | Ranked exceptions | Resolved price, cost, margin, affected demand; admin only. | Include |
| Adoption | Ranked list | Recent orders/value using this list and buyers still resolving elsewhere. | Include |
| Resolution conflicts | Diagnostic table | Higher-priority overrides, overlapping assignments, expired/inactive paths. | Include |

## 10. Brands

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Invoiced/order value by brand portfolio | Where is commercial value concentrated? | `PERIOD` | Include (but isn't this consolidated?) |
| ★ Gross margin contribution | Which brands create profit, not just volume? Admin only. | `PERIOD` | Include |
| ★ Buyer penetration | How broadly are brands distributed across the customer base? | `PERIOD` | Include |
| ★ Proven-demand stock risk — value + affected brands/SKUs | Which brand sales are at risk from availability? | `PERIOD` + `NOW` | Include |
| Inventory value / slow-stock value | Which brand ties up working capital? | `NOW` + `PERIOD` | Exclude |
| Portfolio concentration — top brand share | Is dependence on a few principals commercially risky? | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Winning brands at stock risk | Value/velocity × shortage; replenish or transfer. | `PERIOD` + `NOW` | Include |
| ★ Margin leakage | High-value brands/SKUs below floor or weakening realization; reprice/negotiate. | `SMALL-HIST` | Include |
| ★ Slow inventory by brand | Working capital and age; campaign, bundle, or stop purchase. | `PERIOD` + `NOW` | Include |
| Penetration whitespace | Strong brand with low reach in eligible buyers/groups/locations; target campaign. | `DETAIL` or `SMALL-HIST` | Exclude |

**Table-row intelligence:** trailing 90-day value, gross margin % or buyer penetration, and on-hand/low-stock exposure. Brand-level growth is affordable, but show it only when comparable periods have meaningful value and use it for sorting/strategy—not as an always-on decorative pill.

### Brand details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ 90-day sales value | Recent commercial scale. | `SMALL-HIST` | Include |
| ★ Gross margin contribution | Profit quality; admin only. | `SMALL-HIST` | Include |
| ★ Purchasing buyers / penetration | Distribution breadth. | `SMALL-HIST` | Include |
| ★ Stock-risk value / low-stock SKUs | Availability threat. | `NOW` + `SMALL-HIST` | Include |
| Inventory and slow-stock value | Working-capital posture. | `NOW` + `SMALL-HIST` | Exclude |
| Open demand coverage | Ability to serve pipeline/orders. | `NOW` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Sales and margin trend | Monthly line/columns | Value, units, margin; small-dimension history. | Include |
| SKU contribution | Pareto bars | Winning, declining, stock-risk, and slow SKUs. | Include (but a brand could have 100s of SKUs) |
| Buyer penetration | Segment/location matrix | Purchasing buyers, whitespace, repeat/lapsed. | Include |
| Inventory health | Posture bars | Available, short, low-cover, dead/slow value by warehouse. | Include |
| Price realization | Distribution + exceptions | Realized margin/discount and floor breaches. | Include |
| Campaign and app contribution | Campaign list + channel split | Sourced value, conversions, engaged non-buyers. | Include |

## 11. Locations

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Sales value by serviced location | Where is demand being realized? | `PERIOD` | Include (how can this be aggregated across all locations?) |
| ★ Gross margin contribution | Which locations grow profitably? Admin only. | `PERIOD` |  Include |
| ★ Open order book / at-risk value | Where is execution lagging? | `NOW` | Include |
| ★ Overdue receivables | Where is cash risk concentrated? | `NOW` | Include |
| Purchasing buyers / penetration | Is the location activating its market? | `PERIOD` | Exclude |
| Fulfillment fill rate / SLA | Is the location serving demand reliably? | `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ Locations with overdue exposure | Amount × age and affected buyers; collection action. | `NOW` | Include |
| ★ Low fulfillment / overdue orders | At-risk value and stock blockers; allocate/escalate. | `NOW` + `PERIOD` | Include |
| ★ Demand-stock mismatch | Open demand at location versus linked-warehouse availability; transfer/replenish. | `NOW` | Include |
| Buyer participation drop | Meaningful decline in purchasing buyers for a low-cardinality location; field activation. | `SMALL-HIST` | Exclude |

**Table-row intelligence:** selected-period sales and margin/fill rate, open/at-risk order value, and overdue receivables or active buyers. Location history is affordable, so one decision-relevant comparison can be retained.

### Location details

| Header KPI option | Decision supported | Class | Decision |
|---|---|---|---|
| ★ Sales value | Commercial scale. | `SMALL-HIST` | Include |
| ★ Gross margin | Profit quality; admin only. | `SMALL-HIST` | Include |
| ★ Open/at-risk order value | Execution exposure. | `NOW` | Include |
| ★ Overdue receivables | Cash exposure. | `NOW` | Include |
| Purchasing buyers | Market activation. | `SMALL-HIST` | Exclude |
| Fill rate / dispatch SLA | Service quality. | `PERIOD` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Sales and margin trend | Weekly/monthly line | Value and margin with meaningful comparison. | Include |
| Customer health | Distribution + ranked list | Active, reorder due, dormant, overdue and top opportunities. | Exclude (customers are not mapped to locations directly) |
| Brand/category mix | Stacked bars | Value, margin and concentration. | Include |
| Order execution | Funnel/SLA bars | Estimate → order → invoice plus confirmation/dispatch delays. | Include |
| Inventory availability | Linked-warehouse matrix | Demand coverage, stockouts, low cover, transfer options. | Include |
| Growth-channel contribution | Split/funnel | Buyer App and campaign reach/conversion/value. | Include |

## 12. Warehouses

### Landing page

| KPI option | What it answers | Class | Decision |
|---|---|---|---|
| ★ Inventory value / sellable value | How much working capital is held? | `NOW` | Include |
| ★ In-stock rate — sellable SKUs with stock | How much of the assortment can be served? | `NOW` | Include |
| ★ Proven-demand stockouts — SKUs + value at risk | Which shortages threaten real demand? | `PERIOD` + `NOW` | Include |
| ★ Dead/slow stock value | Where is working capital trapped? | `PERIOD` + `NOW` | Include |
| Open-demand coverage | How much committed demand can this stock serve? | `NOW` | Exclude |
| Imbalance opportunity — transferable shortage/excess pairs | Can redistribution solve shortages without buying more? | `NOW` | Exclude |

| Callout option | Ranked contents / action | Class | Decision |
|---|---|---|---|
| ★ High-demand stockouts | Velocity/open demand and short units; replenish/transfer. | `PERIOD` + `NOW` | Include |
| ★ Dead/slow inventory | Value, age/no-movement window; liquidate or stop buying. | `PERIOD` + `NOW` | Include |
| ★ Transfer opportunities | Shortage here and excess elsewhere; create transfer. | `NOW` | Include |
| Inventory integrity exceptions | Negative/committed-over-on-hand/stale-sync posture; investigate. | `NOW` | Exclude |

**Table-row intelligence:** inventory/sellable value, available units + tracked SKU count, and stockout/slow-stock/open-demand exposure. “Recently replenished” is activity, not a strategic aggregate.

### Warehouse details

| Header KPI option | Decision supported | Class | Include |
|---|---|---|---|
| ★ Inventory/sellable value | Working-capital scale. | `NOW` | Include |
| ★ Available units / in-stock rate | Service posture. | `NOW` | Include |
| ★ Proven-demand stockouts | Lost-sales risk. | `NOW` + `DETAIL` | Include |
| ★ Dead/slow stock value | Capital-release opportunity. | `NOW` + `DETAIL` | Include |
| Open-demand shortage | Fulfillment risk. | `NOW` | Exclude |
| Median/weighted stock cover | Replenishment posture; null with insufficient velocity. | `DETAIL` | Exclude |

Do not show historical stock trends until a trustworthy movement ledger exists.

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Inventory composition | Stacked bars | Available, committed, short, excess, non-sellable value/units. | Include |
| Stock-risk queue | Ranked SKU list | Demand/velocity, on hand, shortfall, cover, action. | Include |
| Slow/dead inventory | Ranked value table | Value, last movement/sale, cover, suggested commercial action. | Include |
| Demand coverage | Coverage bars | Open orders/estimates versus available stock by category/brand. | Include |
| Transfer opportunities | Origin/destination matrix | Excess elsewhere versus shortage here, units and value unlocked. | Include |
| Inventory activity | Recent-event list | Receipts, adjustments, transfers, sync freshness; not a fake trend. | Include |

## 13. Categories

### Landing page

| KPI option | What it answers | Class | Decisions |
|---|---|---|---|
| ★ Sales value by category | Where is demand concentrated? | `PERIOD` | Include |
| ★ Gross margin contribution | Which demand pools are profitable? Admin only. | `PERIOD` | Include (how can this be aggregated across all categories?) |
| ★ Buyer penetration | Which categories have distribution headroom? | `PERIOD` | Exclude (difficult to calculate) |
| ★ Proven-demand stock risk | Which category value is threatened by shortage? | `PERIOD` + `NOW` | Include |
| Assortment productivity — sold SKUs ÷ active SKUs | Is category breadth earning its place? | `PERIOD` | Include (easier) |
| Uncategorised active SKU/value exposure | Is bad master data hiding strategy and search? | `NOW` + `PERIOD` | Exclude |

| Callout option | Ranked contents / action | Class | Decisions |
|---|---|---|---|
| ★ Demand winners at stock risk | Category value/velocity with low cover; replenish/transfer. | `SMALL-HIST` + `NOW` | Include |
| ★ Margin leakage | High-value categories/SKUs below floor; reprice/negotiate. | `SMALL-HIST` | Include |
| ★ Slow inventory concentration | Inventory value with low movement; campaign/bundle/reduce buy. | `PERIOD` + `NOW` | Include |
| Penetration whitespace | Strong categories under-bought by eligible groups/locations; target. | `DETAIL` or `SMALL-HIST` | Exclude |

**Table-row intelligence:** trailing 90-day sales, gross margin % or buyer penetration, and active/OOS SKU count or stock-risk value. Category growth is affordable and useful when the base is material.

### Category details

| Header KPI option | Decision supported | Class | Decision
|---|---|---|---|
| ★ 90-day sales value | Recent scale. | `SMALL-HIST` | Include |
| ★ Gross margin contribution | Profit quality; admin only. | `SMALL-HIST` | Include |
| ★ Purchasing buyers / penetration | Distribution breadth. | `SMALL-HIST` | Include |
| ★ Stock-risk value / OOS SKUs | Availability threat. | `NOW` + `SMALL-HIST` | Include |
| Active/productive SKUs | Assortment efficiency. | `DETAIL` | Exclude |
| Inventory/slow-stock value | Working-capital posture. | `NOW` + `DETAIL` | Exclude |

| Performance card | Format | What to show | Decision |
|---|---|---|---|
| Sales and margin trend | Monthly line/columns | Value, units, margin; category grain is affordable. | Include |
| Brand contribution | Pareto bars | Value, margin, growth and concentration. | Include |
| Product winners and risks | Ranked table | Winners, OOS demand, margin leakage, slow stock. | Include |
| Buyer/location penetration | Matrix | Current reach and whitespace. | Include |
| Inventory health | Posture bars | Available, short, low-cover, slow/dead by warehouse. | Include |
| Campaign and app contribution | Split + list | Sourced value, reach, conversion, engaged non-buyers. | Include |

---

# Dashboard portfolios

## Seller App landing dashboard

The dashboard should be an executive decision surface, not a collage of module summaries. A strong default layout is four headline cards, three action queues, then 4–6 diagnostic cards. The following 15 options provide a portfolio; the first four and the three action queues are the recommended default.

| # | Card option | Format | Decision / action | Class | Decision |
|---:|---|---|---|---|---|
| 1 | ★ Orders booked and gross margin | KPI with value, order count, margin/admin | Are we winning profitable demand this period? Use period comparison only at tenant/location grain. | `PERIOD` | Include |
| 2 | ★ At-risk open order book | KPI with value, order count, oldest SLA | How much committed demand needs operational rescue? | `NOW` | Include |
| 3 | ★ Overdue receivables | KPI with amount, buyer count, 30+ day share | How much cash exposure needs collection? | `NOW` | Include |
| 4 | ★ Inventory action value | Two-sided KPI: sales at stockout risk / dead-stock value | Should cash go into replenishment or be released from slow stock? | `NOW` + `PERIOD` | Include |
| 5 | ★ Revenue recovery queue | Ranked callout | Expiring/high-value estimates and reorder-due valuable buyers; call, revise, or create estimate. | `NOW` + bounded `PERIOD` | Include |
| 6 | ★ Fulfillment rescue queue | Ranked callout | Stock-blocked and overdue orders by value/deadline; allocate, transfer, dispatch. | `NOW` | Include |
| 7 | ★ Collections queue | Ranked callout | Buyer exposure × age plus next promised date; collect or hold. | `NOW` | Include |
| 8 | Demand-to-cash funnel | Funnel with value and unique buyers | Estimates → orders → invoices → collected; reveal the stage where value stalls. Never compare unrelated denominators. | `PERIOD` | Include |
| 9 | Buyer health distribution | Segmented bar + value | Purchasing, reorder due, dormant, overdue, new; choose engagement/collections actions. | `PERIOD` + `NOW` | 
| 10 | Margin leakage | Waterfall or exception list | Discounts, below-floor items, low-margin high-volume orders; reprice or renegotiate. | `PERIOD` |
| 11 | Demand versus availability | Coverage bars | Open demand, available coverage, short value by category/brand; replenish/substitute. | `NOW` |
| 12 | Brand/category strategy map | Scatter: value or growth × margin, size=buyer reach | Invest, defend, fix margin, or exit. Use only low-cardinality monthly history. | `SMALL-HIST` |
| 13 | Location scorecard | Compact table/heatmap | Sales, margin, overdue, fill rate, buyer activation; identify branches needing intervention. | `SMALL-HIST` + `NOW` |
| 14 | Buyer App contribution | Split/funnel | Enabled → ordering → repeat, sourced order value/share, quality versus assisted. | `PERIOD` + `EVENT` |
| 15 | Strategy coverage gaps | Exception card | Valuable buyers without app/group/price and active SKUs uncategorised/unpriced; complete the commercial operating system. | `NOW` + bounded `PERIOD` |

**Do not default to:** raw order count, active campaign count, a generic recent-activity feed, or “top brands” without margin/availability context. These are navigational or descriptive, not executive decisions. If recent activity remains, filter it to material exceptions or state changes (large order cancelled, high-value estimate viewed, payment promise missed).

## Buyer App dashboard inside Seller App

The dashboard must answer whether self-service is reaching the right buyers, creating quality demand, and reducing assisted ordering. Recommended default: cards 1–4, callouts 5–7, then a subset of 8–15.

| # | Card option | Format | Decision / action | Class |
|---:|---|---|---|---|
| 1 | ★ App-enabled coverage | KPI: enabled/eligible buyers + valuable-base coverage | Is access deployed to the buyers that matter? | `NOW` + bounded `PERIOD` |
| 2 | ★ Ordering-buyer adoption | KPI: app-ordering/enabled buyers | Is enablement becoming commercial usage? | `PERIOD` + `EVENT` |
| 3 | ★ App-sourced order value/share | KPI: value, orders, share of total | How much demand is self-serve? Do not call it incremental. | `PERIOD` |
| 4 | ★ Repeat app buyer rate | KPI: 2+ app orders / app-ordering buyers | Is self-service becoming habitual? | `PERIOD` |
| 5 | ★ High-value enablement opportunities | Ranked callout | Offline value among not-enabled buyers; enable and onboard. | bounded `PERIOD` + `NOW` |
| 6 | ★ Activation rescue | Ranked callout | Enabled buyers who never opened or opened without ordering; assist/nudge. | `EVENT` |
| 7 | ★ Lapsed self-serve buyers | Ranked callout | Previously ordering app buyers past cadence; re-engage. | `PERIOD` |
| 8 | Adoption funnel | Funnel | Eligible → enabled → opened → started intent → ordered → repeat, unique buyers and stage conversion. | `EVENT` |
| 9 | Business through app | Document flow | App estimates → orders → invoices, value and unique buyers at each step. | `PERIOD` |
| 10 | First-value latency | Distribution | Median enable-to-first-open and enable-to-first-order; find onboarding friction. | `EVENT` |
| 11 | Assisted-to-self-serve migration | Buyer matrix/table | Buyers shifting share of orders to app, stuck offline, or reverting; target enablement/support. Calculate selected windows, not daily buyer facts. | bounded `PERIOD` |
| 12 | App versus assisted order quality | Comparison bars | AOV, cancellation, fill rate, time to confirm; confirm channel adoption is healthy. | `PERIOD` |
| 13 | Conversion friction | Funnel exception list | View/search/cart/estimate/order drop-off and failed checkout/support events; fix product/UX/data issues. | `EVENT` |
| 14 | Product/category demand through app | Ranked bars | App-sourced value, buyers, search/no-result or viewed-not-ordered opportunities. | `PERIOD` + `EVENT` |
| 15 | Adoption by location/group | Heatmap | Enablement, ordering, repeat, value share; focus onboarding teams. | `SMALL-HIST` |
| 16 | Campaign-to-app contribution | Funnel/list | Campaign reach → app view → estimate/order and engaged non-buyers. | `EVENT` |
| 17 | Self-service workload displaced | Scorecard | Number/share of buyer-entered orders/estimates and lines; an operational proxy, not claimed rupee savings. | `PERIOD` |
| 18 | Recent app-sourced exceptions | Curated feed | Large app order, app order cancelled/blocked, repeated failed checkout; action only, not raw activity. | `NOW` + `EVENT` |

**Do not default to:** Top App Buyers as a callout, average orders per enabled user, raw app opens, or a duplicate “app GMV” and “converted order value” when they represent the same flow. Top buyers belong in a drill-down; opens matter only as a funnel stage.

---

# Comparison with the current implementation

## Overall assessment

The current product has a strong and consistent visual grammar—four KPIs, three callout columns, table, and mostly four-card Performance tabs. The main issue is metric selection: many prime slots are occupied by raw entity counts, generic growth, “top” leaderboards, freshness/activity, or configuration coverage without commercial value. Operational exceptions and receivable/stock risk are generally stronger.

The codebase audit found:

- All 13 requested modules have landing surfaces. Buyer App correctly has no entity details page.
- Estimates, Sales Orders, and Invoices are document details without KPI strips or Performance tabs; keeping them document/action-oriented is sound, but the proposed compact header and intelligence cards would improve decisions.
- Pricelist details intentionally have no performance trend; that is correct. Add effectiveness diagnostics, not a time series.
- Only Brand details currently reaches six Performance cards; several of its metrics are placeholders or weakly defined, so card count alone is not quality.
- Current landings expose three callouts, not four. This proposal supplies four options so the product can select three defaults and retain one alternate; it does **not** recommend rendering four columns.
- Existing metric infrastructure is already broad: 11 snapshot and 11 daily KPI families. High-cardinality buyer facts are the most explosive, and several high-cardinality landing reads still aggregate entity-by-day rows outside the database. This validates narrowing the product requirement before any new modelling.

## Keep / change / dump by module

| Module | Keep from current UI | Change or add | Dump/demote |
|---|---|---|---|
| Dashboard | GMV, low-stock attention, collections, order-pulse concept, brand concentration | Replace counts with at-risk order value, inventory action value, margin, customer health, and prioritized cross-module queues | Active campaign count as hero; generic recent activity; raw order count without value/status |
| Estimates | Open estimates, follow-up, expiring soon, ready-to-convert | Show open/late/expiring **value**, availability/price risk, cohort conversion | Total estimate growth and AOV as heroes; generic period count |
| Sales Orders | Pending dispatch, awaiting confirmation, needs action | Open and at-risk value, stock-blocked value, due dispatch, fill rate | Biggest tickets and “in motion” as callouts; count/AOV as heroes |
| Invoices | Outstanding and overdue amount/count, due status, payment history | Due-soon and aging exposure, collection efficiency, buyer risk context | Top spenders/top risers on invoice page; invoice count/growth/AOV as heroes |
| Customers | Active rate, dormancy/recency, dues, last order, credit, brand mix, top SKUs, payment behavior | Revenue-weighted win-back, reorder cadence, repeat rate, overdue rather than all outstanding, opportunity coverage | Top spenders as callout; buyer-level MoM growth in every row; raw campaign/app opens |
| Products | OOS/low stock, revenue/units, on hand, cover, top buyers, price by group | Stockout revenue risk, dead-stock value, open-demand coverage, margin realization | Active/archived SKU count as hero; top performers/risers; per-SKU growth; historical on-hand trend |
| Buyer App | Enabled coverage, ordering/repeat users, app order value/share, adoption funnel, business flow, location usage | First-value latency, migration, quality comparison, activation/lapse queues | Top App Buyers callout; avg orders/enabled user; duplicate app value fields; raw opens |
| Campaigns | Reach/view/conversion funnel, attributed value, top SKUs, abandoners, expiry | Unique-buyer denominators, high-engagement/low-conversion diagnosis, audience recovery queue | Draft/live counts as strategy KPIs; top performers/risers; campaign growth without comparable audience/assortment |
| Customer Groups | Coverage, active members, group value, campaigns | Deduplicated member/value semantics, pricing/campaign readiness, unassigned valuable buyers, assignment conflicts | Total group count hero; unweighted average conversion; summed overlapping-group GMV; generic top risers |
| Pricelists | Expiry, uncovered groups, product count, discount/margin, assignment coverage | High-value buyer coverage, SKU completeness, floor exposure, resolution conflicts, actual adoption | Active/draft list count as hero; “most coverage” leaderboard; a time trend |
| Brands | Value/share, buyer reach, low-stock risk, top SKUs/buyers, campaign context | Margin, inventory value, penetration whitespace, demand-stock risk | Brands-carried/campaign-count hero; generic top performers; placeholder sell-through/repeat zeros; obscure freshness KPI |
| Locations | Sales/GMV, dues/overdue, open documents, active buyers, inventory health, top buyers | Margin, at-risk order value, fill/SLA, demand-stock mismatch, buyer participation | Invoice/estimate counts as heroes; top locations leaderboard without exception context |
| Warehouses | Stock attention, idle stock, sellable units, tracked/OOS/low counts | Inventory and dead-stock value, demand coverage, transfers, integrity exceptions | Active warehouse/tracked-row counts as heroes; recently replenished as callout; stock history without ledger |
| Categories | GMV/share, active buyers/SKUs, OOS/low, top brands, uncategorised data quality | Margin, buyer penetration, inventory productivity/value, strategy whitespace | Active category count hero; generic top performers/fast movers without margin/stock context |

## Direct review of the supplied screenshots

### Customers landing

- **Keep:** Active Buyers, Dormant, Outstanding/Overdue, Needs a Call, last order, credit posture, and group/pricelist coverage.
- **Change:** Spend MTD should be a stable 90-day customer-base value or repeat-rate view; Dormant should exclude never-ordered records and rank by recoverable prior value; Outstanding Dues should distinguish overdue.
- **Remove from premium space:** Top Spenders and Top Risers. Top spenders is descriptive, while per-buyer growth is noisy and expensive. Replace them with Collection Risk and Reorder/Win-back queues.
- **Table:** keep recent value, last order/cadence, overdue, and credit; drop the default Growth column.

### Seller dashboard

- **Keep:** GMV, low-stock action, Collections, and the concept of an orders pulse.
- **Change:** Orders This Month becomes Open/At-risk Order Book; Active Catalogs moves out of the top four; Brand Performance adds margin/stock/penetration context.
- **Remove from premium space:** generic Recent Activity. Replace it with material exceptions or the demand-to-cash funnel.

### Buyer App dashboard

- **Keep:** enabled coverage, app order value/share, ordering and repeat buyers, Adoption Funnel, Business Through App, and Usage by Location.
- **Change:** “Active this month” must mean ordering or a named funnel stage; Average Orders/User becomes Repeat App Buyer Rate; Top Buyers becomes Assisted-to-Self-serve Migration or Activation Opportunity.
- **Keep carefully:** app opens only inside a funnel, never as a standalone success KPI.

### Customer details

- **Keep:** spend/orders, last order, credit, spend trend calculated on open, brand mix, top SKUs, and payment behavior.
- **Change:** MTD to rolling 90-day context; add reorder cadence and overdue; replace Campaign Opens with channel contribution and a concrete conversion opportunity.
- **Avoid:** maintaining daily history for every buyer to power the detail chart. Calculate bounded monthly history when the buyer is opened or use a sparse activity history.

---

# Decisions to make before data modelling

1. Choose the four starred landing KPIs per module and confirm seller-admin versus seller-assistant substitutions.
2. Choose three default callouts per module; the fourth remains an alternate, not a fourth rendered column.
3. Confirm the commercial basis for sales cards: order value for demand/operations and invoice value for realized sales/inventory velocity.
4. Finalize invoice status and partial-payment semantics before accepting any receivable KPI.
5. Finalize cadence rules for reorder due/dormant, including sparse-history fallback.
6. Confirm margin visibility and cost reliability by role and tenant.
7. Confirm stock-value, slow-stock, fill-rate, promised-date, and allocation data quality; show “not available” rather than synthetic precision.
8. Confirm campaign attribution window and source rules. Keep “attributed” separate from “influenced” and never call either incremental.
9. Confirm customer-group overlap semantics before showing combined coverage or value.
10. Only after these product definitions are approved, map each metric to the lightest read/refresh strategy and delete aggregate requirements that no longer serve a chosen UI decision.
