# Yukti Metrics Product Strategy — Revised Proposal

Date: 2026-07-15

Status: Product proposal for metric selection; not yet the canonical implementation dictionary

Scope: Seller navbar modules under Operations and Growth, plus the Seller Dashboard and Buyer App contribution dashboard

Companion architecture: [metrics-data-architecture-proposal-2026-07.md](./metrics-data-architecture-proposal-2026-07.md)

Implementation plan: [metrics-v2-implementation-plan-2026-07.md](./metrics-v2-implementation-plan-2026-07.md)

Out of scope here: migrations and API implementation. Aggregate design and refresh ownership live in the companion architecture.

## Executive position

Yukti should feel like a command centre, not a business-intelligence suite. Every surface should progressively answer:

1. **Pulse — What is happening?** Two to four familiar facts.
2. **Actions — What needs attention?** Zero to three ranked work queues.
3. **Explore — Why is it happening?** Two to four optional cards after the owner deliberately opens the tab.

The metric lists below are option portfolios, not quotas. `★` marks the recommended default. A page may render fewer cards when fewer facts deserve permanent space. Empty slots are never filled with weak metrics.

This revision reassesses the earlier proposal from first principles. Previous review markings are intentionally not carried forward.

## How to read the recommendations

### Feasibility


| Code          | Meaning                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READY`       | Correct raw fields exist and the metric can use an existing aggregate or a simple bounded/indexable query; no source, grain, or provenance rewrite is required. |
| `REWORK`      | The raw source exists, but the current aggregate/API uses the wrong source, grain, or semantics and must change.                                                |
| `ON-OPEN`     | Practical as a bounded database aggregate when one detail page opens; do not maintain it daily for every entity.                                                |
| `CONDITIONAL` | Usable only when the named configuration, integration, or data-quality condition is satisfied.                                                                  |
| `LATER`       | Do not ship as truth with the current data. It needs missing history, provenance, ledger events, or attribution.                                                |


### Time basis


| Label                 | Behavior                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NOW`                 | Current posture. It ignores period filters and is labelled “Current” or “As of today.”                              |
| `THIS MONTH`          | A fixed calendar-month flow measure using canonical document dates.                                                 |
| `30D` / `90D` / `12M` | Bounded transaction period using canonical document dates and IST boundaries.                                       |
| `NOW + 90D`           | A current posture qualified by trailing-90-day demand; for example, current stockouts among recently sold products. |
| `LIFETIME`            | Fixed entity lifetime, used mainly for campaign details.                                                            |


Technically feasible does not automatically mean suitable. An option still needs to be understandable and support a decision.

`REWORK` is not a reason to reject a useful metric. It separates a correct product choice from a misleading claim that today's code already computes it correctly.

## Experience guardrails

- **Caps, not quotas:** Landing Pulse 2–4; Actions 0–3; detail Pulse 0–4; Explore 2–4.
- **Adaptive layout:** Render two, three, or four equal cards without empty placeholders. Hide an inapplicable section. When a valid queue has no exceptions, show one compact all-clear state.
- **Transactions are documents, not entities to analyse:** Estimate, order, and invoice details retain their existing document header, totals, status, line items, and activity. Do not repeat those facts in KPI cards or add a generic Performance tab.
- **One decision per card:** If a distributor cannot name a likely action, the metric does not deserve permanent space.
- **Plain business language:** Prefer “Invoiced sales,” “Customers who bought,” “Orders waiting to dispatch,” and “Stock with no sale in 90 days.” Avoid GMV, penetration, productivity, realization, cohort conversion, and whitespace in default UI.
- **No table-row trends:** Customer and product rows show current posture plus one bounded 90-day aggregate. Brand, category, and location comparisons belong in Explore, not as decorative pills in every row.
- **High-cardinality trends run on open:** Customer and product history is grouped by month or week only when that detail opens. Cache if needed; do not create buyer-by-day or product-by-day requirements merely for charts.
- **NOW is not period-filtered:** Do not use a global period control on pages dominated by current posture. If a page mixes NOW and period facts, label each card explicitly.
- **Advanced insights use progressive disclosure:** BAU owners can stop after Pulse and Actions. Growth-oriented owners can open Explore or “More insights.”
- **Unavailable is not zero:** Show an explicit warning when data is incomplete. Use zero only when it is a verified business result.

## Landing-page period contract

There is no generic landing-page period selector in V1. A control appears only when it owns a clearly defined result set. Every response returns `as_of`, the fixed commercial horizon when present, and the table period when present.


| Landing surface  | Control shown                                                         | Pulse and Actions                                                                       | Table/list scope                             |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| Seller Dashboard | None                                                                  | This-month invoiced sales/flow; trailing-90-day commercial context; NOW Actions/posture | Not applicable                               |
| Estimates        | **Table toolbar only:** This month, Today, This week, 90 days, Custom | Estimate value created is fixed This month; other Pulse and all Actions are NOW         | Selected table period only                   |
| Sales Orders     | **Table toolbar only:** same options                                  | Order value created is fixed This month; other Pulse and all Actions are NOW            | Selected table period only                   |
| Invoices         | **Table toolbar only:** same options                                  | Invoiced sales is fixed This month; receivables and Actions are NOW                     | Selected table period only                   |
| Customers        | None                                                                  | Trailing 90 days for commercial facts; NOW credit/receivables                           | All active customers, with cursor pagination |
| Products         | None                                                                  | Trailing 90 days for invoiced sales/velocity; NOW stock                                 | All active products, with cursor pagination  |
| Buyer App        | None                                                                  | Trailing 90 days for adoption/contribution; NOW access                                  | Not applicable                               |
| Campaigns        | None                                                                  | Trailing 90-day landing outcomes; NOW live/expiry                                       | All campaigns; detail is campaign lifetime   |
| Customer Groups  | None                                                                  | Current membership plus trailing-90-day facts for current members                       | All current Groups                           |
| Pricelists       | None                                                                  | NOW validity, coverage, and pricing posture                                             | All current Pricelists                       |
| Brands           | None                                                                  | Trailing 90-day invoiced sales; NOW stock                                               | All active Brands                            |
| Locations        | None                                                                  | Trailing 90-day invoiced sales; NOW demand/receivables/stock                            | All active Locations                         |
| Warehouses       | None                                                                  | NOW inventory plus explicitly labelled trailing-90-day demand qualification             | All Warehouses                               |
| Categories       | None                                                                  | Trailing 90-day invoiced sales; NOW stock/setup                                         | All Categories                               |


The transaction table control never changes current Pulse cards, Actions, or any callout. It also does not change the fixed This-month headline. Move it into the table toolbar so its ownership is visible.

Explore has no page-global control. A history card may offer 3M/12M/YTD locally by slicing one lazily fetched, bounded 12-month payload; the toggle must not trigger snapshot maintenance or alter Pulse/Actions.

## Shared truth and language

- **Invoiced sales:** eligible invoice value in the explicitly stated period. Use this for customer, product, brand, category, location, and tenant sales performance. Do not call estimate or order value GMV.
- **Estimate value / Order value:** the explicit commercial value at that document stage.
- **Purchasing customer:** a customer with at least one eligible invoice in the period. If an order-based variant is needed, label it “Customers who ordered.”
- **Open order value:** non-terminal, non-cancelled order value. Do not imply unfulfilled value until line-level fulfillment is trustworthy.
- **Outstanding / overdue:** positive eligible invoice balance; overdue only after its due date.
- **Due to reorder:** past an observed repeat-purchase interval with enough history. Use a simple fixed fallback only when clearly labelled.
- **Stock cover:** current available stock divided by recent invoiced-unit velocity. Return “Not enough sales history” rather than infinity.
- **Stock with no sale in 90 days:** current available-stock value/units for products with no eligible invoice line in the last 90 days. This is not inventory age or true dead stock.
- **Source contribution:** Buyer App demand/invoices may use their direct source fields. Campaign demand uses only directly linked Estimates/Orders; campaign-attributed invoiced sales remain conditional on durable document lineage. Never call either incremental revenue.

### Primary demand document

Yukti must resolve one primary demand document per tenant and use it consistently anywhere the UI says demand, submitted, repeat, or response:

1. If Sales Orders are enabled, **Orders are primary demand**.
2. Otherwise, if Estimates are enabled, **Estimates are primary demand**.
3. If both are enabled, Orders remain the headline demand signal and Estimates remain a separately labelled pipeline stage.
4. If neither is enabled, hide demand-dependent cards.

Resolve the choice through one shared server/database helper from the persisted module configuration; do not let individual routes infer it from activity. A separate override setting is unnecessary in V1. If a future tenant override is introduced, it needs effective dating and a metric rebuild contract. Do not add Estimate and Order counts or values: a converted estimate may otherwise represent the same commercial intent twice.

An “Open order value” option is the Order-primary rendering of “Open primary demand value,” never an additional card beside it.

Adaptive UI copy:


| Context                   | Estimate-primary copy  | Order-primary copy |
| ------------------------- | ---------------------- | ------------------ |
| Demand KPI                | Enquiries submitted    | Orders placed      |
| Repeat Buyer App customer | Submitted 2+ enquiries | Placed 2+ orders   |
| Campaign response         | Open-to-enquiry        | Open-to-order      |
| Dashboard current demand  | Open estimate value    | Open order value   |
| Dashboard action          | Estimate follow-up     | Order execution    |


## Current technical limits

The following are not trustworthy enough for recommended defaults:

- Historical gross margin or margin trend: invoice lines do not preserve cost at sale; current product cost rewrites the past.
- Historical inventory, inventory turns, stockout duration, shrinkage, or replenishment trend: there is no complete inventory-movement ledger.
- Exact fill rate or OTIF: order lines do not preserve complete fulfilled, backordered, and cancelled quantities.
- Historical Customer Group performance: membership has no effective-date history.
- Historical Pricelist adoption: transaction lines do not preserve the resolved pricelist.
- Full campaign/cart funnel or causal campaign lift: middle events and experimental attribution are incomplete.

The unsupported items above appear only as `LATER` alternatives so the product direction is recorded without presenting them as current truth.

### Current codebase fit

This audit distinguishes product feasibility from the code currently serving the pages:


| Surface family                          | Current fit                             | Required correction                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimates, Orders, Invoices             | Mostly `READY`                          | Existing document snapshots/daily facts support the selected Pulse. Actions must stop inheriting the document-created period.                                                       |
| Customers                               | `REWORK` for commercial facts           | `kpi_buyers_daily` separates document stages, but current landing/detail routes still lead with order value. Switch selected sales/activity metrics to invoices and primary demand. |
| Products, Brands, Categories, Locations | `REWORK`                                | Current daily facts and several July landing RPCs are order-derived. Selected sales, velocity, no-sale, and stock-risk metrics require invoice-line facts.                          |
| Buyer App                               | `REWORK`                                | Current snapshot defines ordered/repeat using Orders and repeat engagement events. Resolve primary demand and use two primary-demand documents for repeat.                          |
| Campaigns                               | `REWORK`                                | Current compact summary combines orders with unconverted estimates. Select exactly one primary demand stage.                                                                        |
| Customer Groups                         | `REWORK` for commercial facts           | Current membership is usable, but current value/activity is order-based and historical membership is unavailable.                                                                   |
| Pricelists                              | Mostly `READY` current-state only       | Coverage, scope, discounts, and current cost checks are feasible. Historical adoption/value remains unavailable.                                                                    |
| Warehouses                              | `CONDITIONAL` for demand-backed metrics | Current stock is reliable; sales-to-warehouse attribution requires one warehouse per location or explicit allocation.                                                               |
| Detail Explore                          | `ON-OPEN`                               | Replace broad JavaScript hydration with one bounded, entity-scoped SQL/RPC query on page open.                                                                                      |


---

# Operations modules

## 1. Estimates

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Subtitle:** `{estimate_count} estimates in {table_period}.`

**Period:** Only the document table has a selector and it defaults to This month. “Estimate value created” is always This month; other Pulse cards and all Actions are NOW and never inherit the table filter.

### Pulse options


| Option                                                                    | Owner value | Time / feasibility         | Why it earns space                                                       |
| ------------------------------------------------------------------------- | ----------- | -------------------------- | ------------------------------------------------------------------------ |
| ★ Estimate value created - value + count (supporting)                     | Both        | `THIS MONTH · READY`       | Total quoted demand; the document count already appears in the subtitle. |
| ★ Open estimates — value + count (supporting)                             | Both        | `NOW · READY`              | Total quoted demand still awaiting an outcome.                           |
| ★ Sent estimates awaiting action for 3+ days — value + count (supporting) | BAU         | `NOW · READY`              | A factual follow-up threshold the team can understand and act on.        |
| ★ Expiring in 7 days — value + count (supporting)                         | BAU         | `NOW · READY`              | Makes urgency visible before an offer lapses.                            |
| Estimates converted to orders — count + value                             | Growth      | `THIS MONTH · CONDITIONAL` | Show only when Sales Orders are enabled.                                 |
| Estimate-to-order rate                                                    | Growth      | `THIS MONTH · CONDITIONAL` | Show only for an enabled, linked Estimate-to-Order workflow.             |
| Buyer App estimate value                                                  | Growth      | `THIS MONTH · READY`       | Shows self-service demand without mixing it with orders.                 |


### Action options


| Option                                                                                                                             | Time / feasibility  | Ranked by / action                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| ★ Sent estimates awaiting action for 3+ days - Buyer Name (primary), Amount (trailing), Estimate Number and Sent Date (supporting) | `NOW · READY`       | Oldest and highest value first; call or message.                                    |
| ★ Expiring unresolved - Buyer Name (primary), Amount (trailing), Estimate Number and Expiry Date (supporting)                      | `NOW · READY`       | Soonest expiry, then value; revise, extend, or close.                               |
| Ready to convert                                                                                                                   | `NOW · CONDITIONAL` | Accepted estimates without a linked order; show only when Sales Orders are enabled. |
| ★ Drafts not sent - Buyer Name (primary), Amount (trailing), Estimate Number and Estimate Date (supporting)                        | `NOW · READY`       | Old drafts by value; finish or discard.                                             |
| Quoted items currently short on stock                                                                                              | `NOW · CONDITIONAL` | Current inventory check; substitute or confirm supply.                              |


**Table rows:** estimate number, source, customer, seller location, campaign, status, item count, estimate value, expiry date. No growth or trend aggregate.

### Detail behavior

Do not add KPI cards or a Performance tab. Estimate value, dates, expiry, status, items, totals, and conversion state already belong in the document UI.

Optional contextual aids, maximum two:


| Option                                                             | Feasibility   | Non-duplicative value                                                                                  |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------ |
| ★ Preferred: Customer account context (see metrics in last column) | `ON-OPEN`     | Last primary demand, overdue balance, and available credit beside the decision to approve or convert.  |
| ★ Preferred: Current stock exceptions (see metrics in last column) | `CONDITIONAL` | Directional line-versus-current-stock check only; show alternative warehouse availability where known. |
| Price below configured floor                                       | `CONDITIONAL` | Use only when a reliable current cost/floor policy exists; label as a current estimate.                |
| Engagement timeline                                                | `READY`       | Sent, viewed, accepted, and converted timestamps only when not already present in Activity.            |


## 2. Sales Orders

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Subtitle:** `{order_count} sales orders in {table_period}.`

**Period:** Only the document table has a selector and it defaults to This month. “Order value created” is always This month; other Pulse cards and all Actions are NOW and never inherit the table filter.

### Pulse options


| Option                                                  | Owner value | Time / feasibility   | Why it earns space                                                              |
| ------------------------------------------------------- | ----------- | -------------------- | ------------------------------------------------------------------------------- |
| ★ Order value created - value + count (supporting)      | Both        | `THIS MONTH · READY` | Shows received demand; the document count already appears in the subtitle.      |
| ★ Open orders — value + count (supporting)              | Both        | `NOW · READY`        | Shows committed demand still moving through operations.                         |
| ★ Waiting for confirmation — value + count (supporting) | BAU         | `NOW · READY`        | Identifies the next approval workload.                                          |
| ★ Waiting to dispatch — value + count (supporting)      | BAU         | `NOW · READY`        | Identifies orders ready for operational follow-through.                         |
| Orders waiting beyond the status SLA                    | BAU         | `NOW · CONDITIONAL`  | Use only after the tenant accepts explicit thresholds for each status.          |
| Cancelled orders — count + value                        | Growth      | `THIS MONTH · READY` | Useful when cancellations are material and reasons are captured.                |
| Exact fill rate / OTIF                                  | Growth      | `LATER`              | Requires reliable fulfilled/backordered quantities and promised-date semantics. |


### Action options


| Option                                                                                                                      | Time / feasibility  | Ranked by / action                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| ★ Orders to confirm - Buyer Name (primary), Amount (trailing), Order Number and Created Date (supporting)                   | `NOW · READY`       | Highest value and oldest received orders; confirm or reject.                   |
| ★ Orders to dispatch - Buyer Name (primary), Amount (trailing), Order Number and Accepted Date (supporting)                 | `NOW · READY`       | Oldest confirmed orders; dispatch or assign.                                   |
| ★ Orders with current stock shortage - Buyer Name (primary), Amount (trailing), Order Number and Accepted Date (supporting) | `NOW · CONDITIONAL` | Current order lines versus inventory; substitute, source, or contact customer. |
| Orders waiting beyond SLA                                                                                                   | `NOW · CONDITIONAL` | Time in current status versus an agreed threshold; escalate.                   |
| Orders from customers over credit policy                                                                                    | `NOW · CONDITIONAL` | Outstanding plus order exposure versus configured credit; collect or approve.  |


**Table rows:** order number, source, customer, seller_location, campaign, status, item count, order value, created/order date. Do not claim remaining or fulfilled value.

### Detail behavior

Do not add KPI cards or a Performance tab. Order value, dates, status, line items, totals, invoice link, and delivery activity already exist in the document workflow.

Optional contextual aids, maximum two:


| Option                                                                        | Feasibility   | Non-duplicative value                                                                   |
| ----------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| ★ Preferred: Current stock exceptions - see metrics in last column            | `CONDITIONAL` | Directional order-line-versus-current-stock check, including stock available elsewhere. |
| ★ Preferred: Customer credit and overdue context - see metrics in last column | `ON-OPEN`     | Wider account exposure before confirmation or dispatch.                                 |
| Time in current status                                                        | `READY`       | Show only if the existing status timeline does not already make it obvious.             |
| Historical order quality                                                      | `LATER`       | Exact fill rate and OTIF require missing line-level fulfillment facts.                  |


## 3. Invoices

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Subtitle:** `{invoice_count} invoices in {table_period}.`

**Period:** Only the document table has a selector and it defaults to This month. Invoiced sales is always This month; receivable cards and all Actions are NOW and never inherit the table filter.

### Pulse options


| Option                                                                        | Owner value | Time / feasibility         | Why it earns space                                                    |
| ----------------------------------------------------------------------------- | ----------- | -------------------------- | --------------------------------------------------------------------- |
| ★ Invoiced sales - value + count (supporting)                                 | Both        | `THIS MONTH · READY`       | The clearest realized-sales measure in Yukti.                         |
| ★ Outstanding amount — amount + invoice count and customer count (supporting) | BAU         | `NOW · READY`              | Total cash still to collect.                                          |
| ★ Overdue amount — amount + invoice and customer counts (supporting)          | Both        | `NOW · READY`              | Cash exposure already past due.                                       |
| ★ Due in 7 days — amount + customer and invoice counts (supporting)           | BAU         | `NOW · READY`              | Lets the owner plan collections before invoices become overdue.       |
| Overdue 30+ days                                                              | BAU         | `NOW · READY`              | Useful alternative for credit-heavy businesses.                       |
| Customers with overdue invoices                                               | BAU         | `NOW · READY`              | A workload view when customer count matters more than rupee total.    |
| Cash collected in period                                                      | Growth      | `THIS MONTH · CONDITIONAL` | Use only when payment sync and partial-payment handling are complete. |


### Action options


| Option                                                                                                                  | Time / feasibility  | Ranked by / action                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| ★ Largest overdue customer balances - Buyer Name (primary), Amount (trailing), Invoice Number and Due Date (supporting) | `NOW · READY`       | Amount × age; call, message, or place on hold.                              |
| ★ Newly overdue invoices - Buyer Name (primary), Amount (trailing), Invoice Number and Due Date (supporting)            | `NOW · READY`       | Due date crossed recently; intervene early.                                 |
| ★ High-value invoices due soon - Buyer Name (primary), Amount (trailing), Invoice Number and Due Date (supporting)      | `NOW · READY`       | Due date then amount; schedule reminder.                                    |
| Customers over credit policy                                                                                            | `NOW · CONDITIONAL` | Outstanding plus open-order exposure versus configured credit.              |
| Payment sync exceptions                                                                                                 | `NOW · CONDITIONAL` | Mismatched or stale payments only when integration status is authoritative. |


**Table rows:** invoice number, source, customer, place_of_supply, seller_location, campaign, invoice date, due date, status, total, outstanding. No historical aggregate is needed.

### Detail behavior

Do not add KPI cards or a Performance tab. Invoice total, paid/outstanding amount, due state, line items, taxes, and payment history already belong in the invoice view.

One optional contextual panel:


| Option                                                                 | Feasibility | Non-duplicative value                                                                               |
| ---------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| ★ Preferred: Customer collections context - see metrics in last column | `ON-OPEN`   | Total overdue across the customer, recent on-time/late behavior, and other invoices needing action. |
| Source order flow                                                      | `READY`     | Show only when the linked order/invoice relationship is not already visible.                        |
| Historical invoice margin                                              | `LATER`     | Current invoice lines do not preserve cost at sale.                                                 |


## 4. Customers

**Recommended shape:** Landing Pulse **4** · Actions **2** · Detail Pulse **4** · Explore **4**

**Subtitle:** `{active_customer_count} active customers of {total_customer_count} customers in the last 90 days.`

**Period:** Fixed trailing 90 days for commercial facts; credit and receivables are NOW. No landing-page period control.

### Landing Pulse options


| Option                                                                                                                  | Owner value | Time / feasibility  | Why it earns space                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- | --------------------------------------------------------------------------- |
| ★ Invoiced sales · 90d - value + unique customer count (supporting)                                                     | Both        | `90D · REWORK`      | Correct source is invoices; the current customer landing ranks order value. |
| ★ Customers who purchased — count + % of active customers (supporting)                                                  | Both        | `90D · REWORK`      | Use eligible invoices; the current landing activity path is order-led.      |
| ★ Overdue amount — amount + affected customers (supporting)                                                             | BAU         | `NOW · READY`       | Direct collections exposure.                                                |
| Customers due to order again                                                                                            | Growth      | `NOW · CONDITIONAL` | Identifies near-term repeat demand; requires an agreed cadence rule.        |
| ★ Customers inactive for 90 days with sales in the prior year - customer count + invoice-value 91-365 days (supporting) | Growth      | `NOW · REWORK`      | Use invoice value from days 91–365; current dormancy/value logic differs.   |
| Repeat customers — count + rate                                                                                         | Growth      | `90D · REWORK`      | Feasible from invoices, but the current activity path is order-led.         |
| Buyer App enabled customers                                                                                             | Growth      | `NOW · READY`       | Useful alternative for tenants prioritising digital adoption.               |
| Total active customers                                                                                                  | BAU         | `NOW · READY`       | Contextual denominator; usually belongs in the page subtitle.               |


### Action options


| Option                                                                                                                                          | Time / feasibility   | Ranked by / action                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| ★ Collect overdue balances - Buyer Name (primary), overdue amount (trailing), overdue invoices count and age overdue (supporting)               | `NOW · READY`        | Amount × age; contact or hold.                                                                             |
| Customers due to order again - Buyer Name (primary), Prior value (trailing), overdue invoices count and days overdue (supporting)               | `NOW · CONDITIONAL`  | Prior value and cadence lateness; message or create estimate.                                              |
| ★ Win back valuable inactive customers - Buyer Name (primary), Amount (trailing), phone number and last activity X days ago (supporting)        | `NOW · REWORK`       | Invoiced sales from days 91–365, then days inactive; message or call.                                      |
| ★ High-value customers not enabled on Buyer App - Buyer Name (primary), Amount (trailing), overdue invoices count and days overdue (supporting) | `90D + NOW · REWORK` | Rank value from invoices rather than the current order-led path; primarily belongs on Buyer App dashboard. |
| Customers with no Pricelist/Group                                                                                                               | `NOW · READY`        | Complete setup only when tenant policy expects custom assignment.                                          |


**Table rows:** customer, phone, trailing-90-day invoiced sales, last primary-demand/invoice date, overdue amount, current credit usage, group/pricelist badges, and health status. Remove buyer-level growth/trend.

### Detail Pulse options

**Details Page Subtitle:** `{buyer_app_enabled_status} · {geography.city} · {phone number} · Last {activity} {days ago / last_activity_date}.`


| Option                                                                | Owner value | Time / feasibility | Why it earns space                                                                                    |
| --------------------------------------------------------------------- | ----------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| ★ Invoiced sales 90d - amount + count of invoices (supporting)        | Both        | `90D · ON-OPEN`    | Recent customer value.                                                                                |
| ★ Primary demand 90d — amount + count (supporting)                    | Both        | `90D · ON-OPEN`    | Use Estimates or Orders according to the tenant's primary demand document; never average both stages. |
| ★ Overdue amount - value + invoice count and overdue age (supporting) | BAU         | `NOW · READY`      | Immediate collections risk.                                                                           |
| ★ Credit used / available - used + total and % used (supporting)      | BAU         | `NOW · READY`      | Whether more demand can be accepted.                                                                  |
| Last order and days since                                             | Both        | `NOW · READY`      | Prefer in title metadata if already present; otherwise use as an alternative card.                    |
| App-sourced demand share                                              | Growth      | `90D · ON-OPEN`    | Digital adoption using the tenant's primary demand document.                                          |
| Products/categories purchased                                         | Growth      | `90D · ON-OPEN`    | Breadth of relationship; usually better in Explore.                                                   |
| Historical gross margin                                               | Growth      | `LATER`            | Requires cost-at-sale provenance.                                                                     |


### Explore options

Render up to four recommended cards. Show Payment behavior only when due dates and final payment timestamps pass validation; otherwise use Current pricing setup as the non-overlapping fallback. Place remaining alternatives behind “More insights.”


| Option                                                                                                                           | Owner value | Time / feasibility      | Format and action                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ★ Sales and demand history - trend with invoice amount, demand markers; show total amount and count in 12mon                     | Both        | `12M · ON-OPEN`         | Monthly invoiced sales with primary-demand markers; identify changes and seasonality.                              |
| ★ Products requested repeatedly - product and average quantity per demand document                                               | Growth      | `90D/12M · ON-OPEN`     | Ranked products from the primary demand document, with usual quantity and last purchase; create estimate or order. |
| ★ What this customer buys                                                                                                        | Growth      | `90D · ON-OPEN`         | Brand/category mix in plain language; find relationship concentration.                                             |
| Payment behavior                                                                                                                 | BAU         | `12M · CONDITIONAL`     | Requires reliable due dates and final payment timestamps; paid does not automatically mean on time.                |
| ★ Buyer App versus assisted demand - last app use, demand source contribution distribution with primary demand source called out | Growth      | `90D · ON-OPEN`         | Primary-demand source contribution and last app use.                                                               |
| Current pricing setup                                                                                                            | BAU         | `NOW · READY`           | Assigned Pricelists, Groups, and fallback path.                                                                    |
| Products not bought recently                                                                                                     | Growth      | `ON-OPEN · CONDITIONAL` | Only repeated products past their normal interval; avoid speculative cross-sell.                                   |
| Margin and price realization                                                                                                     | Growth      | `LATER`                 | Historical margin is not reliable without cost-at-sale.                                                            |


## 5. Products

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **3** · Explore **4**

**Subtitle:** `{active_product_count} active products across {brand_count} brands and {category_count} categories.`

**Period:** Fixed trailing 90 days for sales/velocity; stock posture is NOW. No landing-page period control.

### Landing Pulse options


| Option                                                                                             | Owner value | Time / feasibility   | Why it earns space                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------- | -------------------- | ---------------------------------------------------------------------------------- |
| ★ Invoiced sales — value + total units sold (supporting)                                           | Both        | `90D · REWORK`       | Current product daily facts are order-based and must switch to invoice lines.      |
| ★ Recently sold products now out of stock - product count + meaningful static text to give context | BAU         | `NOW + 90D · REWORK` | Join current stock to invoice demand; current aggregate semantics are mixed.       |
| ★ Products running low - product count + meaningful static text to give context                    | BAU         | `NOW + 90D · REWORK` | Use current available stock and invoice velocity with an explicit cover threshold. |
| ★ Products that sold - product count + meaningful static text to give context                      | Growth      | `90D · REWORK`       | Count SKUs with eligible invoice lines, not order lines.                           |
| Stock with no sale in 90 days                                                                      | Both        | `NOW + 90D · REWORK` | Join current stock to a 90-day absence of eligible invoice lines.                  |
| Total available units                                                                              | BAU         | `NOW · READY`        | Useful for inventory-heavy tenants but weak as a portfolio-wide decision metric.   |
| Open ordered quantity versus stock                                                                 | BAU         | `NOW · CONDITIONAL`  | Directionally useful only if open-order semantics are agreed; not fill rate.       |
| Gross margin                                                                                       | Growth      | `LATER`              | Historical cost-at-sale is missing.                                                |


### Action options


| Option                                                                                                                          | Time / feasibility   | Ranked by / action                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| ★ Recently sold products now out of stock - Product Avatar and Name, current stock (trailing), SKU . velocity (supporting text) | `NOW + 90D · REWORK` | Recent invoice units/value then current shortage; replenish or source. |
| ★ Products running low - Product Avatar and Name, current stock (trailing), SKU . velocity (supporting text)                    | `NOW + 90D · REWORK` | Lowest invoice-velocity cover among proven sellers; replenish.         |
| ★ Stock with no sale in 90 days - Product Avatar and Name, current stock (trailing), SKU . velocity (supporting text)           | `NOW + 90D · REWORK` | Count/units are safe; show value only when current cost is complete.   |
| Ordered products currently short                                                                                                | `NOW · CONDITIONAL`  | Open ordered quantity versus current inventory; substitute or source.  |
| Current selling price below configured floor                                                                                    | `NOW · CONDITIONAL`  | Requires a trusted current cost/floor policy; reprice.                 |


**Table rows:** Product Image/Avatar, Name, Brand, Category, current available stock, trailing-90-day invoiced units and sales, days cover or “Not enough history,” and stock status. Remove previous-period growth, trend.

### Detail Pulse options


| Option                                                                    | Owner value | Time / feasibility    | Why it earns space                                     |
| ------------------------------------------------------------------------- | ----------- | --------------------- | ------------------------------------------------------ |
| ★ Available stock - availabel units + across X locations (secondary text) | BAU         | `NOW · READY`         | Current ability to sell.                               |
| ★ Units sold + invoiced sales (secondary text)                            | Both        | `90D · ON-OPEN`       | Proven demand in one card.                             |
| ★ Days of stock remaining + velocity (secondary text)                     | BAU         | `NOW + 90D · ON-OPEN` | Plain-language replenishment signal.                   |
| Customers who purchased - customer count + invoice count                  | Growth      | `90D · ON-OPEN`       | Breadth of recent demand.                              |
| ★ Demand last 90d - units count + estimates/orders count (secondary text) | Growth      | `90D · ON-OPEN`       | Depth of recent demand.                                |
| Last invoice date                                                         | BAU         | `NOW · ON-OPEN`       | Useful for sparse products; otherwise supporting text. |
| Average invoiced selling price                                            | Growth      | `90D · ON-OPEN`       | Actual price achieved, without claiming margin.        |
| Open ordered quantity                                                     | BAU         | `NOW · CONDITIONAL`   | Use only with clear non-terminal order semantics.      |
| Gross margin                                                              | Growth      | `LATER`               | Requires cost-at-sale.                                 |


### Explore options


| Option                                                           | Owner value | Time / feasibility | Format and action                                                             |
| ---------------------------------------------------------------- | ----------- | ------------------ | ----------------------------------------------------------------------------- |
| ★ Sales and units over time - see metrics in the last column     | Both        | `12M · ON-OPEN`    | Monthly line/columns from invoice lines; spot seasonality or decline.         |
| ★ Current stock by warehouse - see metrics in the last column    | BAU         | `NOW · READY`      | Bars for available stock by warehouse; transfer or replenish.                 |
| ★ Customers buying this product - see metrics in teh last column | Growth      | `90D · ON-OPEN`    | Ranked buyers with last purchase and units.                                   |
| Actual selling prices                                            | Growth      | `90D · ON-OPEN`    | Price/discount distribution from invoice lines; investigate outliers.         |
| ★ Buyer App and campaign source - see metrics in the last column | Growth      | `90D · ON-OPEN`    | Directly linked source contribution only - show value and units sold/demand   |
| Sales by location                                                | Growth      | `90D · ON-OPEN`    | Location mix when document location is populated.                             |
| Products often bought alongside                                  | Growth      | `LATER`            | Requires a deliberately validated basket-analysis definition and cost review. |
| Inventory history / turns                                        | Growth      | `LATER`            | Requires a complete movement ledger.                                          |


---

# Growth modules

## 6. Buyer App

Buyer App is a channel dashboard, not an entity module. Buyer-level rows deep-link to Customer details rather than creating duplicate buyer analytics.

**Recommended shape:** Pulse **4** · Actions **3** · Explore **4** · No separate detail page

**Subtitle:** `{access_customer_count} customers can self-serve · track business submitted through Buyer App.`

**Period:** Fixed trailing 90 days for adoption and value; app access is NOW. No landing-page period control.

### Pulse options


| Option                                                                              | Owner value | Time / feasibility  | Why it earns space                                                                               |
| ----------------------------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| ★ Customers with Buyer App access - count + % of total buyers (supporting)          | BAU         | `NOW · READY`       | Shows how much of the customer base can self-serve. Define one authoritative access flag.        |
| ★ Customers submitting app demand - count + % of enabled buyers (supporting)        | Both        | `90D · REWORK`      | Dynamically label as enquiries or orders from the primary demand document; do not use app opens. |
| ★ App-sourced invoiced sales - value + share % of total invoiced sales (supporting) | Growth      | `90D · REWORK`      | Direct invoice contribution is present, but the current share denominator is order-based.        |
| ★ Repeat app customers - count + % of enabled customers (supporting)                | Growth      | `90D · REWORK`      | Customers with at least two primary-demand documents, not two app events.                        |
| App-sourced demand value + share                                                    | BAU         | `90D · REWORK`      | Primary-demand contribution kept separate from invoiced sales.                                   |
| Customers who used the app                                                          | Growth      | `90D · READY`       | Useful as an adoption-stage diagnostic, not the primary success metric.                          |
| Demand cancellation rate                                                            | Growth      | `90D · CONDITIONAL` | Order-primary only and only when cancellation status is consistently synced.                     |
| Average demand documents per enabled customer                                       | Growth      | `90D · REWORK`      | Feasible but usually less actionable than submitting and repeat-customer rates.                  |


### Action options


| Option                                                                                                                          | Time / feasibility   | Ranked by / action                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| ★ Valuable assisted customers without app access - Buyer Name, App Status (trailing), Invoiced sales, Demand value (supporting) | `NOW + 90D · REWORK` | Recent invoiced sales; current implementation ranks this from order-led activity. Enable and onboard. |
| ★ Access enabled but never used - Buyer Name, App Status (trailing), Invoiced sales, Demand value (supporting)                  | `NOW + 90D · READY`  | Prior value; assist first login. Enablement age is unavailable today.                                 |
| ★ Used the app but submitted no demand - Buyer Name, App Status (trailing), Invoiced sales, Demand value (supporting)           | `NOW + 90D · REWORK` | Last activity and prior value; contact for help.                                                      |
| Previously submitted app demand, now inactive                                                                                   | `NOW + 90D · REWORK` | Previous app value and days since the primary demand document; re-engage.                             |
| App demand needing operational action                                                                                           | `NOW · REWORK`       | Follow up on estimates or execute orders according to the primary demand document.                    |


### Explore options


| Option                                                        | Owner value | Time / feasibility  | Format and action                                                                          |
| ------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------ |
| ★ Adoption funnel - see metrics in the last column            | Both        | `90D · REWORK`      | Access → used → submitted primary demand → repeat, using unique customers.                 |
| ★ Business through the app - see metrics in the last column   | Both        | `90D · REWORK`      | Primary-demand value and invoiced sales as separate stages; omit disabled document stages. |
| ★ App contribution over time - see metrics in the last column | Growth      | `12M · REWORK`      | Monthly app-sourced primary-demand and invoice share at tenant grain.                      |
| ★ Adoption by location - see metrics in the last column       | Growth      | `90D · REWORK`      | Primary-demand customers and app contribution by document location.                        |
| Adoption by Customer Group                                    | Growth      | `90D · CONDITIONAL` | Uses current group membership; label it accordingly.                                       |
| Assisted versus app order quality                             | Growth      | `90D · CONDITIONAL` | Compare AOV/cancellation only; exact fill-rate comparison is unavailable.                  |
| Customers moving from assisted to app                         | Growth      | `90D · ON-OPEN`     | Ranked transition list; do not maintain buyer-by-day histories.                            |
| Cart and checkout drop-off                                    | Growth      | `LATER`             | Middle funnel events are incomplete.                                                       |


## 7. Campaigns

Use “opened” and “campaign-linked demand” rather than “reached,” “converted,” or “influenced.” Adapt demand to Estimates or Orders using the tenant's primary demand document.

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **3** · Explore **4**

**Subtitle:** `{campaign_count} campaigns · {live_count} live · {scheduled_count} scheduled.`

**Period:** Fixed trailing 90 days for landing outcomes; live/expiry facts are NOW. No landing-page period control. Detail is campaign lifetime.

### Landing Pulse options


| Option                                                                                           | Owner value | Time / feasibility  | Why it earns space                                                                     |
| ------------------------------------------------------------------------------------------------ | ----------- | ------------------- | -------------------------------------------------------------------------------------- |
| ★ Customers who opened campaigns - count + static text (supporting)                              | Both        | `90D · READY`       | Direct engagement observed in Yukti.                                                   |
| ★ Customers with campaign-linked demand - count + static text (supporting)                       | Growth      | `90D · REWORK`      | Uses only the primary demand document; never combines estimates and converted orders.  |
| ★ Campaign-linked demand value - value of orders (or fallback to estimates) + count (supporting) | Growth      | `90D · REWORK`      | Commercial response without calling it incremental revenue.                            |
| ★ Open-to-demand rate - % value + static text (supporting)                                       | Growth      | `90D · REWORK`      | Unique openers who submitted primary demand, with adaptive enquiry/order copy.         |
| Live campaigns                                                                                   | BAU         | `NOW · READY`       | Workflow context; often better in the subtitle.                                        |
| Campaign enquiry pipeline                                                                        | BAU         | `90D · READY`       | Order-primary alternative only; estimates remain a separately labelled upstream stage. |
| WhatsApp delivery rate                                                                           | BAU         | `90D · CONDITIONAL` | Available only for campaigns linked to authoritative broadcast delivery events.        |


### Action options


| Option                                                                                                                             | Time / feasibility  | Ranked by / action                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| ★ Live campaigns with weak opens - Campaign name, opens % (trailing), open count and total target count (supporting)               | `NOW · CONDITIONAL` | Requires a simple agreed minimum-age and open-rate threshold; fix access or resend. |
| ★ Many openers but no primary demand - Campaign name, demand value (trailing), open rate and estimates/orders count (supporting)   | `NOW · REWORK`      | Engaged non-buyers; review price, product availability, and message.                |
| ★ Expiring campaigns with engaged non-buyers - Campaign name, conversion rate (trailing), open rate % and expiry date (supporting) | `NOW · CONDITIONAL` | Days left and opener count; nudge or extend.                                        |
| Failed WhatsApp deliveries                                                                                                         | `NOW · CONDITIONAL` | Failed recipient count; correct contact or resend.                                  |
| Draft campaigns not published                                                                                                      | `NOW · READY`       | Age and audience size; finish or archive.                                           |


**Table rows:** status/validity, target/current audience, unique openers, primary-demand customers, linked demand value, and product count. Do not show previous-campaign growth; campaigns differ in audience and assortment.

### Detail Pulse options


| Option                                                                              | Owner value | Time / feasibility       | Why it earns space                                                   |
| ----------------------------------------------------------------------------------- | ----------- | ------------------------ | -------------------------------------------------------------------- |
| ★ Customers who opened - count + open % rate (supporting)                           | Both        | `LIFETIME · READY`       | Direct observed engagement.                                          |
| ★ Customers with demand - customer count + open-to-demand rate (supporring)         | Growth      | `LIFETIME · REWORK`      | Primary-demand response in one card with adaptive copy.              |
| ★ Campaign-linked demand value - demand value + transaction count (supporting text) | Growth      | `LIFETIME · REWORK`      | Direct linked primary-demand value.                                  |
| Customers delivered                                                                 | BAU         | `LIFETIME · CONDITIONAL` | Only when authoritative WhatsApp delivery data is linked.            |
| Campaign enquiry pipeline                                                           | BAU         | `LIFETIME · READY`       | Order-primary alternative; keep upstream estimate interest separate. |
| Engaged customers with no demand                                                    | Growth      | `NOW · REWORK`           | Keep in Actions/Explore rather than duplicating a headline KPI.      |
| Days remaining                                                                      | BAU         | `NOW · READY`            | Prefer in campaign header metadata rather than a KPI card.           |


### Explore options


| Option                                                            | Owner value | Time / feasibility       | Format and action                                                                                                |
| ----------------------------------------------------------------- | ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| ★ Campaign funnel - see metrics in the last column                | Both        | `LIFETIME · REWORK`      | Opened → primary demand; prepend delivered only when authoritative delivery data exists.                         |
| ★ Engagement and demand timeline - see metrics in the last column | Growth      | `LIFETIME · REWORK`      | Dated open and primary-demand events by week; explains when response occurred without repeating headline totals. |
| ★ Products requested - see metrics in the last column             | Growth      | `LIFETIME · REWORK`      | Ranked products, units, and value from the primary demand document.                                              |
| ★ Customers to follow up - see metrics in the last column         | BAU         | `NOW · REWORK`           | Opened but submitted no primary demand; direct message/action.                                                   |
| Response by location                                              | Growth      | `LIFETIME · CONDITIONAL` | Use document location, not assumed customer ownership.                                                           |
| Response by Customer Group                                        | Growth      | `LIFETIME · CONDITIONAL` | Uses current membership unless publish-time audience was saved.                                                  |
| Previous-campaign comparison                                      | Growth      | `LATER`                  | Campaign audiences, durations, and assortments are not naturally comparable.                                     |
| Cart/checkout funnel                                              | Growth      | `LATER`                  | Middle events are incomplete.                                                                                    |


## 8. Customer Groups

Current group membership is configuration, not historical truth. Any sales metric means “sales from customers who are members now,” and group totals must not be summed when customers overlap.

**Recommended shape:** Landing Pulse **3** · Actions **2** · Detail Pulse **4** · Explore **3**

**Subtitle:** `{group_count} customer groups · {assigned_customer_count} of {active_customer_count} active customers assigned.`

**Period:** Current membership plus fixed trailing 90-day facts about current members. No landing-page period control.

### Landing Pulse options


| Option                                                                                      | Owner value | Time / feasibility   | Why it earns space                                                                            |
| ------------------------------------------------------------------------------------------- | ----------- | -------------------- | --------------------------------------------------------------------------------------------- |
| ★ Customers assigned to at least one Group - count + % of total customer count (supporting) | BAU         | `NOW · READY`        | Shows whether segmentation setup covers the base.                                             |
| ★ Valuable customers in no Group - count + invoice value last 90d (supporting text)         | Growth      | `NOW + 90D · REWORK` | Count plus recent invoiced sales; the current aggregate is order-based.                       |
| ★ Grouped customers who purchased - count, average % across all groups (supporting text)    | Growth      | `90D · REWORK`       | Count and percentage of grouped customers; avoid an arbitrary 80% pass/fail threshold.        |
| Groups with an active Pricelist                                                             | BAU         | `NOW · READY`        | Configuration readiness.                                                                      |
| Groups with a live campaign                                                                 | Growth      | `NOW · READY`        | Current activation coverage.                                                                  |
| Rule-based Groups needing refresh                                                           | BAU         | `NOW · CONDITIONAL`  | Requires an agreed refresh/failure SLA.                                                       |
| Total Groups                                                                                | BAU         | `NOW · READY`        | Useful context, usually in the subtitle rather than a KPI.                                    |
| Combined Group sales                                                                        | Growth      | `LATER`              | Overlapping memberships make a summed headline misleading without a declared allocation rule. |


### Action options


| Option                                                                                                         | Time / feasibility   | Ranked by / action                                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| ★ High-value customers in no Group - Customer name, No group label (trailing), 90d invoiced sales (supporting) | `NOW + 90D · REWORK` | Recent invoiced sales; assign or create a Group.                |
| ★ Groups with neither active pricing nor a live campaign - Group name, member count (supporting)               | `NOW · READY`        | Member count/value; price or activate.                          |
| Rule-based Groups needing refresh                                                                              | `NOW · CONDITIONAL`  | Staleness/failure; refresh or fix rules.                        |
| Empty Groups                                                                                                   | `NOW · READY`        | Age and last update; add members or archive.                    |
| Assignment/price conflicts                                                                                     | `NOW · READY`        | Keep on Pricelists, where resolution priority can be explained. |


**Table rows:** total members, purchasing members in 90 days, 90-day invoiced sales from current members, and active Pricelist/Campaign badges. Rows are independently useful but not additive.

### Detail Pulse options


| Option                                                                          | Owner value | Time / feasibility | Why it earns space                                      |
| ------------------------------------------------------------------------------- | ----------- | ------------------ | ------------------------------------------------------- |
| ★ Members - count, static text (supporting)                                     | BAU         | `NOW · READY`      | Current addressable audience.                           |
| ★ Members who purchased - count, % of group (supporting)                        | Growth      | `90D · ON-OPEN`    | Commercial activity among current members.              |
| ★ Invoiced sales from current members - value, count of invoices (supporting)   | Growth      | `90D · ON-OPEN`    | Current-group value with explicit composition caveat.   |
| ★ Members with overdue balances - overdue amount, overdue invoices (supporting) | BAU         | `NOW · ON-OPEN`    | Risk within the current group.                          |
| Members with Buyer App access                                                   | Growth      | `NOW · READY`      | Digital readiness.                                      |
| Active Pricelists / campaigns                                                   | BAU         | `NOW · READY`      | Better as header metadata when already visible in tabs. |
| Historical group growth                                                         | Growth      | `LATER`            | Membership effective dates are absent.                  |


### Explore options


| Option                                                             | Owner value | Time / feasibility    | Format and action                                                         |
| ------------------------------------------------------------------ | ----------- | --------------------- | ------------------------------------------------------------------------- |
| ★ Member activity - see metrics in the last column                 | Both        | `90D · ON-OPEN`       | Bought in 0–30, 31–90, 90+ days, or never; choose activation action.      |
| ★ Products and brands members buy - see metrics in the last column | Growth      | `90D · ON-OPEN`       | Ranked mix for campaign/pricing decisions.                                |
| ★ Member opportunity list - see metrics in the last column         | Both        | `NOW + 90D · ON-OPEN` | Valuable inactive, overdue, unpriced, or not-on-app customers.            |
| Pricing and campaign setup                                         | BAU         | `NOW · READY`         | Assignment coverage and missing commercial setup.                         |
| Buyer App adoption                                                 | Growth      | `90D · ON-OPEN`       | Access, ordering, and app contribution among current members.             |
| Monthly sales trend                                                | Growth      | `LATER`               | Without membership history, the past is recomputed using today's members. |
| Historical margin                                                  | Growth      | `LATER`               | Cost-at-sale is absent.                                                   |


## 9. Pricelists

Pricelists are a configuration and diagnostics surface, not a time-series performance module. For cost/floor - use baseSellingPrice; for loss - use costPrice; for margin use costPrice; for %discount - use baseSellingPrice.

**Recommended shape:** Landing Pulse **4** · Actions **2** · Detail Pulse **4** · Explore **3**

**Subtitle:** `{pricelist_count} Pricelists · {active_count} active.`

**Period:** NOW posture; no landing-page period control.

### Landing Pulse options


| Option                                                                                     | Owner value | Time / feasibility  | Why it earns space                                                                    |
| ------------------------------------------------------------------------------------------ | ----------- | ------------------- | ------------------------------------------------------------------------------------- |
| ★ Customers with active custom pricing - customer count, % of total customers (supporting) | Both        | `NOW · READY`       | Deduplicated direct, Group, and all-customer assignments.                             |
| ★ Products with custom prices - product count, % of total products (supporting)            | BAU         | `NOW · READY`       | Current SKU scope across active lists.                                                |
| ★ Items priced below current cost/floor - count, static text (supporting)                  | Both        | `NOW · CONDITIONAL` | Immediate pricing check; label cost basis as current, not historical margin.          |
| Active Pricelists                                                                          | BAU         | `NOW · READY`       | Workflow context, usually suitable for the subtitle.                                  |
| ★ Pricelists expiring in 30 days - count, static text (supporting)                         | BAU         | `NOW · READY`       | Useful when validity windows are common.                                              |
| Customer Groups with active pricing                                                        | BAU         | `NOW · READY`       | Setup coverage for tenants using group pricing.                                       |
| Customers on base price                                                                    | Growth      | `NOW · CONDITIONAL` | Useful only when tenant policy expects custom pricing; base price may be intentional. |


### Action options


| Option                                                                                                | Time / feasibility  | Ranked by / action                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| ★ Expiring Pricelists - Pricelist name, X products (trailing), expiry date                            | `NOW · READY`       | Days left and affected customers; renew, replace, or allow expiry. |
| ★ Items below current cost/floor - Product name, custom price (trailing), pricelist name (supporting) | `NOW · CONDITIONAL` | Current exposure; correct price.                                   |
| Customers expected to have custom pricing but on base price                                           | `NOW · CONDITIONAL` | Requires an explicit tenant policy; assign pricing.                |
| Higher-priority overrides changing intended price                                                     | `NOW · ON-OPEN`     | Diagnostic, not an alert until conflict semantics are agreed.      |
| Most-covered Pricelists                                                                               | `READY`             | A leaderboard, not an action; keep out of Actions.                 |


**Table rows:** unique customers reached, product count, below-cost/floor exception count, average discount, validity, priority, and status. Avoid unweighted average margin.

### Detail Pulse options


| Option                                                             | Owner value | Time / feasibility  | Why it earns space                                               |
| ------------------------------------------------------------------ | ----------- | ------------------- | ---------------------------------------------------------------- |
| ★ Customers reached - count, static text (supporting)              | Both        | `NOW · READY`       | Deduplicated current assignment reach.                           |
| ★ Products priced - product count, static text (supporting)        | BAU         | `NOW · READY`       | Current assortment scope.                                        |
| ★ Typical discount - % discount, static text (supporting)          | Both        | `NOW · READY`       | Median or clearly defined average; describes pricing posture.    |
| ★ Items below current cost/floor - count, static text (supporting) | Both        | `NOW · CONDITIONAL` | Admin alternative when exceptions exist.                         |
| Customer Groups assigned                                           | BAU         | `NOW · READY`       | Prefer in subtitle/tab when assignments are already visible.     |
| Days to expiry                                                     | BAU         | `NOW · READY`       | Prefer header status metadata, not a KPI.                        |
| Sales using this Pricelist                                         | Growth      | `LATER`             | Transaction lines do not preserve resolved Pricelist provenance. |


### Explore options — Coverage & checks


| Option                                                             | Owner value | Time / feasibility  | Format and action                                                                         |
| ------------------------------------------------------------------ | ----------- | ------------------- | ----------------------------------------------------------------------------------------- |
| ★ Who receives this pricing - see metrics in the last column       | BAU         | `NOW · READY`       | Breakdown of direct customers, Groups, all-customer scope, overlaps, and unassigned gaps. |
| ★ Product coverage gaps - see metrics in the last column           | BAU         | `NOW · READY`       | Breakdown of products explicitly priced, on base price, excluded, or unavailable.         |
| ★ Discount bands and price checks - see metrics in the last column | Both        | `NOW · CONDITIONAL` | Distribution and exception list, not a repeat of the headline typical discount.           |
| Higher-priority override diagnostics                               | BAU         | `NOW · ON-OPEN`     | Explain which configured rule wins and why.                                               |
| Activity log                                                       | BAU         | `NOW · READY`       | Recent assignment and price changes when audit data is complete.                          |
| Historical adoption/value                                          | Growth      | `LATER`             | Requires transaction-level resolved Pricelist provenance.                                 |
| Margin impact trend                                                | Growth      | `LATER`             | Requires both Pricelist provenance and cost-at-sale.                                      |


## 10. Brands

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Subtitle:** `{active_brand_count} active brands · {branded_product_count} of {active_product_count} active products branded.`

**Period:** Fixed trailing 90 days for sales; stock posture is NOW. No landing-page period control. Brand comparisons live in Explore, not table-row growth pills.

### Landing Pulse options


| Option                                                                                               | Owner value | Time / feasibility   | Why it earns space                                                          |
| ---------------------------------------------------------------------------------------------------- | ----------- | -------------------- | --------------------------------------------------------------------------- |
| ★ Invoiced sales from branded products - value + count of products (supporting)                      | Both        | `90D · REWORK`       | Current brand daily facts are order-based and must switch to invoice lines. |
| ★ Brands with invoiced sales - brand count + total brands (supoprting)                               | BAU         | `90D · REWORK`       | Count brands with eligible invoice lines, not orders.                       |
| ★ Selling brand products low/out of stock - product count + brand count (supporting)                 | Both        | `NOW + 90D · REWORK` | Join current stock to invoice demand rather than current order facts.       |
| Customers who purchased branded products                                                             | Growth      | `90D · REWORK`       | Feasible from invoice lines, but the current brand facts are order-led.     |
| Top brand share of sales                                                                             | Growth      | `90D · REWORK`       | Invoice-based concentration; current brand facts are order-led.             |
| ★ Stock in brands with no sale in 90 days - total units + product count and brand count (supporting) | Both        | `NOW + 90D · REWORK` | Count/units are safe; value depends on complete current cost.               |
| Brands with sales falling versus prior 90 days                                                       | Growth      | `90D · REWORK`       | Low-cardinality comparison is affordable, but current facts are order-led.  |
| Gross margin by brand                                                                                | Growth      | `LATER`              | Historical cost-at-sale is absent.                                          |


### Action options


| Option                                                                                                                          | Time / feasibility   | Ranked by / action                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| ★ Selling brands with stock risk - Brand image+name, product count (trailing), invoiced sales amount last 90d (supporting text) | `NOW + 90D · REWORK` | Recent invoice sales attached to low/out-of-stock products; replenish or source. |
| ★ Selling brands with stock risk - Brand image+name, product count (trailing), untis in stock (supporting)                      | `NOW + 90D · REWORK` | Current count/units; show value only when current cost is complete.              |
| ★ Brands losing meaningful sales - Brand image+name, product count (trailing), sales decline trend (supporting)                 | `90D · REWORK`       | Low-cardinality comparison is affordable, but current facts are order-based.     |
| Brand products below current price floor                                                                                        | `NOW · CONDITIONAL`  | Current exceptions; reprice or renegotiate.                                      |
| Brands with no recent campaign                                                                                                  | `NOW · READY`        | Useful only when tenant strategy expects campaign coverage.                      |


**Table rows:** trailing-90-day invoiced sales, customers who purchased, products that sold, and recent sellers low/out of stock. Growth is an optional sort/filter, not a default column.

### Detail Pulse options


| Option                                                                       | Owner value | Time / feasibility    | Why it earns space                              |
| ---------------------------------------------------------------------------- | ----------- | --------------------- | ----------------------------------------------- |
| ★ Invoiced sales - amount + product count (supporting)                       | Both        | `90D · ON-OPEN`       | Recent commercial scale.                        |
| ★ Customers who purchased - count + static text (supoprting)                 | Growth      | `90D · ON-OPEN`       | Distribution breadth in familiar language.      |
| ★ Recent sellers low/out of stock - product count + static text (supporting) | BAU         | `NOW + 90D · ON-OPEN` | Immediate availability risk.                    |
| Units sold                                                                   | BAU         | `90D · ON-OPEN`       | Volume alternative for unit-led categories.     |
| ★ Products that sold - product count + static text (Supporting)              | Growth      | `90D · ON-OPEN`       | Product productivity without an abstract ratio. |
| Top product share of brand sales                                             | Growth      | `90D · ON-OPEN`       | Concentration within the brand.                 |
| App-sourced sales share                                                      | Growth      | `90D · ON-OPEN`       | Digital contribution alternative.               |
| Gross margin                                                                 | Growth      | `LATER`               | Cost-at-sale is missing.                        |


### Explore options


| Option                                                        | Owner value | Time / feasibility  | Format and action                                                                    |
| ------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------ |
| ★ Sales over time - see metrics in last column                | Both        | `12M · ON-OPEN`     | Monthly invoiced sales/units grouped from raw invoice lines.                         |
| ★ Product contribution - see metrics in last column           | Growth      | `90D · ON-OPEN`     | Pareto list of leading, declining, and stock-risk SKUs; paginate beyond the top set. |
| ★ Customers buying the brand - see metrics in last column     | Growth      | `90D · ON-OPEN`     | Ranked customers with last purchase and value.                                       |
| ★ Current inventory by warehouse - see metrics in last column | BAU         | `NOW · READY`       | Availability of brand products by warehouse.                                         |
| Campaign and Buyer App contribution                           | Growth      | `90D · CONDITIONAL` | Directly linked source contribution only.                                            |
| Sales by location                                             | Growth      | `90D · ON-OPEN`     | Location mix where invoice location is populated.                                    |
| Historical price/margin realization                           | Growth      | `LATER`             | Cost-at-sale is absent; price-only distribution may be added separately.             |


## 11. Locations

Location metrics use the explicit location on estimates, orders, and invoices. They describe business serviced at a location; they do not imply permanent customer ownership.

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Subtitle:** `{active_location_count} active locations · {linked_warehouse_count} linked warehouses.`

**Period:** Fixed trailing 90 days for sales; primary-demand/receivable/stock posture is NOW. No landing-page period control.

### Landing Pulse options


| Option                                                                            | Owner value | Time / feasibility        | Why it earns space                                                             |
| --------------------------------------------------------------------------------- | ----------- | ------------------------- | ------------------------------------------------------------------------------ |
| ★ Invoiced sales across locations - invoiced amount + location count (supporting) | Both        | `90D · REWORK`            | Current location daily facts are order-based; rebuild from invoice location.   |
| Open order value                                                                  | BAU         | `NOW · READY`             | Current demand being handled across locations.                                 |
| ★ Overdue amount - overdue amount + location count (supporting)                   | BAU         | `NOW · READY`             | Collections exposure by invoice location.                                      |
| ★ Customers who purchased - customer count + static text (supporting)             | Growth      | `90D · REWORK`            | Unique invoice customers; the current location commercial facts are order-led. |
| ★ Open primary demand value - demand value + location count (supporting)          | Growth      | `NOW · REWORK`            | Open estimate value for Estimate-primary tenants; open order value otherwise.  |
| Locations with recent sellers low/out of stock                                    | BAU         | `NOW + 90D · CONDITIONAL` | Requires a clear location-to-warehouse relationship.                           |
| Top location share of sales                                                       | Growth      | `90D · REWORK`            | Invoice-based concentration; current location facts are order-led.             |
| Gross margin / fill rate                                                          | Growth      | `LATER`                   | Cost-at-sale and complete fulfillment facts are missing.                       |


### Action options


| Option                                                                                                                        | Time / feasibility        | Ranked by / action                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| ★ Locations with overdue balances - Location Name, Overdue balance (trailing), customer and invoice counts (supporting)       | `NOW · READY`             | Amount × age; assign collections action.                                          |
| Locations with orders waiting beyond SLA                                                                                      | `NOW · CONDITIONAL`       | Current status age and order value versus agreed thresholds; confirm or dispatch. |
| ★ Recently sold items unavailable at linked warehouse - Location name, products count (trailing), units sold 90d (supporting) | `NOW + 90D · CONDITIONAL` | Recent sales plus current stock; replenish or source.                             |
| ★ Locations with expiring estimates - Location name, estimates value (trailing), estimate count and days left (supporting)    | `NOW · READY`             | Value and days left; follow up; hide when Estimates are disabled.                 |
| Locations with sales falling materially                                                                                       | `90D · REWORK`            | Invoice-based absolute decline; current location history is order-led.            |


**Table rows:** trailing-90-day invoiced sales, open primary-demand value, overdue amount, and current linked-stock status when mapping is reliable. One optional comparison may be exposed through sorting, not a growth column.

### Detail Pulse options


| Option                                                                      | Owner value | Time / feasibility        | Why it earns space                                                                     |
| --------------------------------------------------------------------------- | ----------- | ------------------------- | -------------------------------------------------------------------------------------- |
| ★ Invoiced sales - invoice amount + count (supporting)                      | Both        | `90D · ON-OPEN`           | Recent commercial scale.                                                               |
| Open order value                                                            | BAU         | `NOW · READY`             | Current operational workload.                                                          |
| ★ Overdue amount - overdue amount + count (supporting)                      | BAU         | `NOW · READY`             | Cash exposure at this serviced location.                                               |
| ★ Customers who purchased here - customer count + static text (supporting)  | Growth      | `90D · ON-OPEN`           | Local market activity without claiming ownership.                                      |
| ★ Open primary demand value - demand value + transaction count (supporting) | Growth      | `NOW · ON-OPEN`           | Current estimate pipeline for Estimate-primary tenants; open order workload otherwise. |
| Recent sellers low/out of stock                                             | BAU         | `NOW + 90D · CONDITIONAL` | Current availability risk at linked warehouses.                                        |
| Orders waiting beyond SLA                                                   | BAU         | `NOW · CONDITIONAL`       | Operational exception alternative after status thresholds are agreed.                  |
| Gross margin / fill rate                                                    | Growth      | `LATER`                   | Required historical cost/fulfillment facts are missing.                                |


### Explore options


| Option                                                            | Owner value | Time / feasibility  | Format and action                                                  |
| ----------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------ |
| ★ Sales over time - see metrics in the last column                | Both        | `12M · ON-OPEN`     | Weekly/monthly invoiced sales.                                     |
| Order execution workload                                          | BAU         | `NOW · READY`       | Status distribution and aging; not an unsupported fill-rate claim. |
| ★ Brand and category mix - see metrics in the last column         | Growth      | `90D · ON-OPEN`     | Sales contribution and concentration.                              |
| ★ Inventory at linked warehouses - see metrics in the last column | BAU         | `NOW · CONDITIONAL` | Current stock posture and selling-item shortages.                  |
| Buyer App and campaign contribution                               | Growth      | `90D · CONDITIONAL` | Directly linked source contribution.                               |
| ★ Customers buying here - see metrics in the last column          | Growth      | `90D · ON-OPEN`     | Ranked customer activity, not permanent customer ownership.        |
| Customer health by owned territory                                | Growth      | `LATER`             | There is no direct customer-to-location ownership model.           |


## 12. Warehouses

Warehouse analytics is current-state inventory intelligence. Do not present historical stock, stock age, inventory turns, transfers, or replenishment trends until a complete movement ledger exists.

**Recommended shape:** Landing Pulse **2–4 adaptive** · Actions **2–3 adaptive** · Detail Pulse **2–4 adaptive** · Explore **2–4 adaptive**

**Subtitle:** `{warehouse_count} warehouses across {location_count} locations.` Show stale or partial inventory coverage as a separate data-health warning using the oldest required source watermark.

**Period:** NOW posture with a fixed trailing-90-day invoiced-sales context. No landing-page period control.

### Landing Pulse options


| Option                                                                                     | Owner value | Time / feasibility        | Why it earns space                                                            |
| ------------------------------------------------------------------------------------------ | ----------- | ------------------------- | ----------------------------------------------------------------------------- |
| ★ Sellable units + products in stock (supporting)                                          | BAU         | `NOW · READY`             | Current serviceable inventory posture.                                        |
| ★ Recently sold products now out of stock - products count + warehouse count (supporting)  | BAU         | `NOW + 90D · CONDITIONAL` | Exact only with one warehouse per location or explicit warehouse attribution. |
| Recently sold products running low                                                         | BAU         | `NOW + 90D · CONDITIONAL` | Demand-backed cover needs reliable location-to-warehouse attribution.         |
| ★ Stock with no sale in 90 days - total units + warehouse count (supporting)               | Both        | `NOW + 90D · CONDITIONAL` | Warehouse no-sale attribution has the same location-mapping dependency.       |
| Inventory value at current cost                                                            | BAU         | `NOW · CONDITIONAL`       | Label as an estimate; current cost may not equal accounting valuation.        |
| Products tracked                                                                           | BAU         | `NOW · READY`             | Configuration context, usually in the subtitle.                               |
| ★ Products out of stock regardless of sales - product count + warehouse count (supporting) | BAU         | `NOW · READY`             | Stable service-level posture without warehouse sales attribution.             |
| Historical stock turns                                                                     | Growth      | `LATER`                   | Requires a complete movement ledger.                                          |


### Action options


| Option                                                                                                             | Time / feasibility        | Ranked by / action                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------- |
| ★ Recently sold products now out of stock - Product image+Name, status (trailing), recent sales units (supporting) | `NOW + 90D · CONDITIONAL` | Recent sales/units then shortage; requires reliable warehouse attribution.                      |
| Stock with no sale in 90 days                                                                                      | `NOW + 90D · CONDITIONAL` | Current units/value; requires reliable warehouse attribution.                                   |
| Stock available in another warehouse                                                                               | `NOW · READY`             | Same SKU has stock elsewhere; review a transfer suggestion.                                     |
| ★ Negative or inconsistent availability - Warehouse name, product count (trailing)                                 | `NOW · READY`             | Negative stock or committed greater than available; investigate sync/data.                      |
| Recently replenished products                                                                                      | `LATER`                   | Inbound events are not a complete inventory history and should not drive a general action feed. |


**Table rows:** linked location, available stock, products in stock, recent sellers OOS/low when attribution is reliable, and stock with no sale in 90 days. Show freshness as a page-level data-health warning, not per row. Avoid pseudo-historical fields.

### Detail Pulse options


| Option                                                                                 | Owner value | Time / feasibility        | Why it earns space                                             |
| -------------------------------------------------------------------------------------- | ----------- | ------------------------- | -------------------------------------------------------------- |
| ★ Sellable units + products in stock - units count + products (supporting)             | BAU         | `NOW · READY`             | Current inventory scale.                                       |
| ★ Recently sold products now out of stock - product count + static text                | BAU         | `NOW + 90D · CONDITIONAL` | Demand-backed shortage when warehouse attribution is reliable. |
| Recently sold products running low                                                     | BAU         | `NOW + 90D · CONDITIONAL` | Replenishment workload with the same dependency.               |
| ★ Stock with no sale in 90 days - stock units + product count (supporting)             | Both        | `NOW + 90D · CONDITIONAL` | Current working-capital signal with the same dependency.       |
| Inventory value at current cost                                                        | BAU         | `NOW · CONDITIONAL`       | Accounting approximation only.                                 |
| ★ Products out of stock regardless of sales - product count + static text (supporting) | BAU         | `NOW · READY`             | Stable current service-level posture.                          |
| Products tracked                                                                       | BAU         | `NOW · READY`             | Better as subtitle context.                                    |
| Open ordered quantity                                                                  | BAU         | `NOW · CONDITIONAL`       | Directional demand, not fulfilled/remaining truth.             |
| Inventory turns                                                                        | Growth      | `LATER`                   | Movement history is missing.                                   |


### Explore options


| Option                                                        | Owner value | Time / feasibility        | Format and action                                                                                                         |
| ------------------------------------------------------------- | ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ★ Current inventory posture - see metrics in last column      | BAU         | `NOW · READY`             | In-stock, low-stock, and out-of-stock products from current inventory only.                                               |
| ★ Stock-risk product list - see metrics in last column        | BAU         | `NOW + 90D · CONDITIONAL` | Current stock plus demand-backed risk only where warehouse attribution is reliable.                                       |
| ★ Availability by brand/category - see metrics in last column | Both        | `NOW · ON-OPEN`           | Current concentration and shortage view.                                                                                  |
| ★ Stock with no sale in 90 days - see metrics in last column  | Both        | `NOW + 90D · CONDITIONAL` | Already covered in Pulse/Actions; keep only as an optional drill-down.                                                    |
| Transfer suggestions - see metrics in last column             | BAU         | `NOW · CONDITIONAL`       | Current excess elsewhere versus shortage here; needs compatible product stocking across warehouses and agreed thresholds. |
| Stock value by brand/category                                 | BAU         | `NOW · CONDITIONAL`       | Current-cost estimate.                                                                                                    |
| Inventory movement/activity                                   | BAU         | `LATER`                   | Audit/inbound data is not a complete ledger.                                                                              |
| Historical stock trend / age                                  | Growth      | `LATER`                   | Not reconstructable reliably.                                                                                             |


## 13. Categories

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **3**

**Subtitle:** `{category_count} categories · {categorised_product_count} categorised products · {uncategorised_product_count} need setup.`

**Period:** Fixed trailing 90 days for sales; stock and categorisation posture is NOW. No landing-page period control.

### Landing Pulse options


| Option                                                                                           | Owner value | Time / feasibility   | Why it earns space                                                             |
| ------------------------------------------------------------------------------------------------ | ----------- | -------------------- | ------------------------------------------------------------------------------ |
| ★ Invoiced sales by categorised products - invoiced sales amount + categories count (supporting) | Both        | `90D · REWORK`       | Current category daily facts are order-based and must switch to invoice lines. |
| Products that sold                                                                               | Growth      | `90D · REWORK`       | Count products on eligible invoice lines, not current order facts.             |
| Recent sellers low/out of stock                                                                  | BAU         | `NOW + 90D · REWORK` | Join current stock to invoice-backed recent sales.                             |
| ★ Categories with invoiced sales - category count + static text (supporting)                     | BAU         | `90D · REWORK`       | Count categories with eligible invoice lines.                                  |
| Customers who purchased                                                                          | Growth      | `90D · REWORK`       | Unique invoice customers; current category facts are order-led.                |
| ★ Categories with no sale in 90 days - category count + static text (Supporting)                 | Both        | `NOW + 90D · REWORK` | Count/units are safe; value depends on complete current cost.                  |
| ★ Uncategorised active products - product count + static text (supporting)                       | BAU         | `NOW · READY`        | Search/reporting data-quality issue.                                           |
| Gross margin by category                                                                         | Growth      | `LATER`              | Cost-at-sale is missing.                                                       |


### Action options


| Option                                                                                                                        | Time / feasibility   | Ranked by / action                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| ★ Categories with recent sellers out of stock - Category image+name, product count (trailing), invoice value 90d (supporting) | `NOW + 90D · REWORK` | Recent invoice sales then shortage; replenish or source.              |
| ★ Categories with no sale in 90 days - Category image+name, product count (trailing)                                          | `NOW + 90D · REWORK` | Current count/units; value only with complete current cost.           |
| ★ Uncategorised active products - Product image+name, recent sales amount (trailing), X units (supporting)                    | `NOW · READY`        | Product count and recent sales; assign a category.                    |
| Categories with sales falling materially                                                                                      | `90D · REWORK`       | Invoice-based absolute decline; current category facts are order-led. |
| Category products below current price floor                                                                                   | `NOW · CONDITIONAL`  | Current exceptions; reprice.                                          |


**Table rows:** trailing-90-day invoiced sales, products that sold, and recent sellers low/OOS. No default customer, growth, or brand columns.

### Detail Pulse options


| Option                                                                        | Owner value | Time / feasibility    | Why it earns space                          |
| ----------------------------------------------------------------------------- | ----------- | --------------------- | ------------------------------------------- |
| ★ Invoiced sales - invoiced amount + product count (supporting)               | Both        | `90D · ON-OPEN`       | Recent category scale.                      |
| ★ Units sold + products that sold (supporting)                                | Both        | `90D · ON-OPEN`       | Volume and assortment movement in one card. |
| ★ Recent sellers low/out of stock - products count + static text (supporting) | BAU         | `NOW + 90D · ON-OPEN` | Availability risk.                          |
| Customers who purchased                                                       | Growth      | `90D · ON-OPEN`       | Distribution breadth in plain language.     |
| ★ Stock with no sale in 90 days - units + product count (supporting)          | Both        | `NOW + 90D · ON-OPEN` | Current working-capital signal.             |
| Top brand share                                                               | Growth      | `90D · ON-OPEN`       | Concentration within the category.          |
| App-sourced sales share                                                       | Growth      | `90D · ON-OPEN`       | Digital contribution alternative.           |
| Gross margin                                                                  | Growth      | `LATER`               | Cost-at-sale is missing.                    |


### Explore options


| Option                                             | Owner value | Time / feasibility    | Format and action                                             |
| -------------------------------------------------- | ----------- | --------------------- | ------------------------------------------------------------- |
| ★ Sales over time - see metrics in last column     | Both        | `12M · ON-OPEN`       | Monthly invoiced sales/units.                                 |
| ★ Brand contribution - see metrics in last column  | Growth      | `90D · ON-OPEN`       | Ranked brands and concentration.                              |
| ★ Product action list - see metrics in last column | Both        | `NOW + 90D · ON-OPEN` | Best sellers, stock risks, and stocked products with no sale. |
| Customers buying the category                      | Growth      | `90D · ON-OPEN`       | Ranked customers and last purchase.                           |
| Sales by location                                  | Growth      | `90D · ON-OPEN`       | Location mix when invoice location is populated.              |
| Campaign and Buyer App contribution                | Growth      | `90D · CONDITIONAL`   | Direct linked contribution only.                              |
| Historical margin trend                            | Growth      | `LATER`               | Cost-at-sale is missing.                                      |


---

# Dashboard portfolios

## Seller Dashboard — business control tower

The Seller Dashboard is the only cross-module command centre. It shows overall business posture and routes owners to the module where action happens. It should contain one Buyer App teaser, not repeat the Buyer App dashboard.

**Recommended shape:** Pulse **4** · Actions **3** · Explore **3**

**Subtitle:** `{tenant_name} across {location_count} locations · this month’s sales and current operations.`

**Period:** Fixed This month for sales/flow; NOW cards and Actions are labelled “As of today.” No dashboard period control.

### Pulse options


| Option                                                                     | Owner value | Time / feasibility    | Why it earns space                                                            |
| -------------------------------------------------------------------------- | ----------- | --------------------- | ----------------------------------------------------------------------------- |
| ★ Invoiced sales - value + customer count (supporting)                     | Both        | `THIS MONTH · REWORK` | Canonical headline; the current dashboard is still order-value based.         |
| Open order value                                                           | BAU         | `NOW · READY`         | Current committed demand.                                                     |
| ★ Overdue receivables - value + customer count (supporting)                | Both        | `NOW · READY`         | Cash exposure requiring action.                                               |
| ★ Recently sold products now out of stock - count + meaningful static text | BAU         | `NOW + 90D · REWORK`  | Current availability risk tied to invoice demand.                             |
| Customers who purchased                                                    | Growth      | `90D · REWORK`        | Invoice-based breadth; the current dashboard path is order-led.               |
| ★ Open primary demand - value + count (supporting)                         | Growth      | `NOW · REWORK`        | Open estimate value for Estimate-primary tenants; open order value otherwise. |
| Amount due in 7 days                                                       | BAU         | `NOW · READY`         | Collections planning alternative.                                             |
| Stock with no sale in 90 days                                              | Both        | `NOW + 90D · REWORK`  | Join current stock to absence of eligible invoice lines.                      |
| Buyer App demand customers + sales share                                   | Growth      | `90D · REWORK`        | Adaptive primary-demand teaser linking to the channel dashboard.              |
| Gross margin                                                               | Growth      | `LATER`               | Cost-at-sale is missing.                                                      |


### Action options


| Option                                                                                                                   | Time / feasibility        | Ranked by / action                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ★ Primary demand action - Buyer Name, Amount (trailing), Estimate/Order number and last activity date (supporting)       | `NOW · REWORK`            | Estimate follow-up when Estimates are primary; order execution otherwise.                                               |
| Estimate follow-up                                                                                                       | `NOW · READY`             | Expiring and high-value unresolved estimates.                                                                           |
| Order execution                                                                                                          | `NOW · READY`             | Orders to confirm or dispatch, ranked by age and value.                                                                 |
| ★ Collections - Buyer Name, Amount (trailing), invoice count and overdue age (supporting)                                | `NOW · READY`             | Overdue customers ranked by amount and age.                                                                             |
| Product availability                                                                                                     | `NOW + 90D · REWORK`      | Recent invoice sellers low/out of stock; current demand path is order-led.                                              |
| Customer reactivation                                                                                                    | `NOW + 90D · CONDITIONAL` | Due-to-reorder and valuable inactive customers.                                                                         |
| ★ Buyer App activation - Buyer Name, invoice Amount (trailing), buyer-app status, invoice count last 90days (supporting) | `NOW + 90D · REWORK`      | Valuable customers not enabled or enabled but unused; value must be invoice-led rather than the current order-led path. |


### Explore options

Show three recommended cards. Put the rest behind “More insights.” Show these cards below the Action cards in the dashboard itself.


| Option                                                 | Owner value | Time / feasibility    | Format and action                                                                                                        |
| ------------------------------------------------------ | ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ★ Business flow - see metrics in the last column       | Both        | `THIS MONTH · REWORK` | Primary-demand value → invoiced sales; show Estimates separately only when Orders are primary, and omit disabled stages. |
| ★ Sales mix - see metrics in teh last column           | Growth      | `90D · REWORK`        | One invoice-based card with Brand / Category / Location tabs; current entity facts are order-based.                      |
| ★ Customer activity - see metrics in the last column   | Growth      | `90D · REWORK`        | Purchasing, repeat, inactive, and overdue customers in plain language.                                                   |
| Inventory actions                                      | BAU         | `NOW + 90D · REWORK`  | Recent invoice sellers short and stock with no sale; current demand path is order-led.                                   |
| Buyer App teaser                                       | Growth      | `90D · REWORK`        | Primary-demand customers and app-sourced invoiced-sales share; link deeper.                                              |
| Significant changes                                    | Both        | `NOW · CONDITIONAL`   | Only material cancellations, newly overdue invoices, or integration/data warnings; not generic activity.                 |
| ★ Location comparison - see metrics in the last column | Growth      | `90D · REWORK`        | Invoiced sales, open primary demand, and overdue by location; current commercial facts are order-led.                    |
| Margin leakage                                         | Growth      | `LATER`               | Cost-at-sale is missing.                                                                                                 |


## Buyer App Dashboard — channel adoption workspace

Use the complete option portfolio in [Buyer App](#6-buyer-app). Its default composition is:

- **Pulse 4:** Customers with access; customers submitting primary demand; app-sourced invoiced sales/share; repeat app customers.
- **Actions 3:** Valuable assisted customers without access; enabled but unused; used but submitted no primary demand.
- **Explore 4:** Adoption funnel; business through app; contribution over time; adoption by location.

Do not repeat seller-wide receivables, inventory, margin, or general order-execution cards here.

On the Seller Dashboard, use exactly one Buyer App cross-link: show the starred activation Action when that queue has exceptions; otherwise show the Explore teaser. Never render both.

---

# Recommended density summary


| Surface          | Landing Pulse | Actions | Detail Pulse | Explore |
| ---------------- | ------------- | ------- | ------------ | ------- |
| Estimates        | 4             | 3       | 0            | 0       |
| Sales Orders     | 4             | 3       | 0            | 0       |
| Invoices         | 4             | 3       | 0            | 0       |
| Customers        | 4             | 2       | 4            | 4       |
| Products         | 4             | 3       | 3            | 4       |
| Buyer App        | 4             | 3       | —            | 4       |
| Campaigns        | 4             | 3       | 3            | 4       |
| Customer Groups  | 3             | 2       | 4            | 3       |
| Pricelists       | 4             | 2       | 4            | 3       |
| Brands           | 4             | 3       | 4            | 4       |
| Locations        | 4             | 3       | 4            | 4       |
| Warehouses       | 2–4           | 2–3     | 2–4          | 2–4     |
| Categories       | 4             | 3       | 4            | 3       |
| Seller Dashboard | 4             | 3       | —            | 3       |


These are curated defaults, not structural requirements. Render fewer when no other option passes the usefulness, comprehension, and truth tests.

---

# Challenges applied to the reviewed selections

Most revised stars remain intact. The following were changed because keeping them would create duplicate or misleading information:

1. **Estimates + Orders were not combined.** Converted estimates can represent the same demand twice. All shared surfaces now use the tenant's primary demand document.
2. **The duplicate Sales Order value card was merged.** “Total orders value” and “Order value created” were the same metric.
3. **Ready to convert is not a default Estimate action.** It is irrelevant when Sales Orders are disabled; Drafts not sent is the third default instead.
4. **Customer average demand uses one stage.** Averaging Estimates and Orders together mixes unlike commercial commitments.
5. **Campaign detail uses three default Pulse cards.** “Engaged customers with no demand” is an action queue, not a headline KPI.
6. **Customer Group activity has no arbitrary 80% threshold.** Show grouped customers who purchased as a count and percentage.
7. **Warehouse Explore does not repeat no-sale stock a third time.** Transfer suggestions take that slot, while demand-backed warehouse metrics remain conditional on attribution.
8. **Four Pulse and three Actions remain caps.** A conditional or unavailable fourth card disappears cleanly rather than being replaced with a weak metric.
9. **Warehouse density is adaptive.** Two current-inventory facts remain valid everywhere; demand-backed cards appear only when location-to-warehouse attribution is trustworthy.

---

# Current implementation implications

## Keep and correct

- Preserve the existing visual hierarchy: title → Pulse → Actions → table → opt-in Explore.
- Keep receivables, overdue, open document posture, current stock, Buyer App access, campaign opens, and direct source contribution.
- Standardize value language: Estimate Value, Order Value, Invoiced Sales, Campaign-linked Demand Value, App-sourced Invoiced Sales.
- Resolve the primary demand document from tenant settings everywhere; do not let each route independently choose Estimates, Orders, or both.
- Make Actions ignore the selected document-created period so older unresolved records never disappear.

## Remove or demote

- Universal landing-page period selectors. Keep date controls only inside Estimate, Sales Order, and Invoice table toolbars.
- Growth columns and previous-period arrows from customer/product/brand/category/location tables.
- Top Spenders, Top Risers, Most Coverage, and generic Recent Activity from action space.
- Duplicate KPI strips and Performance tabs on estimate, order, and invoice details.
- Active entity counts as headline cards when they belong in page subtitles.
- Performance as the default-open tab; default to operational Details/Overview and remember only explicit user selection.

## Defer until source data improves

- Historical gross margin and margin trends.
- Inventory history, turns, age, shrinkage, replenishment, and true dead stock.
- Exact fill rate and OTIF.
- Historical Customer Group performance.
- Historical Pricelist adoption/value.
- Full campaign/cart funnel and causal or incremental lift.

---

# Metric admission checklist

Before a metric reaches a default surface, every answer must be yes:

1. **Truth:** Is the raw source and status/date definition reliable?
2. **Language:** Can an SMB owner understand the title without a tooltip?
3. **Decision:** Does it suggest a likely action or a necessary business check?
4. **Placement:** Is it Pulse, Action, or Explore—without repeating another layer?
5. **Time:** Is it clearly NOW, period-based, or lifetime?
6. **Cost:** Can it be served at the entity cardinality without daily zero rows or full-table hydration?
7. **Role:** Is it useful to the BAU owner, the growth-oriented owner, or both?
8. **Confidence:** Will missing data be shown as unavailable rather than zero?

Only after this proposal is approved should each recommended metric be mapped to the lightest correct read and refresh mechanism.