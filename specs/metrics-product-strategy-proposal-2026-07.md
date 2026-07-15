# Yukti Metrics Product Strategy — Revised Proposal

Date: 2026-07-15

Status: Product proposal for metric selection; not yet the canonical implementation dictionary

Scope: Seller navbar modules under Operations and Growth, plus the Seller Dashboard and Buyer App contribution dashboard

Out of scope: aggregate-table design, refresh mechanisms, API implementation, and migrations

## Executive position

Yukti should feel like a command centre, not a business-intelligence suite. Every surface should progressively answer:

1. **Pulse — What is happening?** Two to four familiar facts.
2. **Actions — What needs attention?** Zero to three ranked work queues.
3. **Explore — Why is it happening?** Two to four optional cards after the owner deliberately opens the tab.

The metric lists below are option portfolios, not quotas. `★` marks the recommended default. A page may render fewer cards when fewer facts deserve permanent space. Empty slots are never filled with weak metrics23.

This revision reassesses the earlier proposal from first principles. Previous review markings are intentionally not carried forward.

## How to read the recommendations



### Feasibility


| Code          | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `READY`       | The source data exists and can support the definition now. The current API may still require correction.         |
| `ON-OPEN`     | Practical as a bounded database aggregate when one detail page opens; do not maintain it daily for every entity. |
| `CONDITIONAL` | Usable only when the named configuration, integration, or data-quality condition is satisfied.                   |
| `LATER`       | Do not ship as truth with the current data. It needs missing history, provenance, ledger events, or attribution. |




### Time basis


| Label                 | Behavior                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NOW`                 | Current posture. It ignores period filters and is labelled “Current” or “As of today.”                              |
| `THIS MONTH`          | A fixed calendar-month flow measure using canonical document dates.                                                 |
| `SELECTED PERIOD`     | Uses the page or card's explicitly selected bounded period.                                                         |
| `30D` / `90D` / `12M` | Bounded transaction period using canonical document dates and IST boundaries.                                       |
| `NOW + 90D`           | A current posture qualified by trailing-90-day demand; for example, current stockouts among recently sold products. |
| `LIFETIME`            | Fixed entity lifetime, used mainly for campaign details.                                                            |


Technically feasible does not automatically mean suitable. An option still needs to be understandable and support a decision.

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



## Period-filter policy


| Surface                                                    | Recommended default and controls                                                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seller Dashboard                                           | This month for flow/sales; current-state cards remain “As of today.”                                                                                                               |
| Estimates, Sales Orders, Invoices landing                  | Document table defaults to This month; optional Today, This week, 90 days, Custom. Current Pulse cards and Actions ignore the table filter. Period-based cards state their period. |
| Customers, Products, Brands, Categories, Locations landing | Fixed trailing 90 days plus clearly labelled current-state cards. No page-global period control in V1.                                                                             |
| Warehouses and Pricelists                                  | Current posture; no global period selector. Velocity context may explicitly use trailing 90 days.                                                                                  |
| Customer Groups                                            | Current membership plus fixed trailing 90-day facts about current members. No global period selector.                                                                              |
| Campaign landing [TBD]                                     | Current/live campaigns plus selected-period outcomes. Campaign detail uses campaign lifetime.                                                                                      |
| Entity Explore tabs                                        | Default 90 days for mixes and ranked lists. Historical trend cards use a clearly labelled fixed 12 months; expose more controls only when the decision benefits.                   |




## Shared truth and language

- **Invoiced sales:** eligible invoice value in the selected period. Use this for customer, product, brand, category, location, and tenant sales performance. Do not call estimate or order value GMV.
- **Estimate value / Order value:** the explicit commercial value at that document stage.
- **Purchasing customer:** a customer with at least one eligible invoice in the period. If an order-based variant is needed, label it “Customers who ordered.”
- **Open order value:** non-terminal, non-cancelled order value. Do not imply unfulfilled value until line-level fulfillment is trustworthy.
- **Outstanding / overdue:** positive eligible invoice balance; overdue only after its due date.
- **Due to reorder:** past an observed repeat-purchase interval with enough history. Use a simple fixed fallback only when clearly labelled.
- **Stock cover:** current available stock divided by recent invoiced-unit velocity. Return “Not enough sales history” rather than infinity.
- **Stock with no sale in 90 days:** current available-stock value/units for products with no eligible invoice line in the last 90 days. This is not inventory age or true dead stock.
- **Source contribution:** orders/invoices directly linked to Buyer App or a campaign. Never call it incremental revenue.



## Current technical limits

The following are not trustworthy enough for recommended defaults:

- Historical gross margin or margin trend: invoice lines do not preserve cost at sale; current product cost rewrites the past.
- Historical inventory, inventory turns, stockout duration, shrinkage, or replenishment trend: there is no complete inventory-movement ledger.
- Exact fill rate or OTIF: order lines do not preserve complete fulfilled, backordered, and cancelled quantities.
- Historical Customer Group performance: membership has no effective-date history.
- Historical Pricelist adoption: transaction lines do not preserve the resolved pricelist.
- Full campaign/cart funnel or causal campaign lift: middle events and experimental attribution are incomplete.

These appear only as `LATER` alternatives so the product direction is recorded without presenting them as current truth.

---



# Operations modules



## 1. Estimates

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Period:** The document table defaults to This month. Recommended Pulse cards and Actions are current and ignore that table filter.

### Pulse options


| Option                                                       | Owner value | Time / feasibility | Why it earns space                                                                      |
| ------------------------------------------------------------ | ----------- | ------------------ | --------------------------------------------------------------------------------------- |
| ★ Estimates value created — count + value                    | Both        | `30D/90D · READY`  | Total quoted demand.                                                                    |
| ★ Open estimates — count + value                             | Both        | `NOW · READY`      | Total quoted demand still awaiting an outcome.                                          |
| ★ Sent estimates awaiting action for 3+ days — count + value | BAU         | `NOW · READY`      | A factual follow-up threshold the team can understand and act on.                       |
| ★ Expiring in 7 days — count + value                         | BAU         | `NOW · READY`      | Makes urgency visible before an offer lapses.                                           |
| Estimates converted to orders — count + value                | Growth      | `30D/90D · READY`  | Shows whether quoting produces committed demand.                                        |
| Estimate-to-order rate                                       | Growth      | `30D/90D · READY`  | Useful for sales-process review when numerator and denominator use one eligible cohort. |
| Buyer App estimate value                                     | Growth      | `30D/90D · READY`  | Shows self-service demand without mixing it with orders.                                |




### Action options


| Option                                       | Time / feasibility  | Ranked by / action                                     |
| -------------------------------------------- | ------------------- | ------------------------------------------------------ |
| ★ Sent estimates awaiting action for 3+ days | `NOW · READY`       | Oldest and highest value first; call or message.       |
| ★ Expiring without an order                  | `NOW · READY`       | Soonest expiry, then value; revise, extend, or close.  |
| ★ Ready to convert                           | `NOW · READY`       | Accepted estimates without a linked order; convert.    |
| Drafts not sent                              | `NOW · READY`       | Old drafts by value; finish or discard.                |
| Quoted items currently short on stock        | `NOW · CONDITIONAL` | Current inventory check; substitute or confirm supply. |


**Table rows:** estimate number, customer, status, estimate value, sent/created age, expiry, source, and item count. No growth or trend aggregate.

### Detail behavior

Do not add KPI cards or a Performance tab. Estimate value, dates, expiry, status, items, totals, and conversion state already belong in the document UI.

Optional contextual aids, maximum two:


| Option                              | Feasibility   | Non-duplicative value                                                                                  |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Preferred: Customer account context | `ON-OPEN`     | Last order, overdue balance, and available credit beside the decision to approve or convert.           |
| Preferred: Current stock exceptions | `CONDITIONAL` | Directional line-versus-current-stock check only; show alternative warehouse availability where known. |
| Price below configured floor        | `CONDITIONAL` | Use only when a reliable current cost/floor policy exists; label as a current estimate.                |
| Engagement timeline                 | `READY`       | Sent, viewed, accepted, and converted timestamps only when not already present in Activity.            |




## 2. Sales Orders

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Period:** The document table defaults to This month. Recommended Pulse cards and Actions are current and ignore that table filter.

### Pulse options


| Option                                     | Owner value | Time / feasibility  | Why it earns space                                                              |
| ------------------------------------------ | ----------- | ------------------- | ------------------------------------------------------------------------------- |
| ★ Total orders value — count + value       | Both        | `30D/90D · READY`   | Shows receieved demand overview.                                                |
| ★ Open orders — count + value              | Both        | `NOW · READY`       | Shows committed demand still moving through operations.                         |
| ★ Waiting for confirmation — count + value | BAU         | `NOW · READY`       | Identifies the next approval workload.                                          |
| ★ Waiting to dispatch — count + value      | BAU         | `NOW · READY`       | Identifies orders ready for operational follow-through.                         |
| ★ Order value created                      | Growth      | `30D/90D · READY`   | Measures booked demand without calling it sales.                                |
| Orders waiting beyond the status SLA       | BAU         | `NOW · CONDITIONAL` | Use only after the tenant accepts explicit thresholds for each status.          |
| Cancelled orders — count + value           | Growth      | `30D/90D · READY`   | Useful when cancellations are material and reasons are captured.                |
| Exact fill rate / OTIF                     | Growth      | `LATER`             | Requires reliable fulfilled/backordered quantities and promised-date semantics. |




### Action options


| Option                                   | Time / feasibility  | Ranked by / action                                                             |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| ★ Orders to confirm                      | `NOW · READY`       | Highest value and oldest received orders; confirm or reject.                   |
| ★ Orders to dispatch                     | `NOW · READY`       | Oldest confirmed orders; dispatch or assign.                                   |
| ★ Orders with current stock shortage     | `NOW · CONDITIONAL` | Current order lines versus inventory; substitute, source, or contact customer. |
| Orders waiting beyond SLA                | `NOW · CONDITIONAL` | Time in current status versus an agreed threshold; escalate.                   |
| Orders from customers over credit policy | `NOW · CONDITIONAL` | Outstanding plus order exposure versus configured credit; collect or approve.  |


**Table rows:** order number, customer, source, status, order value, created/order date, ~~status age~~, location, and item count. Do not claim remaining or fulfilled value.

### Detail behavior

Do not add KPI cards or a Performance tab. Order value, dates, status, line items, totals, invoice link, and delivery activity already exist in the document workflow.

Optional contextual aids, maximum two:


| Option                                         | Feasibility   | Non-duplicative value                                                                   |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| Preferred: Current stock exceptions            | `CONDITIONAL` | Directional order-line-versus-current-stock check, including stock available elsewhere. |
| Preferred: Customer credit and overdue context | `ON-OPEN`     | Wider account exposure before confirmation or dispatch.                                 |
| Time in current status                         | `READY`       | Show only if the existing status timeline does not already make it obvious.             |
| Historical order quality                       | `LATER`       | Exact fill rate and OTIF require missing line-level fulfillment facts.                  |




## 3. Invoices

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **0** · Explore **0**

**Period:** Invoiced sales uses This month; receivable cards and Actions are current.

### Pulse options


| Option                                        | Owner value | Time / feasibility      | Why it earns space                                                    |
| --------------------------------------------- | ----------- | ----------------------- | --------------------------------------------------------------------- |
| ★ Invoiced sales                              | Both        | `30D/90D · READY`       | The clearest realized-sales measure in Yukti.                         |
| ★ Outstanding amount — amount + invoice count | BAU         | `NOW · READY`           | Total cash still to collect.                                          |
| ★ Overdue amount — amount + customer count    | Both        | `NOW · READY`           | Cash exposure already past due.                                       |
| ★ Due in 7 days — amount + invoice count      | BAU         | `NOW · READY`           | Lets the owner plan collections before invoices become overdue.       |
| Overdue 30+ days                              | BAU         | `NOW · READY`           | Useful alternative for credit-heavy businesses.                       |
| Customers with overdue invoices               | BAU         | `NOW · READY`           | A workload view when customer count matters more than rupee total.    |
| Cash collected in period                      | Growth      | `30D/90D · CONDITIONAL` | Use only when payment sync and partial-payment handling are complete. |




### Action options


| Option                              | Time / feasibility  | Ranked by / action                                                          |
| ----------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| ★ Largest overdue customer balances | `NOW · READY`       | Amount × age; call, message, or place on hold.                              |
| ★ Newly overdue invoices            | `NOW · READY`       | Due date crossed recently; intervene early.                                 |
| ★ High-value invoices due soon      | `NOW · READY`       | Due date then amount; schedule reminder.                                    |
| Customers over credit policy        | `NOW · CONDITIONAL` | Outstanding plus open-order exposure versus configured credit.              |
| Payment sync exceptions             | `NOW · CONDITIONAL` | Mismatched or stale payments only when integration status is authoritative. |


**Table rows:** invoice number, customer, invoice date, due date, status, total, outstanding, and days overdue. No historical aggregate is needed.

### Detail behavior

Do not add KPI cards or a Performance tab. Invoice total, paid/outstanding amount, due state, line items, taxes, and payment history already belong in the invoice view.

One optional contextual panel:


| Option                                  | Feasibility | Non-duplicative value                                                                               |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| Preferred: Customer collections context | `ON-OPEN`   | Total overdue across the customer, recent on-time/late behavior, and other invoices needing action. |
| Source order flow                       | `READY`     | Show only when the linked order/invoice relationship is not already visible.                        |
| Historical invoice margin               | `LATER`     | Current invoice lines do not preserve cost at sale.                                                 |




## 4. Customers

**Recommended shape:** Landing Pulse **4** · Actions **2** · Detail Pulse **4** · Explore **4**

**Period:** Fixed trailing 90 days for commercial facts; credit and receivables are current. No page-global filter in V1.

### Landing Pulse options


| Option                                                        | Owner value | Time / feasibility  | Why it earns space                                                         |
| ------------------------------------------------------------- | ----------- | ------------------- | -------------------------------------------------------------------------- |
| ★ Invoiced sales                                              | Both        | `90D · READY`       | Recent value of the customer base.                                         |
| ★ Customers who purchased — count + % of active customers     | Both        | `90D · READY`       | Shows how broadly the customer base is contributing.                       |
| ★ Overdue amount — amount + affected customers                | BAU         | `NOW · READY`       | Direct collections exposure.                                               |
| Customers due to order again                                  | Growth      | `NOW · CONDITIONAL` | Identifies near-term repeat demand; requires an agreed cadence rule.       |
| ★ Customers inactive for 90 days with sales in the prior year | Growth      | `NOW · READY`       | Simple win-back pool without pretending never-ordered records are dormant. |
| Repeat customers — count + rate                               | Growth      | `90D · READY`       | Indicates whether customers are returning.                                 |
| Buyer App enabled customers                                   | Growth      | `NOW · READY`       | Useful alternative for tenants prioritising digital adoption.              |
| Total active customers                                        | BAU         | `NOW · READY`       | Contextual denominator; usually belongs in the page subtitle.              |




### Action options


| Option                                        | Time / feasibility  | Ranked by / action                                                    |
| --------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| ★ Collect overdue balances                    | `NOW · READY`       | Amount × age; contact or hold.                                        |
| Customers due to order again                  | `NOW · CONDITIONAL` | Prior value and cadence lateness; message or create estimate.         |
| ★ Win back valuable inactive customers        | `NOW · READY`       | Invoiced sales from days 91–365, then days inactive; message or call. |
| High-value customers not enabled on Buyer App | `90D + NOW · READY` | Enable and onboard; primarily belongs on Buyer App dashboard.         |
| Customers with no Pricelist/Group             | `NOW · READY`       | Complete setup only when tenant policy expects custom assignment.     |


**Table rows:** trailing-90-day invoiced sales, last order/invoice date, overdue amount, current credit usage, group/pricelist badges, and health status. Remove buyer-level growth.

### Detail Pulse options


| Option                                     | Owner value | Time / feasibility | Why it earns space                                                                 |
| ------------------------------------------ | ----------- | ------------------ | ---------------------------------------------------------------------------------- |
| ★ Invoiced sales + count of invoices       | Both        | `90D · ON-OPEN`    | Recent customer value.                                                             |
| ★ Estimates+Orders — count + average value | Both        | `90D · ON-OPEN`    | Frequency and typical order size in one card.                                      |
| ★ Overdue amount                           | BAU         | `NOW · READY`      | Immediate collections risk.                                                        |
| ★ Credit used / available                  | BAU         | `NOW · READY`      | Whether more demand can be accepted.                                               |
| Last order and days since                  | Both        | `NOW · READY`      | Prefer in title metadata if already present; otherwise use as an alternative card. |
| App-sourced order share                    | Growth      | `90D · ON-OPEN`    | Digital adoption for this customer.                                                |
| Products/categories purchased              | Growth      | `90D · ON-OPEN`    | Breadth of relationship; usually better in Explore.                                |
| Historical gross margin                    | Growth      | `LATER`            | Requires cost-at-sale provenance.                                                  |




### Explore options

Render the four recommended cards; place alternatives behind “More insights.”


| Option                           | Owner value | Time / feasibility      | Format and action                                                                |
| -------------------------------- | ----------- | ----------------------- | -------------------------------------------------------------------------------- |
| ★ Sales and order history        | Both        | `12M · ON-OPEN`         | Monthly invoiced sales with order markers; identify changes and seasonality.     |
| ★ Products ordered repeatedly    | Growth      | `90D/12M · ON-OPEN`     | Ranked products with usual quantity and last purchase; create estimate.          |
| ★ What this customer buys        | Growth      | `90D · ON-OPEN`         | Brand/category mix in plain language; find relationship concentration.           |
| ★ Payment behavior               | BAU         | `12M · ON-OPEN`         | On-time/late invoices, median days late, credit utilizaiton, and current aging.  |
| Buyer App versus assisted orders | Growth      | `90D · ON-OPEN`         | Source contribution and last app use.                                            |
| Current pricing setup            | BAU         | `NOW · READY`           | Assigned Pricelists, Groups, and fallback path.                                  |
| Products not bought recently     | Growth      | `ON-OPEN · CONDITIONAL` | Only repeated products past their normal interval; avoid speculative cross-sell. |
| Margin and price realization     | Growth      | `LATER`                 | Historical margin is not reliable without cost-at-sale.                          |




## 5. Products

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **3** · Explore **4**

**Period:** Fixed trailing 90 days for sales/velocity; stock posture is current. No page-global filter in V1.

### Landing Pulse options


| Option                                    | Owner value | Time / feasibility  | Why it earns space                                                               |
| ----------------------------------------- | ----------- | ------------------- | -------------------------------------------------------------------------------- |
| ★ Invoiced sales — value + units          | Both        | `90D · READY`       | Recent assortment demand.                                                        |
| ★ Recently sold products now out of stock | BAU         | `NOW + 90D · READY` | Counts current stockouts only among products with recent invoiced demand.        |
| ★ Products running low                    | BAU         | `NOW + 90D · READY` | Current stock below an agreed cover threshold using recent velocity.             |
| ★ Products that sold                      | Growth      | `90D · READY`       | Sold SKUs versus active SKUs, in plain language.                                 |
| Stock with no sale in 90 days             | Both        | `NOW + 90D · READY` | Working-capital signal without claiming true inventory age.                      |
| Total available units                     | BAU         | `NOW · READY`       | Useful for inventory-heavy tenants but weak as a portfolio-wide decision metric. |
| Open ordered quantity versus stock        | BAU         | `NOW · CONDITIONAL` | Directionally useful only if open-order semantics are agreed; not fill rate.     |
| Gross margin                              | Growth      | `LATER`             | Historical cost-at-sale is missing.                                              |




### Action options


| Option                                       | Time / feasibility  | Ranked by / action                                                    |
| -------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| ★ Recently sold products now out of stock    | `NOW + 90D · READY` | Recent units/value then current shortage; replenish or source.        |
| ★ Products running low                       | `NOW + 90D · READY` | Lowest cover among proven sellers; replenish.                         |
| ★ Stock with no sale in 90 days              | `NOW + 90D · READY` | Current stock value/units; discount, bundle, or stop buying.          |
| Ordered products currently short             | `NOW · CONDITIONAL` | Open ordered quantity versus current inventory; substitute or source. |
| Current selling price below configured floor | `NOW · CONDITIONAL` | Requires a trusted current cost/floor policy; reprice.                |


**Table rows:** current available stock, trailing-90-day invoiced units and sales, days cover or “Not enough history,” and stock status. Remove previous-period growth.

### Detail Pulse options


| Option                         | Owner value | Time / feasibility    | Why it earns space                                     |
| ------------------------------ | ----------- | --------------------- | ------------------------------------------------------ |
| ★ Available stock              | BAU         | `NOW · READY`         | Current ability to sell.                               |
| ★ Units sold + invoiced sales  | Both        | `90D · ON-OPEN`       | Proven demand in one card.                             |
| ★ Days of stock remaining      | BAU         | `NOW + 90D · ON-OPEN` | Plain-language replenishment signal.                   |
| Customers who purchased        | Growth      | `90D · ON-OPEN`       | Breadth of recent demand.                              |
| Last invoice date              | BAU         | `NOW · ON-OPEN`       | Useful for sparse products; otherwise supporting text. |
| Average invoiced selling price | Growth      | `90D · ON-OPEN`       | Actual price achieved, without claiming margin.        |
| Open ordered quantity          | BAU         | `NOW · CONDITIONAL`   | Use only with clear non-terminal order semantics.      |
| Gross margin                   | Growth      | `LATER`               | Requires cost-at-sale.                                 |




### Explore options


| Option                          | Owner value | Time / feasibility | Format and action                                                             |
| ------------------------------- | ----------- | ------------------ | ----------------------------------------------------------------------------- |
| ★ Sales and units over time     | Both        | `12M · ON-OPEN`    | Monthly line/columns from invoice lines; spot seasonality or decline.         |
| ★ Current stock by warehouse    | BAU         | `NOW · READY`      | Bars for available stock by warehouse; transfer or replenish.                 |
| ★ Customers buying this product | Growth      | `90D · ON-OPEN`    | Ranked buyers with last purchase and units.                                   |
| ★ Actual selling prices         | Growth      | `90D · ON-OPEN`    | Price/discount distribution from invoice lines; investigate outliers.         |
| Buyer App and campaign source   | Growth      | `90D · ON-OPEN`    | Directly linked source contribution only.                                     |
| Sales by location               | Growth      | `90D · ON-OPEN`    | Location mix when document location is populated.                             |
| Products often bought alongside | Growth      | `LATER`            | Requires a deliberately validated basket-analysis definition and cost review. |
| Inventory history / turns       | Growth      | `LATER`            | Requires a complete movement ledger.                                          |


---



# Growth modules



## 6. Buyer App

Buyer App is a channel dashboard, not an entity module. Buyer-level rows deep-link to Customer details rather than creating duplicate buyer analytics.

**Recommended shape:** Pulse **4** · Actions **3** · Explore **4** · No separate detail page

**Period:** Fixed trailing 90 days for adoption and value; app access is current.

### Pulse options


| Option                               | Owner value | Time / feasibility | Why it earns space                                                                        |
| ------------------------------------ | ----------- | ------------------ | ----------------------------------------------------------------------------------------- |
| ★ Customers with Buyer App access    | BAU         | `NOW · READY`      | Shows how much of the customer base can self-serve. Define one authoritative access flag. |
| ★ Customers who ordered in the app   | Both        | `90D · READY`      | Measures commercial adoption, not merely app opens.                                       |
| ★ App-sourced invoiced sales + share | Growth      | `90D · READY`      | Shows directly linked realized contribution without claiming incrementality.              |
| ★ Repeat app customers               | Growth      | `90D · READY`      | Customers with at least two app orders, not two app events.                               |
| App-sourced order value + share      | BAU         | `90D · READY`      | Earlier demand-stage alternative; keep separate from invoiced sales.                      |
| Customers who used the app           | Growth      | `90D · READY`      | Useful as an adoption-stage diagnostic, not the primary success metric.                   |
| App order cancellation rate          | Growth      | `90D · READY`      | Use only when cancellation status is consistently synced.                                 |
| Average orders per enabled customer  | Growth      | `90D · READY`      | Feasible but usually less actionable than ordering and repeat-customer rates.             |




### Action options


| Option                                           | Time / feasibility  | Ranked by / action                                                        |
| ------------------------------------------------ | ------------------- | ------------------------------------------------------------------------- |
| ★ Valuable assisted customers without app access | `NOW + 90D · READY` | Recent invoiced sales; enable and onboard.                                |
| ★ Access enabled but never used                  | `NOW · READY`       | Enablement age and prior value; assist first login.                       |
| ★ Used the app but never ordered                 | `NOW + 90D · READY` | Last activity and prior value; contact for help.                          |
| Previously ordered in app, now inactive          | `NOW + 90D · READY` | Previous app value and days since app order; re-engage.                   |
| App orders needing operational action            | `NOW · READY`       | Status/age; confirm or dispatch. Usually belongs on the Seller Dashboard. |




### Explore options


| Option                                | Owner value | Time / feasibility  | Format and action                                                                                                              |
| ------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ★ Adoption funnel                     | Both        | `90D · READY`       | Access → used → ordered → repeat, using unique customers and explicit definitions.                                             |
| ★ Business through the app            | Both        | `90D · READY`       | Estimates, order value, and invoiced sales as separately named stages; do not imply false conversion across unrelated periods. |
| ★ App contribution over time          | Growth      | `12M · READY`       | Monthly app-sourced order/invoice share at tenant grain.                                                                       |
| ★ Adoption by location                | Growth      | `90D · READY`       | Ordering customers and app contribution by document location.                                                                  |
| Adoption by Customer Group            | Growth      | `90D · CONDITIONAL` | Uses current group membership; label it accordingly.                                                                           |
| Assisted versus app order quality     | Growth      | `90D · CONDITIONAL` | Compare AOV/cancellation only; exact fill-rate comparison is unavailable.                                                      |
| Customers moving from assisted to app | Growth      | `90D · ON-OPEN`     | Ranked transition list; do not maintain buyer-by-day histories.                                                                |
| Cart and checkout drop-off            | Growth      | `LATER`             | Middle funnel events are incomplete.                                                                                           |




## 7. Campaigns

Use “opened,” “ordered,” and “campaign-linked” rather than “reached,” “converted,” or “influenced” unless the corresponding delivery and attribution evidence exists.

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Period:** Landing selected period for outcomes; live/expiry facts are current. Detail is campaign lifetime.

### Landing Pulse options


| Option                                    | Owner value | Time / feasibility              | Why it earns space                                                                       |
| ----------------------------------------- | ----------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| ★ Customers who opened campaigns          | Both        | `SELECTED PERIOD · READY`       | Direct engagement observed in Yukti.                                                     |
| ★ Customers who ordered campaign products | Growth      | `SELECTED PERIOD · CONDITIONAL` | Uses the documented campaign-linking rule; label it “campaign-linked.”                   |
| Campaign-linked order value               | Growth      | `SELECTED PERIOD · CONDITIONAL` | Commercial result without calling it GMV or incremental revenue.                         |
| ★ Open-to-order rate                      | Growth      | `SELECTED PERIOD · CONDITIONAL` | Useful when both stages are unique customers within the same eligible campaign set.      |
| Live campaigns                            | BAU         | `NOW · READY`                   | Workflow context; often better in the subtitle.                                          |
| ★ Campaign enquiries value and count      | BAU         | `SELECTED PERIOD · READY`       | Useful when estimates are intentionally treated as enquiries. Keep separate from orders. |
| WhatsApp delivery rate                    | BAU         | `SELECTED PERIOD · CONDITIONAL` | Available only for campaigns linked to authoritative broadcast delivery events.          |




### Action options


| Option                                       | Time / feasibility  | Ranked by / action                                                   |
| -------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| ★ Live campaigns with weak opens             | `NOW · READY`       | Time since launch and target size; fix access or resend.             |
| ★ Many openers but no estimates/orders       | `NOW · CONDITIONAL` | Engaged non-buyers; review price, product availability, and message. |
| ★ Expiring campaigns with engaged non-buyers | `NOW · CONDITIONAL` | Days left and opener count; nudge or extend.                         |
| Failed WhatsApp deliveries                   | `NOW · CONDITIONAL` | Failed recipient count; correct contact or resend.                   |
| Draft campaigns not published                | `NOW · READY`       | Age and audience size; finish or archive.                            |


**Table rows:** status/validity, target/current audience, unique openers, ordering customers, linked order value, and product count. Do not show previous-campaign growth; campaigns differ in audience and assortment.

### Detail Pulse options


| Option                                       | Owner value | Time / feasibility       | Why it earns space                                         |
| -------------------------------------------- | ----------- | ------------------------ | ---------------------------------------------------------- |
| ★ Customers who opened                       | Both        | `LIFETIME · READY`       | Direct observed engagement.                                |
| ★ Customers who ordered + open-to-order rate | Growth      | `LIFETIME · CONDITIONAL` | Commercial response in one card.                           |
| Campaign-linked order value                  | Growth      | `LIFETIME · CONDITIONAL` | Direct linked value.                                       |
| Customers delivered                          | BAU         | `LIFETIME · CONDITIONAL` | Only when authoritative WhatsApp delivery data is linked.  |
| ★ Campaign linked enquiry value              | BAU         | `LIFETIME · READY`       | Estimate-stage interest, kept separate from orders.        |
| ★ Engaged customers who did not order        | Growth      | `NOW · CONDITIONAL`      | Better as an Action/Explore queue than a headline KPI.     |
| Days remaining                               | BAU         | `NOW · READY`            | Prefer in campaign header metadata rather than a KPI card. |




### Explore options


| Option                            | Owner value | Time / feasibility       | Format and action                                                                                                         |
| --------------------------------- | ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ★ Campaign funnel                 | Both        | `LIFETIME · CONDITIONAL` | Delivered when known → opened → ordered; omit unavailable stages.                                                         |
| ★ Response over campaign lifetime | Growth      | `LIFETIME · CONDITIONAL` | Cumulative opens and campaign-linked orders/estimates; fall back to an opens-only view when order linking is unavailable. |
| ★ Products ordered                | Growth      | `LIFETIME · CONDITIONAL` | Ranked campaign-linked products, units, and order value.                                                                  |
| ★ Customers to follow up          | BAU         | `NOW · CONDITIONAL`      | Opened but did not order; direct message/action.                                                                          |
| Response by location              | Growth      | `LIFETIME · CONDITIONAL` | Use document location, not assumed customer ownership.                                                                    |
| Response by Customer Group        | Growth      | `LIFETIME · CONDITIONAL` | Uses current membership unless publish-time audience was saved.                                                           |
| Previous-campaign comparison      | Growth      | `LATER`                  | Campaign audiences, durations, and assortments are not naturally comparable.                                              |
| Cart/checkout funnel              | Growth      | `LATER`                  | Middle events are incomplete.                                                                                             |




## 8. Customer Groups

Current group membership is configuration, not historical truth. Any sales metric means “sales from customers who are members now,” and group totals must not be summed when customers overlap.

**Recommended shape:** Landing Pulse **3** · Actions **2** · Detail Pulse **4** · Explore **3**

**Period:** Current membership plus fixed trailing 90-day facts about current members. No global period filter.

### Landing Pulse options


| Option                                     | Owner value | Time / feasibility  | Why it earns space                                                                                  |
| ------------------------------------------ | ----------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| ★ Customers assigned to at least one Group | BAU         | `NOW · READY`       | Shows whether segmentation setup covers the base.                                                   |
| ★ Valuable customers in no Group           | Growth      | `NOW + 90D · READY` | Count plus recent invoiced sales 90d; identifies missed targeting.                                  |
| ★ Groups with customers who purchased      | Growth      | `90D · READY`       | Shows whether the segmented base is commercially active (atleast 80% customers purchased last 90d). |
| Groups with an active Pricelist            | BAU         | `NOW · READY`       | Configuration readiness.                                                                            |
| Groups with a live campaign                | Growth      | `NOW · READY`       | Current activation coverage.                                                                        |
| Rule-based Groups needing refresh          | BAU         | `NOW · CONDITIONAL` | Requires an agreed refresh/failure SLA.                                                             |
| Total Groups                               | BAU         | `NOW · READY`       | Useful context, usually in the subtitle rather than a KPI.                                          |
| Combined Group sales                       | Growth      | `LATER`             | Overlapping memberships make a summed headline misleading without a declared allocation rule.       |




### Action options


| Option                                                   | Time / feasibility  | Ranked by / action                                              |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| ★ High-value customers in no Group                       | `NOW + 90D · READY` | Recent invoiced sales; assign or create a Group.                |
| ★ Groups with neither active pricing nor a live campaign | `NOW · READY`       | Member count/value; price or activate.                          |
| Rule-based Groups needing refresh                        | `NOW · CONDITIONAL` | Staleness/failure; refresh or fix rules.                        |
| Empty Groups                                             | `NOW · READY`       | Age and last update; add members or archive.                    |
| Assignment/price conflicts                               | `NOW · READY`       | Keep on Pricelists, where resolution priority can be explained. |


**Table rows:** total members, purchasing members in 90 days, 90-day invoiced sales from current members, and active Pricelist/Campaign badges. Rows are independently useful but not additive.

### Detail Pulse options


| Option                                | Owner value | Time / feasibility | Why it earns space                                      |
| ------------------------------------- | ----------- | ------------------ | ------------------------------------------------------- |
| ★ Members                             | BAU         | `NOW · READY`      | Current addressable audience.                           |
| ★ Members who purchased               | Growth      | `90D · ON-OPEN`    | Commercial activity among current members.              |
| ★ Invoiced sales from current members | Growth      | `90D · ON-OPEN`    | Current-group value with explicit composition caveat.   |
| ★ Members with overdue balances       | BAU         | `NOW · ON-OPEN`    | Risk within the current group.                          |
| Members with Buyer App access         | Growth      | `NOW · READY`      | Digital readiness.                                      |
| Active Pricelists / campaigns         | BAU         | `NOW · READY`      | Better as header metadata when already visible in tabs. |
| Historical group growth               | Growth      | `LATER`            | Membership effective dates are absent.                  |




### Explore options


| Option                            | Owner value | Time / feasibility    | Format and action                                                         |
| --------------------------------- | ----------- | --------------------- | ------------------------------------------------------------------------- |
| ★ Member activity                 | Both        | `90D · ON-OPEN`       | Bought in 0–30, 31–90, 90+ days, or never; choose activation action.      |
| ★ Products and brands members buy | Growth      | `90D · ON-OPEN`       | Ranked mix for campaign/pricing decisions.                                |
| ★ Member opportunity list         | Both        | `NOW + 90D · ON-OPEN` | Valuable inactive, overdue, unpriced, or not-on-app customers.            |
| Pricing and campaign setup        | BAU         | `NOW · READY`         | Assignment coverage and missing commercial setup.                         |
| Buyer App adoption                | Growth      | `90D · ON-OPEN`       | Access, ordering, and app contribution among current members.             |
| Monthly sales trend               | Growth      | `LATER`               | Without membership history, the past is recomputed using today's members. |
| Historical margin                 | Growth      | `LATER`               | Cost-at-sale is absent.                                                   |




## 9. Pricelists

Pricelists are a configuration and diagnostics surface, not a time-series performance module.

**Recommended shape:** Landing Pulse **4** · Actions **2** · Detail Pulse **4** · Explore **3**

**Period:** Current posture; no period selector.

### Landing Pulse options


| Option                                  | Owner value | Time / feasibility  | Why it earns space                                                                    |
| --------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------- |
| ★ Customers with active custom pricing  | Both        | `NOW · READY`       | Deduplicated direct, Group, and all-customer assignments.                             |
| ★ Products with custom prices           | BAU         | `NOW · READY`       | Current SKU scope across active lists.                                                |
| ★ Items priced below current cost/floor | Both        | `NOW · CONDITIONAL` | Immediate pricing check; label cost basis as current, not historical margin.          |
| Active Pricelists                       | BAU         | `NOW · READY`       | Workflow context, usually suitable for the subtitle.                                  |
| ★ Pricelists expiring in 30 days        | BAU         | `NOW · READY`       | Useful when validity windows are common.                                              |
| Customer Groups with active pricing     | BAU         | `NOW · READY`       | Setup coverage for tenants using group pricing.                                       |
| Customers on base price                 | Growth      | `NOW · CONDITIONAL` | Useful only when tenant policy expects custom pricing; base price may be intentional. |




### Action options


| Option                                                      | Time / feasibility  | Ranked by / action                                                 |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| ★ Expiring Pricelists                                       | `NOW · READY`       | Days left and affected customers; renew, replace, or allow expiry. |
| ★ Items below current cost/floor                            | `NOW · CONDITIONAL` | Current exposure; correct price.                                   |
| Customers expected to have custom pricing but on base price | `NOW · CONDITIONAL` | Requires an explicit tenant policy; assign pricing.                |
| Higher-priority overrides changing intended price           | `NOW · ON-OPEN`     | Diagnostic, not an alert until conflict semantics are agreed.      |
| Most-covered Pricelists                                     | `READY`             | A leaderboard, not an action; keep out of Actions.                 |


**Table rows:** unique customers reached, product count, below-cost/floor exception count, average discount, validity, priority, and status. Avoid unweighted average margin.

### Detail Pulse options


| Option                           | Owner value | Time / feasibility  | Why it earns space                                               |
| -------------------------------- | ----------- | ------------------- | ---------------------------------------------------------------- |
| ★ Customers reached              | Both        | `NOW · READY`       | Deduplicated current assignment reach.                           |
| ★ Products priced                | BAU         | `NOW · READY`       | Current assortment scope.                                        |
| ★ Typical discount               | Both        | `NOW · READY`       | Median or clearly defined average; describes pricing posture.    |
| ★ Items below current cost/floor | Both        | `NOW · CONDITIONAL` | Admin alternative when exceptions exist.                         |
| Customer Groups assigned         | BAU         | `NOW · READY`       | Prefer in subtitle/tab when assignments are already visible.     |
| Days to expiry                   | BAU         | `NOW · READY`       | Prefer header status metadata, not a KPI.                        |
| Sales using this Pricelist       | Growth      | `LATER`             | Transaction lines do not preserve resolved Pricelist provenance. |




### Explore options — Coverage & checks


| Option                               | Owner value | Time / feasibility  | Format and action                                                          |
| ------------------------------------ | ----------- | ------------------- | -------------------------------------------------------------------------- |
| ★ Assignment reach                   | BAU         | `NOW · READY`       | Direct customers, Groups, all-customer assignment, and deduplicated reach. |
| ★ Product scope and gaps             | BAU         | `NOW · READY`       | Products explicitly priced, on base price, excluded, or unavailable.       |
| ★ Discount bands and price checks    | Both        | `NOW · CONDITIONAL` | Distribution plus below-current-cost/floor exceptions.                     |
| Higher-priority override diagnostics | BAU         | `NOW · ON-OPEN`     | Explain which configured rule wins and why.                                |
| Activity log                         | BAU         | `NOW · READY`       | Recent assignment and price changes when audit data is complete.           |
| Historical adoption/value            | Growth      | `LATER`             | Requires transaction-level resolved Pricelist provenance.                  |
| Margin impact trend                  | Growth      | `LATER`             | Requires both Pricelist provenance and cost-at-sale.                       |




## 10. Brands

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Period:** Fixed trailing 90 days for sales; stock posture is current. Brand comparisons live in Explore, not table-row growth pills.

### Landing Pulse options


| Option                                         | Owner value | Time / feasibility  | Why it earns space                                                      |
| ---------------------------------------------- | ----------- | ------------------- | ----------------------------------------------------------------------- |
| ★ Invoiced sales from branded products         | Both        | `90D · READY`       | Commercial scale of the managed brand portfolio.                        |
| ★ Brands with invoiced sales                   | BAU         | `90D · READY`       | Shows how much of the carried portfolio is actually moving.             |
| ★ Selling brand products low/out of stock      | Both        | `NOW + 90D · READY` | Availability risk tied to observed sales rather than every carried SKU. |
| Customers who purchased branded products       | Growth      | `90D · READY`       | Breadth of current demand; often supporting context.                    |
| Top brand share of sales                       | Growth      | `90D · READY`       | Concentration signal for principal dependence.                          |
| ★ Stock in brands with no sale in 90 days      | Both        | `NOW + 90D · READY` | Working-capital signal without claiming inventory age.                  |
| Brands with sales falling versus prior 90 days | Growth      | `90D · READY`       | Low-cardinality comparison; useful only with a meaningful prior base.   |
| Gross margin by brand                          | Growth      | `LATER`             | Historical cost-at-sale is absent.                                      |




### Action options


| Option                                   | Time / feasibility  | Ranked by / action                                                                 |
| ---------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| ★ Selling brands with stock risk         | `NOW + 90D · READY` | Recent invoiced sales attached to low/out-of-stock products; replenish or source.  |
| ★ Brand stock with no sale in 90 days    | `NOW + 90D · READY` | Current stock value/units; campaign, bundle, or reduce purchases.                  |
| ★ Brands losing meaningful sales         | `90D · READY`       | Absolute decline first, then percentage; investigate stock, customers, or pricing. |
| Brand products below current price floor | `NOW · CONDITIONAL` | Current exceptions; reprice or renegotiate.                                        |
| Brands with no recent campaign           | `NOW · READY`       | Useful only when tenant strategy expects campaign coverage.                        |


**Table rows:** trailing-90-day invoiced sales, customers who purchased, products that sold, and recent sellers low/out of stock. Growth is an optional sort/filter, not a default column.

### Detail Pulse options


| Option                            | Owner value | Time / feasibility    | Why it earns space                              |
| --------------------------------- | ----------- | --------------------- | ----------------------------------------------- |
| ★ Invoiced sales                  | Both        | `90D · ON-OPEN`       | Recent commercial scale.                        |
| ★ Customers who purchased         | Growth      | `90D · ON-OPEN`       | Distribution breadth in familiar language.      |
| ★ Recent sellers low/out of stock | BAU         | `NOW + 90D · ON-OPEN` | Immediate availability risk.                    |
| Units sold                        | BAU         | `90D · ON-OPEN`       | Volume alternative for unit-led categories.     |
| ★ Products that sold              | Growth      | `90D · ON-OPEN`       | Product productivity without an abstract ratio. |
| Top product share of brand sales  | Growth      | `90D · ON-OPEN`       | Concentration within the brand.                 |
| App-sourced sales share           | Growth      | `90D · ON-OPEN`       | Digital contribution alternative.               |
| Gross margin                      | Growth      | `LATER`               | Cost-at-sale is missing.                        |




### Explore options


| Option                                | Owner value | Time / feasibility  | Format and action                                                                    |
| ------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------ |
| ★ Sales over time                     | Both        | `12M · ON-OPEN`     | Monthly invoiced sales/units grouped from raw invoice lines.                         |
| ★ Product contribution                | Growth      | `90D · ON-OPEN`     | Pareto list of leading, declining, and stock-risk SKUs; paginate beyond the top set. |
| ★ Customers buying the brand          | Growth      | `90D · ON-OPEN`     | Ranked customers with last purchase and value.                                       |
| Current inventory by warehouse        | BAU         | `NOW · READY`       | Availability of brand products by warehouse.                                         |
| ★ Campaign and Buyer App contribution | Growth      | `90D · CONDITIONAL` | Directly linked source contribution only.                                            |
| Sales by location                     | Growth      | `90D · ON-OPEN`     | Location mix where invoice location is populated.                                    |
| Historical price/margin realization   | Growth      | `LATER`             | Cost-at-sale is absent; price-only distribution may be added separately.             |




## 11. Locations

Location metrics use the explicit location on estimates, orders, and invoices. They describe business serviced at a location; they do not imply permanent customer ownership.

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Period:** Fixed trailing 90 days for sales; order/receivable/stock posture is current.

### Landing Pulse options


| Option                                           | Owner value | Time / feasibility        | Why it earns space                                               |
| ------------------------------------------------ | ----------- | ------------------------- | ---------------------------------------------------------------- |
| ★ Invoiced sales across locations                | Both        | `90D · READY`             | Tenant headline; rows show the same measure by invoice location. |
| Open order value                                 | BAU         | `NOW · READY`             | Current demand being handled across locations.                   |
| ★ Overdue amount                                 | BAU         | `NOW · READY`             | Collections exposure by invoice location.                        |
| Customers who purchased                          | Growth      | `90D · READY`             | Unique customers with an invoice at any location.                |
| ★ Open estimate value                            | Growth      | `NOW · READY`             | Pipeline alternative for sales-led teams.                        |
| ★ Locations with recent sellers low/out of stock | BAU         | `NOW + 90D · CONDITIONAL` | Requires a clear location-to-warehouse relationship.             |
| Top location share of sales                      | Growth      | `90D · READY`             | Concentration signal, usually better in Explore.                 |
| Gross margin / fill rate                         | Growth      | `LATER`                   | Cost-at-sale and complete fulfillment facts are missing.         |




### Action options


| Option                                                | Time / feasibility        | Ranked by / action                                                                |
| ----------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| ★ Locations with overdue balances                     | `NOW · READY`             | Amount × age; assign collections action.                                          |
| Locations with orders waiting beyond SLA              | `NOW · CONDITIONAL`       | Current status age and order value versus agreed thresholds; confirm or dispatch. |
| ★ Recently sold items unavailable at linked warehouse | `NOW + 90D · CONDITIONAL` | Recent sales plus current stock; replenish or source.                             |
| ★ Locations with expiring estimates                   | `NOW · READY`             | Value and days left; follow up.                                                   |
| Locations with sales falling materially               | `90D · READY`             | Absolute decline; investigate mix, availability, and execution.                   |


**Table rows:** trailing-90-day invoiced sales, open order value, overdue amount, ~~customers who purchased,~~ and current linked-stock status. One optional comparison may be exposed through sorting, not a growth column.

### Detail Pulse options


| Option                          | Owner value | Time / feasibility        | Why it earns space                                                    |
| ------------------------------- | ----------- | ------------------------- | --------------------------------------------------------------------- |
| ★ Invoiced sales                | Both        | `90D · ON-OPEN`           | Recent commercial scale.                                              |
| Open order value                | BAU         | `NOW · READY`             | Current operational workload.                                         |
| ★ Overdue amount                | BAU         | `NOW · READY`             | Cash exposure at this serviced location.                              |
| ★ Customers who purchased here  | Growth      | `90D · ON-OPEN`           | Local market activity without claiming ownership.                     |
| ★ Open estimate value           | Growth      | `NOW · READY`             | Current opportunity pipeline.                                         |
| Recent sellers low/out of stock | BAU         | `NOW + 90D · CONDITIONAL` | Current availability risk at linked warehouses.                       |
| Orders waiting beyond SLA       | BAU         | `NOW · CONDITIONAL`       | Operational exception alternative after status thresholds are agreed. |
| Gross margin / fill rate        | Growth      | `LATER`                   | Required historical cost/fulfillment facts are missing.               |




### Explore options


| Option                              | Owner value | Time / feasibility  | Format and action                                                  |
| ----------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------ |
| ★ Sales over time                   | Both        | `12M · ON-OPEN`     | Weekly/monthly invoiced sales.                                     |
| Order execution workload            | BAU         | `NOW · READY`       | Status distribution and aging; not an unsupported fill-rate claim. |
| ★ Brand and category mix            | Growth      | `90D · ON-OPEN`     | Sales contribution and concentration.                              |
| ★ Inventory at linked warehouses    | BAU         | `NOW · CONDITIONAL` | Current stock posture and selling-item shortages.                  |
| Buyer App and campaign contribution | Growth      | `90D · CONDITIONAL` | Directly linked source contribution.                               |
| ★ Customers buying here             | Growth      | `90D · ON-OPEN`     | Ranked customer activity, not permanent customer ownership.        |
| Customer health by owned territory  | Growth      | `LATER`             | There is no direct customer-to-location ownership model.           |




## 12. Warehouses

Warehouse analytics is current-state inventory intelligence. Do not present historical stock, stock age, inventory turns, transfers, or replenishment trends until a complete movement ledger exists.

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **4**

**Period:** Current posture with a fixed trailing-90-day invoiced-sales context. No period selector.

### Landing Pulse options


| Option                                    | Owner value | Time / feasibility  | Why it earns space                                                     |
| ----------------------------------------- | ----------- | ------------------- | ---------------------------------------------------------------------- |
| ★ Sellable units + products in stock      | BAU         | `NOW · READY`       | Current serviceable inventory posture.                                 |
| ★ Recently sold products now out of stock | BAU         | `NOW + 90D · READY` | Current stockouts tied to observed demand.                             |
| ★ Recently sold products running low      | BAU         | `NOW + 90D · READY` | Current low-cover workload.                                            |
| ★ Stock with no sale in 90 days           | Both        | `NOW + 90D · READY` | Working-capital signal without claiming age.                           |
| Inventory value at current cost           | BAU         | `NOW · CONDITIONAL` | Label as an estimate; current cost may not equal accounting valuation. |
| Products tracked                          | BAU         | `NOW · READY`       | Configuration context, usually in the subtitle.                        |
| Products out of stock regardless of sales | BAU         | `NOW · READY`       | Useful alternative for service-level-focused tenants.                  |
| Historical stock turns                    | Growth      | `LATER`             | Requires a complete movement ledger.                                   |




### Action options


| Option                                    | Time / feasibility  | Ranked by / action                                                                              |
| ----------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| ★ Recently sold products now out of stock | `NOW + 90D · READY` | Recent sales/units then shortage; replenish or source.                                          |
| ★ Stock with no sale in 90 days           | `NOW + 90D · READY` | Current units/value; promote, transfer, or stop buying.                                         |
| ★ Stock available in another warehouse    | `NOW · READY`       | Same SKU has stock elsewhere; review a transfer suggestion.                                     |
| Negative or inconsistent availability     | `NOW · READY`       | Negative stock or committed greater than available; investigate sync/data.                      |
| Recently replenished products             | `LATER`             | Inbound events are not a complete inventory history and should not drive a general action feed. |


**Table rows:** linked location, available stock, products in stock, recent sellers OOS/low, stock with no sale in 90 days, ~~and sync freshness~~. Avoid pseudo-historical fields.

### Detail Pulse options


| Option                                    | Owner value | Time / feasibility    | Why it earns space                                 |
| ----------------------------------------- | ----------- | --------------------- | -------------------------------------------------- |
| ★ Sellable units + products in stock      | BAU         | `NOW · READY`         | Current inventory scale.                           |
| ★ Recently sold products now out of stock | BAU         | `NOW + 90D · ON-OPEN` | Demand-backed shortage.                            |
| ★ Recently sold products running low      | BAU         | `NOW + 90D · ON-OPEN` | Replenishment workload.                            |
| ★ Stock with no sale in 90 days           | Both        | `NOW + 90D · ON-OPEN` | Current working-capital signal.                    |
| Inventory value at current cost           | BAU         | `NOW · CONDITIONAL`   | Accounting approximation only.                     |
| Products tracked                          | BAU         | `NOW · READY`         | Better as subtitle context.                        |
| Open ordered quantity                     | BAU         | `NOW · CONDITIONAL`   | Directional demand, not fulfilled/remaining truth. |
| Inventory turns                           | Growth      | `LATER`               | Movement history is missing.                       |




### Explore options


| Option                           | Owner value | Time / feasibility    | Format and action                                                                              |
| -------------------------------- | ----------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| ★ Current inventory posture      | BAU         | `NOW · READY`         | In stock, low, out, and no-sales-90-day products.                                              |
| ★ Stock-risk product list        | BAU         | `NOW + 90D · ON-OPEN` | Current stock, recent units sold, cover, and action.                                           |
| ★ Availability by brand/category | Both        | `NOW · ON-OPEN`       | Current concentration and shortage view.                                                       |
| ★ Stock with no sale in 90 days  | Both        | `NOW + 90D · ON-OPEN` | Current idle stock view.                                                                       |
| Transfer suggestions             | BAU         | `NOW · READY`         | Current excess elsewhere versus shortage here; suggestion only until transfer workflow exists. |
| Stock value by brand/category    | BAU         | `NOW · CONDITIONAL`   | Current-cost estimate.                                                                         |
| Inventory movement/activity      | BAU         | `LATER`               | Audit/inbound data is not a complete ledger.                                                   |
| Historical stock trend / age     | Growth      | `LATER`               | Not reconstructable reliably.                                                                  |




## 13. Categories

**Recommended shape:** Landing Pulse **4** · Actions **3** · Detail Pulse **4** · Explore **3**

**Period:** Fixed trailing 90 days for sales; stock and categorisation posture is current.

### Landing Pulse options


| Option                                   | Owner value | Time / feasibility  | Why it earns space                                                   |
| ---------------------------------------- | ----------- | ------------------- | -------------------------------------------------------------------- |
| ★ Invoiced sales by categorised products | Both        | `90D · READY`       | Commercial scale of the category portfolio.                          |
| Products that sold                       | Growth      | `90D · READY`       | Shows how much of the assortment moved.                              |
| Recent sellers low/out of stock          | BAU         | `NOW + 90D · READY` | Availability risk tied to recent demand.                             |
| ★ Categories with invoiced sales         | BAU         | `90D · READY`       | Moving versus inactive category context.                             |
| Customers who purchased                  | Growth      | `90D · READY`       | Unique buyers across categories; category detail is more actionable. |
| ★ Categories with no sale in 90 days     | Both        | `NOW + 90D · READY` | Current working-capital signal.                                      |
| ★ Uncategorised active products          | BAU         | `NOW · READY`       | Search/reporting data-quality issue.                                 |
| Gross margin by category                 | Growth      | `LATER`             | Cost-at-sale is missing.                                             |




### Action options


| Option                                        | Time / feasibility  | Ranked by / action                                            |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| ★ Categories with recent sellers out of stock | `NOW + 90D · READY` | Recent sales then shortage; replenish or source.              |
| ★ Categories with no sale in 90 days          | `NOW + 90D · READY` | Current units/value by category; promote or reduce purchases. |
| ★ Uncategorised active products               | `NOW · READY`       | Product count and recent sales; assign a category.            |
| Categories with sales falling materially      | `90D · READY`       | Absolute decline; investigate products, buyers, or stock.     |
| Category products below current price floor   | `NOW · CONDITIONAL` | Current exceptions; reprice.                                  |


**Table rows:** trailing-90-day invoiced sales, products that sold, ~~customers who purchased~~, and recent sellers low/OOS. No default growth or brands columns.

### Detail Pulse options


| Option                            | Owner value | Time / feasibility    | Why it earns space                          |
| --------------------------------- | ----------- | --------------------- | ------------------------------------------- |
| ★ Invoiced sales                  | Both        | `90D · ON-OPEN`       | Recent category scale.                      |
| ★ Units sold + products that sold | Both        | `90D · ON-OPEN`       | Volume and assortment movement in one card. |
| ★ Recent sellers low/out of stock | BAU         | `NOW + 90D · ON-OPEN` | Availability risk.                          |
| Customers who purchased           | Growth      | `90D · ON-OPEN`       | Distribution breadth in plain language.     |
| ★ Stock with no sale in 90 days   | Both        | `NOW + 90D · ON-OPEN` | Current working-capital signal.             |
| Top brand share                   | Growth      | `90D · ON-OPEN`       | Concentration within the category.          |
| App-sourced sales share           | Growth      | `90D · ON-OPEN`       | Digital contribution alternative.           |
| Gross margin                      | Growth      | `LATER`               | Cost-at-sale is missing.                    |




### Explore options


| Option                              | Owner value | Time / feasibility    | Format and action                                             |
| ----------------------------------- | ----------- | --------------------- | ------------------------------------------------------------- |
| ★ Sales over time                   | Both        | `12M · ON-OPEN`       | Monthly invoiced sales/units.                                 |
| ★ Brand contribution                | Growth      | `90D · ON-OPEN`       | Ranked brands and concentration.                              |
| ★ Product action list               | Both        | `NOW + 90D · ON-OPEN` | Best sellers, stock risks, and stocked products with no sale. |
| Customers buying the category       | Growth      | `90D · ON-OPEN`       | Ranked customers and last purchase.                           |
| Sales by location                   | Growth      | `90D · ON-OPEN`       | Location mix when invoice location is populated.              |
| Campaign and Buyer App contribution | Growth      | `90D · CONDITIONAL`   | Direct linked contribution only.                              |
| Historical margin trend             | Growth      | `LATER`               | Cost-at-sale is missing.                                      |


---



# Dashboard portfolios



## Seller Dashboard — business control tower

The Seller Dashboard is the only cross-module command centre. It shows overall business posture and routes owners to the module where action happens. It should contain one Buyer App teaser, not repeat the Buyer App dashboard.

**Recommended shape:** Pulse **4** · Actions **3** · Explore **3**

**Period:** This month for sales/flow; current-state cards and Actions are labelled “As of today.”

### Pulse options


| Option                                     | Owner value | Time / feasibility   | Why it earns space                                 |
| ------------------------------------------ | ----------- | -------------------- | -------------------------------------------------- |
| ★ Invoiced sales                           | Both        | `THIS MONTH · READY` | Canonical realized-sales headline.                 |
| Open order value                           | BAU         | `NOW · READY`        | Current committed demand.                          |
| ★ Overdue receivables                      | Both        | `NOW · READY`        | Cash exposure requiring action.                    |
| ★ Recently sold products now out of stock  | BAU         | `NOW + 90D · READY`  | Current availability risk tied to observed demand. |
| Customers who purchased                    | Growth      | `90D · READY`        | Breadth of active demand.                          |
| ★ Open estimate value                      | Growth      | `NOW · READY`        | Sales pipeline alternative.                        |
| Amount due in 7 days                       | BAU         | `NOW · READY`        | Collections planning alternative.                  |
| Stock with no sale in 90 days              | Both        | `NOW + 90D · READY`  | Working-capital alternative.                       |
| Buyer App ordering customers + sales share | Growth      | `90D · READY`        | One teaser linking to the channel dashboard.       |
| Gross margin                               | Growth      | `LATER`              | Cost-at-sale is missing.                           |




### Action options


| Option                 | Time / feasibility        | Ranked by / action                                                  |
| ---------------------- | ------------------------- | ------------------------------------------------------------------- |
| ★ Revenue follow-up    | `NOW · READY`             | Expiring/high-value estimates and accepted estimates not converted. |
| Order execution        | `NOW · READY`             | Orders to confirm or dispatch, ranked by age and value.             |
| ★ Collections          | `NOW · READY`             | Overdue customers ranked by amount and age.                         |
| Product availability   | `NOW + 90D · READY`       | Recent sellers low/out of stock.                                    |
| Customer reactivation  | `NOW + 90D · CONDITIONAL` | Due-to-reorder and valuable inactive customers.                     |
| ★ Buyer App activation | `NOW + 90D · READY`       | Valuable customers not enabled or enabled but unused.               |




### Explore options

Show three recommended cards. Put the rest behind “More insights.” Show these cards below the Action cards in the dashboard itself.


| Option              | Owner value | Time / feasibility   | Format and action                                                                                                      |
| ------------------- | ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ★ Business flow     | Both        | `THIS MONTH · READY` | Estimate value → order value → invoiced sales, shown as separately named stages rather than a false conversion funnel. |
| ★ Sales mix         | Growth      | `90D · READY`        | One card with Brand / Category / Location tabs; avoids three competing charts.                                         |
| ★ Customer activity | Growth      | `90D · READY`        | Purchasing, repeat, inactive, and overdue customers in plain language.                                                 |
| Inventory actions   | BAU         | `NOW + 90D · READY`  | Recent sellers short and stock with no sale.                                                                           |
| Buyer App teaser    | Growth      | `90D · READY`        | Ordering customers and app-sourced invoiced-sales share; link deeper.                                                  |
| Significant changes | Both        | `NOW · CONDITIONAL`  | Only material cancellations, newly overdue invoices, or integration/data warnings; not generic activity.               |
| Location comparison | Growth      | `90D · READY`        | Invoiced sales, open orders, and overdue by location.                                                                  |
| Margin leakage      | Growth      | `LATER`              | Cost-at-sale is missing.                                                                                               |




## Buyer App Dashboard — channel adoption workspace

Use the complete option portfolio in [Buyer App](#6-buyer-app). Its default composition is:

- **Pulse 4:** Customers with access; customers ordering; app-sourced invoiced sales/share; repeat app customers.
- **Actions 3:** Valuable assisted customers without access; enabled but unused; used but never ordered.
- **Explore 5:** Adoption funnel; business through app; contribution over time; adoption by location; top buyers with app usage.

Do not repeat seller-wide receivables, inventory, margin, or general order-execution cards here.

---



# Recommended density summary


| Surface          | Landing Pulse | Actions | Detail Pulse | Explore |
| ---------------- | ------------- | ------- | ------------ | ------- |
| Estimates        | 3             | 3       | 0            | 0       |
| Sales Orders     | 3             | 3       | 0            | 0       |
| Invoices         | 4             | 3       | 0            | 0       |
| Customers        | 4             | 3       | 4            | 4       |
| Products         | 3             | 3       | 3            | 4       |
| Buyer App        | 4             | 3       | —            | 4       |
| Campaigns        | 3             | 3       | 3            | 4       |
| Customer Groups  | 3             | 2       | 3            | 3       |
| Pricelists       | 3             | 2       | 3            | 3       |
| Brands           | 3             | 3       | 3            | 3       |
| Locations        | 3             | 3       | 3            | 3       |
| Warehouses       | 3             | 3       | 3            | 3       |
| Categories       | 3             | 3       | 3            | 3       |
| Seller Dashboard | 4             | 3       | —            | 3       |


These are curated defaults, not structural requirements. Render fewer when no other option passes the usefulness, comprehension, and truth tests.

---



# Current implementation implications



## Keep and correct

- Preserve the existing visual hierarchy: title → Pulse → Actions → table → opt-in Explore.
- Keep receivables, overdue, open document posture, current stock, Buyer App access, campaign opens, and direct source contribution.
- Standardize value language: Estimate Value, Order Value, Invoiced Sales, Campaign-linked Order Value, App-sourced Invoiced Sales.
- Make Actions ignore the selected document-created period so older unresolved records never disappear.



## Remove or demote

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