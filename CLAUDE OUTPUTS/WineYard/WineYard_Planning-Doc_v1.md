# WineYard — 30-Day Adoption Playbook

**Goal:** Prove Yukti's value in month 1 → secure renewal → convert to annual.
**Grounded in:** WineYard go-live report (2026-07-24) — 171/10,909 buyers have app access, only 1–2 active, app touches 2.8% of revenue. Access, not features, is the current bottleneck.

---

## 1. Assistant WIIFM — what Zoho doesn't give them

The honest framing for the owner: Zoho shows *data*. None of it is a **decision** pre-made for the assistant on the call. That's the wedge — not new information, faster answers.

### Ship first: Price Resolver
This is the strongest idea on the table — it's the only one that removes a phone call to the manager/owner, which is the actual behavior you're trying to kill.

- Input: buyer + product (+ qty).
- Output: resolved price in one screen — buyer's price list → cohort price → batch/stock-based rate → last invoiced price for that buyer, shown side by side.
- This already has the data spine: `resolve_price()` exists in the DB. The net-new part is batch/cost-of-stock-dated pricing (Dec stock vs Feb stock) — confirm with WineYard whether Zoho tracks batch-level cost today, or whether this needs FIFO/landed-cost logic built fresh. **Don't commit a date until you know which.**
- Pitch to assistants: "stop putting buyers on hold to call the manager."

### Ship second: Whom to Chase
Reframes existing Zoho data as a worklist instead of a report:
- Overdue buyers by location, sorted by aging — you already have this exact data in the go-live report (60 overdue, top 10 = 76% of value). Turn that report into a standing view, not a one-off.
- Expiring/stale estimates by location — Himayatnagar alone has ₹18.77 Cr in open estimates at 11.5% conversion. That's not a nice-to-have widget, that's a location that needs a worklist today.
- New enquiries by location for fast response (already shipped via WhatsApp).

**Why this beats Zoho for the assistant specifically:** Zoho requires them to build the filter/sort themselves, every time. Yukti hands them the prioritized list. Same data, but "here's who to call" vs. "here's a database."

### Red flag
Don't let this become "we rebuilt a Zoho report." The differentiator is *action-orientation* — worklists and resolved answers, not dashboards. If either feature ships as a filterable table, it will feel identical to what they already have and adoption dies. Price Resolver should feel like a calculator, not a search.

---

## 2. Stubborn buyers — reacting to his ideas + adding two

His four ideas, graded:

| Idea | Verdict | Why |
|---|---|---|
| First-purchase freebie / coupon | **Good, ship now** | Cheap, immediate, no engineering dependency — can run manually via WhatsApp before any campaign tooling exists. |
| Coupons / app-price campaigns | **Good, but sequence it** | Campaign infra already exists (used today for the 9 refurb-HDD SKUs). Extend it to 2–3 top camera SKUs — HDDs are thin-margin and won't move behavior. This is already flagged as the #1 near-term campaign action in the go-live report. |
| MOQ/MaxOQ + stock reservation via Orders | **Red flag — don't lead with this** | WineYard's business runs on estimate → invoice. Orders are essentially unused: 0 this month, 5 open total, against 3,889 open estimates. Stock-reservation-via-Orders requires a workflow change nobody has adopted yet. This is a phase-2+ lever, not a month-1 lever — don't let him anchor on it for the renewal conversation. |
| Native installable app | **Defer — already agreed, hold the line** | You've committed to 5+ active distributors before building it. Cheaper interim fix below can recover most of the value he's actually asking for. |

### Interim fix for the "buyers forget the link" problem
Before building a native app, close the gap with what PWAs already support:
- **Add-to-homescreen prompt** during buyer onboarding (not just an app link, an actual icon on their phone).
- **WhatsApp is the retention channel, not the browser bookmark** — you already send WhatsApp notifications for new enquiries; extend that to order confirmations, price-list updates, and a weekly "your saved cart" nudge. Buyers who never re-open the link will still see WhatsApp pings, which re-open the PWA directly.
- QR code in-store is good — pair it with add-to-homescreen at the point of scan, not just a link open.

### Two ideas not on his list, worth raising
1. **Assistant-assisted onboarding, not buyer self-serve.** Adoption for a stubborn buyer base rarely comes from the buyer initiating anything. Have the assistant place the first order *for* the buyer in-app, on the buyer's behalf, while they're standing at the counter — habit forms from repetition, not persuasion.
2. **Target the top 20% first, not "buyers" broadly.** The go-live report already identifies this: 563 buyers drive 85% of revenue, and only 171 total have access today. Behavioral-change effort is expensive per buyer — spend it on the 563 who matter, not a flat rollout to 10,909.

---

## 3. Red flags to raise with him directly

- **Cost-price data quality (~140 SKUs at ₹11.56/₹0 placeholder cost)** will break any margin-based campaign targeting if used. Fix this before Price Resolver or campaign-curation logic touches margin.
- **He's asking for behavioral-change tools (MOQ, stock lock) before the basic access rollout is done.** 98% of buyers are tagged `no_app_access`. Sequencing risk: don't let sophisticated features become the excuse to defer the unglamorous access rollout, which is still the single biggest lever.
- **Himayatnagar's ₹18.77 Cr estimate backlog** is either a sales-execution problem or dirty data — get a straight answer before citing it as pipeline in any renewal conversation.

---

## 4. 30-Day Plan → Renewal Story

**Week 1**
- Roll out app access to the top 563 buyers (top 20% by revenue). This is the single highest-leverage action available and has zero engineering dependency — it's an access/onboarding task, not a build.
- Extend the promo campaign from HDDs to 2–3 top camera SKUs.
- Assistant-assisted first order for the top 50 buyers in-store.

**Week 2–3**
- Ship Price Resolver (v1: price-list + cohort + last-invoiced price; batch-pricing as fast-follow once cost data is confirmed).
- Ship "Whom to Chase" worklist (overdue + stale estimates), scoped to the top 3 locations first (Chandanagar, Boduppal, Kharmanghat = 60% of revenue).
- Add-to-homescreen + WhatsApp nudges live for all newly-onboarded buyers.

**Week 4 — renewal conversation, backed by numbers**
Track and present:
- App access: 171 → target 700+ (top 20% + assistant-driven adds).
- App-attributed revenue: ₹26.6L → target visible uplift, even directionally.
- Assistant time saved: qualitative — ask 2–3 assistants directly how many "call the manager for pricing" moments Price Resolver removed.
- Collections: top 10 overdue accounts (₹24.4L) — show movement, not just visibility.

The renewal pitch isn't "look at all these features" — it's "access went from 1.6% to X%, and here's the revenue that followed." That's the only story that gets an annual signature.
