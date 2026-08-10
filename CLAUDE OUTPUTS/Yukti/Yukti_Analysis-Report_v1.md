# Yukti — PostHog Usage Analysis & Instrumentation Plan

**Prepared for:** Phani | **Project:** Yukti | **PostHog project:** Yukti Production (id 370765) | **Date:** 2026-08-09

Scope: single PostHog project covers both `useyukti.in` (marketing) and `app.useyukti.in` (seller + buyer app). Data window available: **2026-05-23 → 2026-08-09** (~2.5 months, 81.4K events, 393 unique people total, but real product usage only started ramping from late July).

---

## Headline finding — WineYard tenant (`d601c35c-1a78-4506-a556-a82118d72893`), last 7 days

You asked me to zoom into the one tenant with real activity. That's **wine-yard-technologies** — your pilot customer per the CLAUDE.md brief. The funnel tells a clear story:

| Step | Unique buyers (7d) | Drop from previous |
|---|---|---|
| Logged in (`otp_verified`) | 54 | — |
| Viewed search results | 29 | -46% |
| Added item to cart | 16 | -45% |
| Submitted cart → estimate | 8 | -50% |
| **Estimate → Order (`order_placed`)** | **0** | **-100%** |

**Zero orders were placed by this tenant's buyers in the last 90 days**, despite 58 estimates created since July 19 totaling well over ₹8 lakh in estimated value (individual estimates ranging ₹215 to ₹2.27L). This is the single biggest red flag in the data: buyers are logging in, browsing, and requesting quotes — the top of the funnel works — but nothing is converting to a placed order. Either (a) WineYard's sales team is closing these manually offline and DealFlow never sees the order, (b) there's a broken or missing "convert estimate to order" step in the product, or (c) buyers are estimate-shopping and not being followed up with. You should find out which — this is worth a same-day conversation with WineYard, not a backlog item.

Other signals from this tenant, last 7 days:
- **Repeat estimate-requester**: buyer `9aa22fa1-b22b-4d75-8a80-68183f018ab3` alone created ~15+ estimates since July 19 — a hot lead worth a direct sales call.
- **Product interest** (by cart-adds): CP Plus dominates — 2.4MP Illumax Bullet Camera, 8-Ch DVR, 32-Ch NVR, PoE switches — consistent with WineYard's CCTV catalog. Generic/Seagate accessories (hard disks, racks, spike boxes) also show steady adds.
- **Seller-side**: one admin user is heavily active — 286 `seller_detail_tab_viewed` + 68 `dashboard_viewed` in 7 days — but only 1 seller account touching the product at all. No evidence of a second seller/ops user.
- **Friction signals**: 58 `$rageclick` events (15 unique buyers) and 4 `login_failed` in 7 days — worth a session-replay spot check before assuming it's noise.

Red flag, stated plainly: **you have demand (estimates) but no evidence of revenue capture (orders) for your flagship pilot tenant.** Everything below is designed to make this kind of gap visible automatically instead of requiring an ad hoc SQL dig.

---

## 1. How's usage until now (all tenants, high level)

- **Total events (90d):** 81.4K | **Unique people:** 393 (includes bot/marketing traffic — not all buyers/sellers)
- **DAU trend:** flat and low (3–20/day) through mid-July, then a clear step-up from **2026-08-02 onward** (peaked 73 on Aug 6) — this lines up with WineYard's pilot going live. Before that, activity was overwhelmingly marketing-site (`$pageview`) and internal testing.
- **Top product events (90d), all tenants:**

| Event | Count | Unique people | Read as |
|---|---|---|---|
| `reco_widget_shown` | 3,083 | 82 | recommendation widget impressions |
| `dashboard_viewed` | 1,251 | 26 | seller cockpit usage |
| `buyer_cart_item_quantity_changed` | 659 | 18 | cart edits |
| `catalog_item_added_to_cart` | 565 | 39 | product interest |
| `buyer_catalog_search_results_viewed` | 310 | 34 | search usage |
| `otp_verified` | 224 | 83 | buyer logins |
| `inquiry_created` | 76 | 19 | estimates created |
| `user_signed_in` | 146 | 16 | seller logins |
| `buyer_cart_submit_clicked` | 24 | 9 | cart → estimate submits |
| `order_placed` | **3** | **2** | **orders, across the entire project, all tenants, 90 days** |
| `server_tenant_created` | 17 | 6 | tenants onboarded |

The `order_placed` number is the one that should worry you most: **3 orders total, from 2 buyers, across every tenant, in 90 days**, against 76 estimates and 565 cart-adds. Either order placement is broken/unfindable in the product, or the business genuinely converts almost nothing from estimate to order today. Either way it's the top-priority thing to instrument and investigate, not just for WineYard.

**Caveat on "usage until now":** most of this window is pre-launch/testing. Treat anything before ~July 24 as noise. The real read on Yukti's usage starts ~2 weeks ago.

---

## 2. What you should be tracking in PostHog

Your event taxonomy is already reasonably good (35 custom events) but has three structural gaps:

1. **No invoice event, no estimate→order linkage.** `inquiry_created` (estimate) and `order_placed` (order) carry `estimate_id`/`order_id` respectively but nothing connects them. You cannot currently answer "what % of estimates become orders" without a database join outside PostHog — which is why I could only prove *zero* orders happened, not *why* the estimates didn't convert.
2. **Tenant identity is inconsistent across events.** Some events carry `properties.tenant_id` (e.g. `order_placed`, `inquiry_created`), others rely on `person.properties.tenant_id` set via `$identify`/`$set` (e.g. `catalog_item_added_to_cart`). This works but means every tenant-scoped query has to OR across both — brittle and easy to undercount if identify hasn't fired yet. Standardize: every buyer/seller event should carry `tenant_id` directly, not just via person properties.
3. **No product-view event, only add-to-cart.** "Most explored products" today can only mean "most added to cart," which undercounts genuine browsing/consideration. Add a `product_viewed` (or `catalog_item_viewed`) event.

Recommended metrics taxonomy (organize your PostHog dashboards around this, and it maps directly to what you asked to surface in-app):

**Activation & reach**
- New tenants onboarded (`server_tenant_created`)
- Buyers invited vs. buyers who ever logged in (activation rate)
- Time-to-first-login, time-to-first-order per tenant

**Engagement (period-over-period: today / week / month / quarter)**
- DAU/WAU/MAU, split by `role`/`user_type` (buyer vs seller)
- Sessions per buyer, searches per buyer
- Catalog breadth explored (unique products viewed/added) per buyer

**Conversion & funnel** — this is your most important funnel, build it as a saved PostHog Funnel insight:
`otp_verified` → `buyer_catalog_search_results_viewed` → `catalog_item_added_to_cart` → `buyer_cart_submit_clicked` → `inquiry_created` → **(missing) `estimate_converted_to_order`** → `order_placed` → **(missing) `order_invoiced`**

**Retention & churn risk**
- Repeat-order rate (buyers with ≥2 orders / buyers with ≥1 order)
- "Dropping customers" = logged in this period but zero cart/estimate/order activity — cohort this explicitly (see below)
- Estimate requested but never followed by an order within N days (stale-estimate cohort — this is WineYard's exact problem today)

**Business/revenue proxy** (until you have invoicing events)
- Sum of `total_amount` on `inquiry_created` (pipeline value) vs. sum on `order_placed` (captured value) — your current pipeline-to-revenue leakage metric
- Average order/estimate value, by tenant

**Seller-side ops**
- Cockpit engagement: `dashboard_viewed`, tab views, per tenant per seller
- Cohort/price-list edits (`customer_group_updated`), catalog publishes (`catalog_published`)

**Quality/friction**
- `$rageclick`, `login_failed`, `$exception` rates — cheap leading indicators of UX breakage, already flowing in

---

## 3. How to set PostHog up for a clear picture + anomaly detection

**a. Turn `tenant` into a first-class Group.** Your project already has `tenant` defined as a group type (I can see it in the schema) but it's under-used — most queries fall back to person/event properties. Send `$groupidentify` consistently for tenant on every relevant event, then every insight can be broken down "by tenant" with one click, and you get per-tenant dashboards for free instead of hand-written SQL like I just did for WineYard.

**b. Build these as saved Insights (not one-off queries), then pin to a "Yukti Business Health" Dashboard:**
- Trends: DAU/WAU/MAU split by buyer/seller (`role` breakdown)
- Funnel: the 7-step funnel above, breakdown by tenant
- Trends: `inquiry_created` sum(`total_amount`) vs `order_placed` sum(`total_amount`), 4-week rolling — this single chart would have shown you the WineYard gap without any digging
- Retention insight: buyers who logged in week N, did they log in week N+1 (standard PostHog retention view)
- Table: top products by cart-adds, breakdown by tenant and brand

**c. Alerts (PostHog's built-in Alerts, not a custom cron job):**
- Fixed-threshold alert on `order_placed` count: "less than 1 in 7 days" per tenant → this alone would have flagged WineYard automatically instead of you having to ask me to dig.
- Fixed-threshold alert on `login_failed`: "more than 10 in 1 day."
- Anomaly-detection alert (PostHog supports this natively on trends/funnels/SQL insights) on total estimate value and total order count — catches spikes/drops without you hand-picking a threshold.
- Alerts support Slack/email/webhook delivery — route the order-drop and login-failure alerts to your team Slack channel.

**d. Dashboard filters + tenant-scoped SQL variables** so one dashboard serves every tenant (swap tenant via a dropdown) instead of building N dashboards.

**e. Fix the taxonomy gaps from Section 2 first** — better alerting on broken data just tells you about broken data faster. Estimate→order linkage and a `product_viewed` event are the two highest-leverage additions.

---

## 4. Fetching PostHog data into the Yukti app (don't rebuild tracking)

Don't re-instrument analytics inside Yukti — call PostHog's own APIs server-side and render the results in your existing dashboard/cockpit UI. Two endpoints cover everything you described:

**Primary: Query API — `POST /api/projects/:project_id/query/`**
Runs any insight type (TrendsQuery, FunnelsQuery, RetentionQuery, or raw HogQLQuery) and returns JSON — this is the same endpoint the PostHog web app itself uses, so anything buildable as an insight is fetchable this way. This is what you want for period-level cards (today/week/month/quarter), the login→order funnel, top-products table, and the "dropping customers" cohort — one endpoint, different query bodies.

```
curl -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": {"kind": "HogQLQuery", "query": "select ..."}}' \
  https://us.posthog.com/api/projects/370765/query/
```

**Secondary: Insights API — `/api/projects/:project_id/insights/`**
CRUD for insights you've already built and pinned in PostHog (Section 3). Use this if you'd rather define the metric once in the PostHog UI (with all the filter logic) and just pull its latest computed result into Yukti, instead of re-writing the HogQL/query body in your own app code. Lower maintenance burden — recommended for anything that maps 1:1 to a dashboard chart you built in step 3b.

**Auth & architecture:**
- Use a **Personal API Key**, scoped narrowly (read-only query/insight scopes), stored server-side only (env var in your Next.js API routes) — never expose it client-side. This matches your existing pattern of not trusting client-supplied identifiers.
- Build a thin internal API route (e.g. `app/api/analytics/[metric]/route.ts`) that calls PostHog server-side, shapes the response, and applies your existing `buyer-cache-headers.ts` (`private` cache, short TTL — PostHog itself caches query results, so a 1–5 min TTL on your side is enough for "today/week/month" cards).
- Map each in-app card to one query:
  - **Buyer logins, estimates, orders, orders-from-estimates** → one TrendsQuery with multiple series, `breakdown` by tenant if you want it per-distributor, `interval` = day/week/month/quarter per your period selector.
  - **Funnel (login → order → repeat order)** → FunnelsQuery, `funnel_order_type: strict` for the login→order steps; repeat-order needs a second query (retention or a HogQL `count(order_placed) group by buyer having count >= 2`).
  - **Most-explored products** → HogQLQuery grouping `catalog_item_added_to_cart` by `product_name`/`brand` (today; once you add `product_viewed`, use that instead — better signal).
  - **Dropping customers** (logged in but no order) → HogQLQuery: buyers with `otp_verified` in period, `LEFT ANY JOIN` against `order_placed` in same period, filter to null match. I ran exactly this pattern manually for WineYard above — trivial to templatize per-tenant.
- Since group analytics is a paid PostHog add-on (verify your current plan before committing the "tenant" group-breakdown approach) and this is a query API, not free-tier: budget for the query volume if you refresh cards on every dashboard load rather than on your own cache schedule.

Reference: [Product analytics API](https://posthog.com/docs/product-analytics/surfaces/api) · [Query API reference](https://posthog.com/docs/api/query) · [Alerts docs](https://posthog.com/docs/alerts#anomaly-detection) · [Alerts API](https://posthog.com/docs/api/alerts)

---

## Recommended next actions, in order

1. **Today:** ask WineYard's team why 58 estimates → 0 orders. This is a revenue/product question, not a data question.
2. **This week:** add `tenant_id` consistently to every event; add an `estimate_converted_to_order` event (or at minimum, put `estimate_id` on `order_placed`) and a `product_viewed` event.
3. **This week:** build the 4 insights in Section 3b, pin to one dashboard, set the two threshold alerts.
4. **Next sprint:** build the thin PostHog-proxy API route in Yukti and wire the 4 in-app cards described in Section 4, starting with the funnel and the estimate-vs-order value chart — those two alone would have surfaced the WineYard gap without me needing to hand-query it.
