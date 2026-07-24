# WineYard Technologies — Go-Live Business Insights
**Prepared for:** 2026-07-24 go-live meeting
**Data window:** Last 90 days (invoices/estimates/orders), snapshot as of 2026-07-24 05:02 UTC
**Source:** DealFlow production `metrics_v2` tables (tenant: `wine-yard-technologies`)

> Use this as your speaking notes. Headline number first, then the "so what," then the ask/pitch line. HTML deck (`wineyard-report.html`) is the visual leave-behind.

---

## 0. The one-slide summary (open with this)

WineYard did **₹9.42 Cr** of invoiced business in 90 days across **2,811 active buyers** and **8 locations** — but the app is only touching **~2.8% of that revenue** today, not for lack of catalog (buyers with access can already browse and order the full 340-product active catalog), but because **only 171 of 10,909 buyers have app access enabled**. That gap *is* the pitch: same business, more of it moving through a channel you control instead of paper/calls — just needs the rollout switched on for the rest of the base.

---

## 1. Revenue concentration — a classic 80/20, worse than usual

| Buyer quintile (by 90d revenue) | Buyers | Revenue | % of total |
|---|---|---|---|
| Top 20% | 563 | ₹7.97 Cr | **84.6%** |
| 2nd 20% | 562 | ₹1.01 Cr | 10.7% |
| 3rd 20% | 562 | ₹31.5 L | 3.3% |
| 4th 20% | 562 | ₹10.5 L | 1.1% |
| Bottom 20% | 562 | ₹2.2 L | 0.2% |

**Talking point:** Top 563 buyers (of 10,909 registered) drive 85% of revenue. That's not unusual for distribution — but it means their retention/service experience is the whole business. Ask: *"Do you have a formal top-tier program for these 563 accounts today?"* (Answer is likely no — only 9 buyers are on an active price list, 10 in an active cohort, despite 2,811 being active.)

**Dormant base is huge:** 6,952 of 10,909 buyers (64%) have **zero** invoice or estimate activity ever. That's either dead data (never should've been imported) or a reactivation opportunity — worth asking which.

---

## 2. The buyer app gap — this is the headline story

- **171 buyers** (1.6% of all buyers, 6% of active buyers) have app access enabled.
- Of those 171, only **1–2 showed any app activity in 90 days.**
- App channel did ₹26.6L in invoices + ₹64.6L in estimates over 90 days — **~2.8% of total invoiced revenue.**
- `health_reason = 'no_app_access'` is tagged on **10,689 of 10,909 buyers** — by far the single biggest lever in the whole dataset.

**Catalog is not the blocker — access is.** All 340 active products are already browsable and orderable in the buyer app; the `is_published` flag some buyers see was a *campaign* promotion (a targeted hard-disk push), not a catalog gate. So the ~2.8% app-revenue share isn't a product-availability problem, it's an enablement problem: 10,689 of 10,909 buyers simply don't have app access turned on yet.

**Talking point:** *"The catalog's already full and orderable — nothing to build there. The lever is rollout: turn on app access for more of the base, starting with the top-quintile 563 buyers who already drive 85% of revenue, and GMV through the app should follow."* This is an enablement/rollout task, not an engineering or catalog task — a good, low-effort ask to leave the meeting with.

**Trend note (see daily chart):** app activity was literally zero before late April, then grew organically to low-single-digit-lakh days by June as access rolled out to early buyers — proof the channel converts once buyers are switched on.

---

## 3. Location performance — 3 locations carry the business

| Location | 90d Invoice Value | Buyers | Conversion (est→inv) | Note |
|---|---|---|---|---|
| Chandanagar | ₹1.98 Cr | 812 | 33.2% | Largest by volume |
| Boduppal | ₹1.87 Cr | 651 | **43.8%** (best) | Most efficient |
| Kharmanghat | ₹1.79 Cr | 525 | 40.2% | Strong |
| Himayatnagar | ₹1.75 Cr | 168 | **11.5%** (worst) | See below |
| Suchitra | ₹0.90 Cr | 512 | 35.2% | |
| Attapur | ₹0.74 Cr | 413 | 25.7% | |
| Sainikpuri | ₹0.31 Cr | 231 | 13.9% | |
| Gaganmahal New | ₹0.08 Cr | 8 | 5.9% | **Effectively dormant** |

Top 3 locations = 60% of revenue. **Gaganmahal New** did only 12 invoices in 90 days — worth asking if it's a new/winding-down branch or a data setup issue (also has worst stock coverage: 292 of 442 products out of stock there).

**Himayatnagar anomaly worth flagging live:** ₹18.77 Cr in *open* estimates sitting unconverted, against only ₹1.75 Cr actually invoiced — an 11.5% conversion rate vs 25–44% everywhere else. Either a sales-process gap (reps not closing) or estimates aren't being cleaned up/expired. Good discussion prompt: *"What's happening at Himayatnagar — is this a real pipeline or stale data?"*

---

## 4. Inventory & catalog health

- 29 of 340 active products fully out of stock; 26 stockouts occurred with recent invoice demand — real lost-sale signal, not just slow movers.
- 113 of 451 total products haven't sold in 90 days — candidates for delisting or clearance.
- Fast movers with **thin cover**: `CP-UNC-TA41L3C-LQ` (4MP Bullet, 170 units on hand, only **14.6 days cover**) and `RFB-8TB` (8 units on hand, **5.2 days cover**) — restock urgently or you'll be turning away orders on your own bestsellers within 2 weeks.
- Overstock at the other extreme: `CP-UNC-TA21L3C-LQ` has **273 days of cover** (3,362 units) — capital sitting idle.

---

## 5. Collections

- ₹40.7L total receivable, of which **₹32.0L (78.6%) is overdue.**
- 60 buyers currently overdue.
- No credit_limit values are populated in the buyer master (`credit_limit = 0` for every buyer sampled) — credit control isn't configured yet. Worth a quick "do you want this enforced?" conversation.

---

## 6. Integration health (proof point, use if Zoho comes up)

Zoho sync: 65 completed / 1 failed / 2 cancelled jobs — integration is stable. Good to reference as "the plumbing already works" if the conversation turns to going deeper on Zoho.

---

## Part A — Insights the app already surfaces today (or could with existing data, no new engineering)

These live in `metrics_tenant_daily`, `metrics_tenant_commercial_snapshot`, `metrics_buyer_snapshot`, `metrics_location_snapshot`, `metrics_product_snapshot` — the same tables this report was built from. If the dashboard doesn't show them yet, it's a display/UI gap, not a data gap.

- Revenue, estimate, order trend (daily/monthly), tenant-wide and per-location
- Buyer list ranked by 90d revenue, with overdue/receivable flags
- Top/bottom products by revenue, units, and days-of-cover
- Out-of-stock and low-cover product alerts
- Location-level conversion rate (estimate → invoice)
- Buyer app adoption count and app-attributed revenue
- Buyer app access rollout rate (enabled vs. total buyers)
- Receivables aging / overdue totals

**Positioning line:** *"Everything I just showed you, your team can pull from the dashboard themselves, live, any day — I didn't need special access."*

## Part B — Insights that need AI (not available in the app yet, roadmap items)

These require reasoning/pattern-detection across the data, not just aggregation — this is where a future AI layer earns its keep:

1. **Win-back scoring** — rank the 6,952 dormant buyers by likelihood-to-reactivate using past purchase pattern, geography, and category fit, instead of a flat "inactive" flag.
2. **Demand forecasting & auto-reorder** — predict stockouts before they happen per SKU per location (e.g. flag `CP-UNC-TA41L3C-LQ` and `RFB-8TB` automatically, not after the fact).
3. **Smart rollout prioritization** — auto-recommend which of the 10,689 not-yet-enabled buyers to onboard next based on revenue potential and purchase pattern, instead of a flat rollout.
4. **Collections risk scoring** — prioritize the 60 overdue accounts by default-risk, not just amount, and draft the follow-up nudge.
5. **Anomaly explanation** — flag things like the Himayatnagar conversion drop automatically and generate a plain-English hypothesis, instead of a human having to notice it in a report like this one.
6. **Cohort/pricing suggestions** — recommend cohort groupings and price-list assignments (only 9–10 buyers use these today) based on buying behavior, not manual setup.
7. **Natural-language Q&A over the business** — "why did revenue dip on 2026-07-19/24" type questions answered conversationally instead of needing a report built by hand.

**Positioning line:** *"Today you get the dashboard. Where we're headed is the dashboard telling you what to do about it — that's the AI layer, and it's built on exactly the metrics infrastructure you're already running on."*

---

## Suggested flow for the meeting

1. Open with the one-slide summary (§0) — sets stakes without being alarmist.
2. Walk the app-adoption gap (§2) — it's the strongest, most actionable story, and it's a fixable-this-week problem (enable app access for the top-quintile 563 buyers first).
3. Show location performance (§3) — familiar to them, builds trust that the numbers are right.
4. Touch inventory + collections (§4–5) briefly — operational credibility.
5. Close with Part A vs Part B — sets expectation for the roadmap conversation and the AI upsell without overpromising today.

## Raw data for deeper analysis (Cowork / offline)

CSV exports in this folder, tenant-scoped to WineYard only:
- `wineyard_tenant_summary.csv` — all snapshot-level KPIs, one row per metric
- `wineyard_locations_90d.csv` — all 8 locations, full metric set
- `wineyard_daily_trend_apr_jul.csv` — 115-day daily trend (invoices/estimates/orders/app channel)
- `wineyard_buyers_90d.csv` — all 10,909 buyers with 90d activity, receivables, app/cohort/price-list flags
- `wineyard_products_90d.csv` — all 451 products with 90d sales, stock, publish status
