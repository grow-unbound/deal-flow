# WineYard Technologies — Business Insights & Go-Live Report

**Data window:** 2026-04-01 to 2026-07-24 (115 days) | **Source:** DealFlow `metrics_v2` production tables, tenant `wine-yard-technologies`
**Prepared for:** Go-live meeting, 2026-07-24

---

## Headline

WineYard invoiced **₹9.42 Cr over 90 days** across **2,811 active buyers** and **8 locations**. The DealFlow app currently touches **~2.8% of that revenue** — and the constraint is access, not catalog: buyers with app access can already browse and order the full active catalog (340 SKUs). Only **171 of 10,909 buyers (1.6%)** have app access at all, and of those, only **1–2 showed any activity in 90 days**. That's the pitch: the channel works, it just hasn't been rolled out to the buyers who drive the business.

---

## 1. Raw Insights

### Buyers
- 10,909 total buyers on record; only **2,811 (25.8%) purchased in the last 90 days**.
- **6,952 buyers (63.7%) have zero activity, ever** — never invoiced, never estimated.
- Revenue concentration is a steep 80/20: **top 10% of active buyers (281) drive 69.7%** of revenue; top 20% (562) drive 84.6%; it takes only **446 buyers (16% of active base)** to reach 80% of revenue.
- Only 9 buyers sit on an active price list and 10 in an active cohort — despite 2,811 being commercially active. Segmentation tooling exists but is essentially unused.
- 60 buyers are overdue on receivables; the **top 10 overdue accounts account for 76% (₹24.4L) of all overdue value (₹31.99L)** — this is a short, ownable list, not a sprawling collections problem.

### Buyer app adoption
- 171 of 10,909 buyers (1.6%) have app access; of those, only **1–2 showed any app activity in 90 days**.
- `health_reason = no_app_access` is tagged on 10,689 of 10,909 buyers (98%) — the single largest lever in the dataset.
- App-attributed revenue: ₹26.6L invoiced + ₹64.6L estimated over 90 days (~2.8% of total invoiced revenue).
- App activity was **zero before late April**, then grew organically through May–June, dipped in July — this is a real, working channel, just starved of catalog and users.

### Catalog / product
- Active SKUs: 340, all browsable and orderable by buyers with app access — the full catalog is live in-app, not a subset.
- Separately, **9 SKUs (all refurb hard disks) are attached to an active promotional campaign** — this is a test campaign overlaying discounted pricing on select products, not a gate on catalog visibility. Worth confirming with WineYard whether they want to expand campaign coverage to the CCTV camera lines (the actual revenue driver) once they've validated the test.
- 113 of 451 total products (25%) never sold in the 90-day window — dead stock, ~₹15.1L of cost tied up in on-hand inventory that hasn't moved.
- 99 of 340 active SKUs are currently out of stock; 26 of those had recent invoice demand hit a stockout — real, evidenced lost sales, not speculative.
- Thin-cover risk: 14 in-stock SKUs have **under 7 days of cover** — including the 4MP Bullet camera bestseller (`CP-UNC-TA41L3C-LQ`, 14.6 days) and `RFB-8TB` (5.2 days).
- Overstock: 96 SKUs carry more than 180 days of cover; one bestseller variant (`CP-UNC-TA21L3C-LQ`) sits at 273 days — capital parked, not moving.
- Revenue concentration mirrors the buyer curve: **55 SKUs (16% of selling SKUs) drive 80% of product revenue.**

### Locations
- 8 locations; top 3 (Chandanagar, Boduppal, Kharmanghat) generate ~60% of revenue.
- Conversion rate (estimate → invoice) ranges from **43.8% (Boduppal, best) to 5.9% (Gaganmahal New, worst)**.
- **Himayatnagar is the standout anomaly**: ₹18.77 Cr sitting in open estimates against only ₹1.75 Cr actually invoiced — an **11.5% conversion rate**, roughly a third of the tenant average. This is either a sales-execution gap or stale/uncleaned estimate data — either way it's the single largest unconverted-value pocket in the business.
- Gaganmahal New did only 12 invoices in 115 days and has the worst stock coverage of any location (292 of 442 product-slots out of stock) — looks like a dormant or winding-down branch, not a going-concern location.

### Revenue trend
- Monthly invoice value: **Apr ₹2.72 Cr → May ₹2.55 Cr → Jun ₹3.97 Cr (peak) → Jul ₹2.47 Cr (24 days, run-rate ≈ ₹3.19 Cr)**. June was a clear outlier month; July is trending back toward April/May levels, not sustaining the June peak.
- Sunday is a structurally different day: invoice count averages **77/day vs ~155–168/day on weekdays/Saturday**, and Saturday is the single busiest day (167.9 avg invoices) — worth knowing for staffing and campaign timing.
- Orders-as-a-workflow are essentially unused: **0 orders this month, only 5 open orders total** across the whole tenant, against 3,889 open estimates. The business runs on estimate → invoice, bypassing the app's Order object almost entirely — important to name explicitly at go-live so expectations on "order tracking" match reality.

---

## 2. Surprises (things that don't match the obvious story)

1. **Margin data is unreliable for ~140 SKUs.** Roughly 40% of actively-selling SKUs (including big-ticket hard disks: `RFB-2TB`, `RFB-4TB`, `RFB-12TB`, `RFB-10TB`) carry a **cost_price of ₹11.56 or ₹0** — clearly a placeholder/default value from the Zoho sync, not a real cost. This makes the "99% margin" reading on those lines meaningless. **Flag this before quoting any margin numbers to WineYard** — it's a data hygiene issue on their Zoho item master, not a DealFlow bug, but it will undermine trust if surfaced as fact.
2. **6 SKUs are being sold below cost** (negative margin), totalling ₹22.5L of 90-day revenue — led by the 2.4MP Dual-Light Bullet Camera (-3.7% margin, ₹11.97L revenue, 149 buyers). Worth a direct question: intentional loss-leader, or a stale cost/price sync?
3. **The one active campaign covers the wrong category to prove ROI fast.** The current promo campaign (hard disks only) is a reasonable test, but hard disks are a commoditized, thin-margin category — a camera-line campaign would be a more representative test of whether promos move the app's core revenue, once WineYard is ready to expand it.
4. **June was an outlier, not a trend.** If WineYard is expecting July/August to build on June's ₹3.97 Cr peak, the daily data doesn't support that — July is reverting toward the April/May baseline.
5. **Segmentation tools exist and are essentially idle** — price lists and cohorts are live features, used by fewer than 1% of active buyers, despite an 80/20 buyer base that is a textbook fit for tiered pricing.

---

## 3. Immediate Wins (can act on before/at the meeting)

1. **Roll out app access to the top 20% revenue buyers (563 accounts) first.** This is the actual #1 constraint on app GMV — not catalog, access. Those 563 buyers already drive 85% of the business; getting them app-enabled and onboarded is the single highest-leverage lever available.
2. **Work the Himayatnagar estimate backlog.** ₹18.77 Cr sitting unconverted is bigger than the total 90-day revenue of every other location combined. Even a partial close-out (ask: real pipeline vs. stale data?) is the single highest-leverage collections/sales action available today.
3. **Restock the 14 sub-7-day-cover SKUs**, especially the #1 camera SKU and `RFB-8TB` — both will stock out within two weeks at current velocity, and both are top-10 revenue lines.
4. **Chase the top 10 overdue accounts** (₹24.4L, 76% of overdue value) — a short, high-value, ownable list rather than 60 scattered follow-ups.
5. **Decide on the 113 never-sold SKUs** — delist, discount, or bundle to free the ~₹15L of tied-up capital.
6. **Once access is rolling out, extend the promo campaign beyond hard disks** to 2–3 top CCTV camera SKUs — a low-effort way to give newly-onboarded buyers a reason to open the app in week one.

---

## 4. Action Items (post-meeting / near-term)

- [ ] Confirm with WineYard whether the 6,952 zero-activity buyers are real (import cleanup candidates) or dormant accounts worth a reactivation push — decision changes how "10,909 buyers" should be framed going forward.
- [ ] Get a straight answer on Himayatnagar: pipeline or stale estimates. If stale, build an estimate-expiry/cleanup routine so this doesn't recur.
- [ ] Flag the cost-price data quality issue (₹11.56/₹0 placeholders) to WineYard's Zoho admin — margin reporting in DealFlow will be wrong until their item master is corrected.
- [ ] Investigate the 6 below-cost SKUs — confirm intentional vs. sync error.
- [ ] Assess whether Gaganmahal New should stay listed as an active location (12 invoices / 115 days, worst stock coverage) or be marked dormant.
- [ ] Set up at least one real cohort + price list for the top 20% buyer segment as a proof-of-concept, since the feature exists but is unused.
- [ ] Clarify whether "orders" (checkout flow) is expected to be used going forward, or whether estimate→invoice will remain the primary flow — this determines how hard to push order-object adoption vs. reporting.

---

## 5. What's already in the app vs. what Yukti (AI layer) could add

WineYard doesn't have AI analysis in DealFlow today. Everything in Part A below is available now, from the same `metrics_v2` tables this report was built from — it's a dashboard/display question, not a data gap. Part B is where a Yukti-style AI layer earns its keep: pattern-detection and recommendation, not just aggregation.

### Part A — Available today, no new engineering
| Insight | Already backed by data? | Where |
|---|---|---|
| Revenue/estimate/order trend, tenant + per-location | Yes | `metrics_tenant_daily`, `metrics_location_snapshot` |
| Buyer list ranked by 90d revenue, with overdue/receivable flags | Yes | `metrics_buyer_snapshot` |
| Top/bottom products by revenue, units, days-of-cover | Yes | `metrics_product_snapshot` |
| Out-of-stock / low-cover alerts | Yes | `metrics_product_snapshot` |
| Location-level conversion rate (estimate→invoice) | Yes | `metrics_location_snapshot` |
| Buyer app adoption count + app-attributed revenue | Yes | `metrics_buyer_snapshot` |
| Campaign coverage (SKUs on active promo vs. active catalog) | Yes | `metrics_product_snapshot` |
| Receivables aging / overdue totals | Yes | `metrics_buyer_snapshot`, `metrics_tenant_commercial_snapshot` |

**Positioning line for the meeting:** *"Everything above, your team can already pull from the dashboard themselves, live, any day — this report didn't need special access, just eyes on the same data."*

### Part B — Requires an AI layer (Yukti roadmap), with impact framing
| Capability | What it does | Why it needs AI, not just a query | Estimated impact |
|---|---|---|---|
| **Win-back scoring** | Rank the 6,952 dormant buyers by likelihood-to-reactivate (recency, category fit, geography) instead of a flat "inactive" flag | Requires a learned/scored model across behavioral features, not a static filter | If even 5% of dormant buyers reactivate at the average active-buyer spend (~₹33.5K/90d), that's **~₹1.16 Cr/quarter** of recovered revenue |
| **Demand forecasting & auto-reorder** | Predict SKU/location stockouts before they happen (e.g., the 14 sub-7-day-cover SKUs, flagged automatically) | Needs time-series forecasting per SKU×location, not a threshold rule | Prevents recurrence of the 26 stockout-driven lost sales seen in 90 days; protects top-10 revenue SKUs specifically |
| **Smart campaign curation** | Auto-recommend which SKUs to add to promo campaigns based on sell-through, margin, and buyer-segment fit, instead of manually picking a category to test | Needs a ranking/recommendation model, not a one-time manual pick | Turns campaign expansion (e.g., beyond the current hard-disk test) into a data-driven, ongoing process rather than a one-off decision |
| **Collections risk scoring** | Prioritize the 60 overdue accounts by default-risk (not just amount) and draft the follow-up nudge | Requires a risk model over payment history/behavior, plus generative drafting | Focuses collection effort on the accounts most likely to actually go bad, not just the largest balances |
| **Anomaly explanation** | Auto-detect and explain things like the Himayatnagar conversion collapse in plain English, instead of a human finding it in a manual report | Requires pattern-detection + natural-language generation over the metrics | Turns a one-off "we happened to notice this" into a standing early-warning system |
| **Cohort/pricing suggestions** | Recommend cohort groupings and price-list assignments from actual buying behavior (today: 9–10 buyers use these features manually) | Needs clustering/segmentation over transaction history | Unlocks the pricing infrastructure that already exists but sits unused for 99% of active buyers |
| **Natural-language Q&A over the business** | "Why did revenue dip on July 19 and July 24?" answered conversationally | Requires reasoning over the metrics tables + the ability to synthesize an answer, not just chart the data | Replaces ad hoc reports like this one with an on-demand capability, available to WineYard's own team without a Cowork session |

**Positioning line for the meeting:** *"Today you get the dashboard — the facts. Where we're headed is the dashboard telling you what to do about it. That's Yukti, and it's built directly on the metrics infrastructure you're going live on today, not a separate system."*

---

## Data caveats

- The near-zero cost-price values on ~140 SKUs (see Surprises §1) mean **margin figures should not be quoted to WineYard as fact** — flag as a data-hygiene item for their Zoho item master, not a DealFlow calculation error.
- `geography` on the buyer master is mostly null/incomplete (10,575 of 10,909 buyers have no usable location data) — location-level buyer counts in this report come from the location snapshot table, not buyer-level geography.
- Orders (`order_count`/`order_value`) are near-zero throughout the whole 115-day window — the business currently runs on estimate → invoice, so "order" metrics should not be presented as a meaningful volume indicator yet.
