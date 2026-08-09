# Yukti — PostHog Usage Analysis & Instrumentation Plan (v2, revised)

**Prepared for:** Phani | **Project:** Yukti | **PostHog project:** Yukti Production (id 370765) | **Date:** 2026-08-09

**What changed from v1:** v1 flagged "0 orders despite 58 estimates" as a red flag. That was wrong context, not wrong data — you've clarified the buyer workflow *intentionally* stops at Estimates for WineYard today; conversion to Order/Invoice happens manually in-store, outside Yukti. So `order_placed` staying at zero is expected, not a failure. I've corrected the read below, re-scoped to **August 1 onward** (go-live), and excluded your two test accounts (buyer `9aa22fa1-b22b-4d75-8a80-68183f018ab3`, seller `d2268b16-d7dc-4166-942a-8f3a6c5e6468`) from every number. I've also answered your identity-merge question — it surfaces a real gap, see Section 4.

---

## Corrected headline — WineYard, first week live (Aug 1–9), real buyers only

| Step | Unique real buyers | Conversion from previous |
|---|---|---|
| Logged in (`otp_verified`) | 56 | — |
| Viewed search results | 31 | 55% |
| Added item to cart | 16 | 52% |
| Submitted cart → estimate | 8 (12 events) | 50% |
| **Estimate created** (`inquiry_created`) | **7 buyers, 9 estimates** | — |

- **Activation rate (redefined per your note): 7 / 56 = 12.5%** of buyers who logged in went on to book at least one estimate.
- **Repeat rate: 2 / 7 = 28.6%** of activated buyers booked a second estimate in the same week (`6867b0c4…` and `6a145229…`, 2 estimates each).
- **Real pipeline value booked, week 1: ~₹4,00,750** across 9 estimates (range ₹3,580 – ₹2,26,792). One outsized estimate (₹2.27L, buyer `9f19667b…`) is worth a manual sales follow-up — that's a lot of value sitting in one quote.
- **Orders (`order_placed`): 0 — expected, not a red flag.** Since Order/Invoice conversion is manual and off-platform for this tenant, this event will legitimately stay near-zero until you either (a) build that step into Yukti, or (b) add a lightweight "mark converted" action sellers tap after closing offline (see Section 3). Until then, don't alert on `order_placed` for WineYard — alert on **estimate activity going quiet**, not on orders never happening.
- **Seller-side:** excluding the test seller, exactly **2 real seller/ops users** touched the dashboard this week, but only **1** drove deep tab usage (293 `seller_detail_tab_viewed`). That's a single active operator — worth knowing before you scale to "next 500 people," since one person manually converting estimates to in-store orders won't scale past a handful of tenants.
- **Friction:** 58 `$rageclick` (15 buyers) and 4 `login_failed` this week — still worth a spot-check via session replay before your next push, since you're about to 10x traffic.

**Caveat this is still tenant-specific:** you noted other tenants may run estimate *and* order creation independently through Yukti. Don't generalize WineYard's "estimate-only" workflow as the product default — segment activation/repeat definitions per tenant based on which steps they actually use.

---

## 1. Usage since go-live (Aug 1–9), WineYard, test accounts excluded

| Event | Count | Unique real people | Read as |
|---|---|---|---|
| `otp_verified` | 84 | 56 | buyer logins |
| `buyer_catalog_search_results_viewed` | 273 | 31 | search usage |
| `catalog_item_added_to_cart` | 120 | 16 | product interest |
| `buyer_cart_submit_clicked` | 12 | 8 | cart → estimate submits |
| `inquiry_created` | 9 | 7 | estimates booked |
| `dashboard_viewed` | 87 | 2 | seller cockpit usage |
| `seller_detail_tab_viewed` | 293 | 1 | seller deep-dive usage |
| `order_placed` | 0 | 0 | expected — see above |
| `login_failed` | 4 | 1 (repeated fails, same buyer) | worth a look |
| `$rageclick` | 58 | 15 | friction signal |

A week of real signal, not noise: this is a genuine early cohort, not test traffic — good base to build from before the 500-person push.

---

## 2. Answering your identity-merge question

**Short answer: identity merging looks inconsistent, and this is worth fixing before you scale to 500 users** — it's currently undercounting real per-buyer engagement.

What I found:
- Since Aug 1, WineYard has **130 unique PostHog `person_id`s against 131 unique `distinct_id`s** — essentially a 1:1 ratio, meaning almost no anonymous-to-identified merging is happening in the data. Normally you'd expect a pre-login anonymous session to merge into the buyer's identified profile via `posthog.identify()`, collapsing multiple `distinct_id`s into one `person_id`. That's barely happening here.
- Spot-checked a real repeat buyer (`6867b0c4…`, 2 estimates, active across a full week): their merged PostHog person has **only 3 total events** attached — nowhere near enough to cover the browsing, cart-adds, and searches that must have preceded 2 estimate submissions. That activity almost certainly happened under separate, unmerged anonymous `distinct_id`s.
- Compounding this: `buyer_id` (your real business identifier) is only stamped as an event property on `inquiry_created` and `order_placed` — not on `otp_verified`, `catalog_item_added_to_cart`, `buyer_catalog_search_results_viewed`, or cart events. So even where PostHog's own person-merge falls short, you can't fully backfill via `buyer_id` either, because it's missing from the browse-level events entirely.

**Net effect:** your "unique buyers" and "unique visitors" counts in PostHog are likely **inflated** (each unmerged anonymous session counts as a separate person), while your **per-buyer funnel is undercounted** (a real buyer's full journey is split across profiles PostHog can't stitch back together). This doesn't invalidate the numbers above — event counts and login counts are still accurate — but anything claiming "buyer X did A then B then C" should be treated as directional, not precise, until this is fixed.

**Root cause to check with engineering (I can't confirm from PostHog data alone):** is `posthog.identify(buyer_id)` being called on every session as soon as the buyer is known (e.g. right after OTP verify), including on returning visits where a new anonymous ID gets generated (new device, cleared storage, different browser)? If identify is only called once per install/session and not re-asserted on each visit, or if the buyer app resets local storage between visits, you'll keep generating orphaned anonymous persons.

**Fix, in priority order:**
1. Call `identify(buyer_id)` immediately after every successful OTP verification, every session — not just once.
2. Stamp `buyer_id` (and `tenant_id`) as an explicit **event property** on every buyer-side event, not just estimate/order events. This makes your funnels correct even if person-merge is imperfect, and it's the fix with the best effort-to-value ratio.
3. Re-run this same person/distinct_id ratio check after the fix ships — if it moves from ~1:1 toward meaningfully fewer persons than distinct_ids, merging is working.

---

## 3. Gaps to fix before/while you scale to 500 users

1. **`buyer_id`/`tenant_id` missing from browse-level events** (Section 2) — highest priority, directly affects funnel and cohort accuracy at higher volume.
2. **No product-view event** — "most explored products" can currently only mean "most added to cart" (16 buyers, 120 adds this week). You're undercounting genuine browsing interest. Add `product_viewed`.
3. **Estimate→Order/Invoice conversion is invisible to Yukti for tenants doing it manually** (like WineYard). Two options, pick based on how much you want sellers to log this: (a) a lightweight in-app "Mark estimate as converted" action that fires an event — gives you real conversion-rate data without changing the offline workflow; (b) accept it stays a blind spot for manual-conversion tenants and only track it for tenants where order creation happens in-app. Given you said this varies by tenant, I'd build (a) as an optional per-tenant toggle rather than assume one workflow.
4. **`otp_verified` has no `buyer_id`** — it only carries `tenant_id`, `role`, `candidate_kind`. That's the login event and it's the one place you'd most want buyer identity for time-to-first-estimate and activation-latency metrics.
5. **Alert design needs to be tenant-workflow-aware** (your point #3): a blanket "orders dropped" alert would have false-alarmed on WineYard forever. Segment tenants by which steps they actually use (estimate-only vs. estimate+order) and configure alerts per segment, not globally.

---

## 4. What "more traction next week" should look like — and what to watch

You're enabling ~500 more people today. Here's what a good next-week readout looks like, and the specific numbers I'd pull to check it (all queryable via the same PostHog Query API pattern from v1 Section 4):

- **Login activation:** what fraction of the 500 newly-enabled people log in at all within 7 days? (Not everyone "enabled" will try the app — track invited → logged-in separately from logged-in → estimate.)
- **Estimate activation rate should hold or improve** from this week's 12.5% baseline as you add tenants/users — if it drops sharply, onboarding friction is the likely cause, not lack of interest.
- **Repeat rate (28.6% this week)** is a small sample (7 buyers) — don't read too much into week-over-week movement until you have 30+ activated buyers to compare.
- **Per-tenant, not just aggregate:** with more tenants live, watch for a repeat of "high estimate activity, zero visible orders" and immediately check whether that tenant is estimate-only (expected, per your clarification) or has in-app ordering (investigate if so).
- **Friction metrics at 10x scale:** `$rageclick` and `login_failed` should be watched in absolute terms this week — if they scale faster than logins, something in onboarding or OTP delivery is breaking under load.
- **The single-operator risk:** if new tenants show the "1 seller doing all the work" pattern seen at WineYard, that's an operational bottleneck for them, not a Yukti product signal — but worth knowing per-tenant before you assume "traction" from seller-side activity.

---

## Recommended next actions, in order

1. **This week:** ship `buyer_id`/`tenant_id` as explicit event properties on every buyer event (Section 2/3.1) and re-run the identity-merge check — this is the fix with the highest data-quality payoff before you scale traffic.
2. **This week:** decide, per tenant, whether estimate→order conversion should be tracked via a manual "mark converted" action (3.3) — don't build a global assumption.
3. **This week:** build the activation/repeat/friction dashboard described in Section 4, segmented by tenant, so you have a clean baseline before today's 500-person push and can read next week's numbers against it.
4. **Ongoing:** keep the v1 Section 4 API-integration plan (PostHog Query API → in-app cards) — still valid, just make sure any "orders" card is tenant-workflow-aware per Section 3.5.

*v1 remains on file (`Yukti_Analysis-Report_v1.md`) for reference on the PostHog setup/API integration guidance (Sections 2–4 of v1), which is unchanged by this revision.*
