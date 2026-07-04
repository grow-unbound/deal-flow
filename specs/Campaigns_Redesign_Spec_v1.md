# Campaigns Redesign — Frontend Spec v1

**Scope:** Frontend UX only. No changes to `app.published_catalogs`, `app.price_lists`, `app.cohorts`, or `resolve_price()`. "Catalog" is already renamed to "Campaign" at the backend/table level per Phani — this spec covers the seller-facing screens: campaign list, campaign builder, campaign performance.

**Date:** 2026-07-03 | **For:** Phani | **Status:** Draft for approval

---

## 1. Problem

Catalogs + Pricelists + Customer Groups as three separate concepts was accurate but not how a distributor thinks. An early customer collapsed it into one word: **campaign** — special pricing, on a subset of products, for a target group of customers, for a limited time. Two concrete symptoms, both confirmed:

1. **Terminology confusion** — three nouns (catalog, pricelist, cohort) for what the seller experiences as one decision.
2. **Fragmented workflow** — making that one decision touched multiple entities/screens instead of one linear flow.

A third issue surfaced while reviewing the current builder screenshot: **pricing is invisible at the moment of picking products.** The product table shows Selling Base Price only; `Bulk adjust` and `Reset overrides` exist but there's no visible "what will this buyer actually pay" column. That's the workflow fragmentation, concretely.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Should Pricelists / Catalogs stay in the nav? | **Yes, kept as secondary/advanced pages** (for the power-user case — a pricelist reused across multiple campaigns). Campaigns is the primary flow for 95% of seller activity. |
| Where does pricing live in the builder? | **Inline, in the product table**, not a separate step or screen. New "Campaign Price" column, editable per row, plus a bulk-adjust popover (discount % / flat discount / fixed price). |
| What's the monitoring depth? | Beyond GMV/orders/conversion (already shipped): **per-product performance**, **per-buyer drill-down**, and **WhatsApp send/delivery tracking** — all three, additive to the existing Performance tab. |

---

## 3. Information Architecture

No nav structure changes beyond what's already shipped. Confirmed as-is:

- **Growth** section: Buyer App, **Campaigns** (primary), Customer Groups, Pricelists (secondary), Brands, Locations, Categories.
- Campaigns is the entry point sellers are trained to use. Pricelists stays reachable but is not referenced anywhere in the Campaign builder copy — a seller should never need to know it exists to launch a campaign.

**Non-goal:** merging Pricelists/Catalogs pages away entirely. Revisit only if telemetry shows <5% of sellers ever open Pricelists directly after this ships.

---

## 4. Campaign Builder — Redesign

Current: single dense page (Name / Customer Group / Validity header row → filters sidebar + product table → summary sidebar). Keep the single-page shape (it works, no need for a wizard) but restructure so the flow matches the seller's actual sentence: **Who → What → How much → When → Launch.**

### 4.1 Header row (unchanged in structure, tightened copy)
- Name (placeholder: `e.g. Diwali Push for Premium Buyers`)
- Customer Group selector (was "Customer Group" — keep as-is, already renamed from cohort)
- Validity (date range, "Open ended" default — keep as-is)

### 4.2 Product table — the core change

Add a **Campaign Price** column immediately to the right of **Selling Base Price**:

| PRODUCT NAME | BRAND | STOCK | MRP | SELLING BASE PRICE | **CAMPAIGN PRICE** | UNITS SOLD MTD | DAYS COVER |
|---|---|---|---|---|---|---|---|

- Defaults to Selling Base Price (no discount) until edited — a seller who does nothing ships a campaign at base price, which is valid (visibility-only campaigns are a real use case, e.g. "New Arrivals" with no discount).
- Inline click-to-edit per row, same interaction pattern as a spreadsheet cell.
- Edited cells get a subtle highlight (e.g. ember-tinted background) so "what did I actually change" is scannable at a glance before publishing.
- Strikethrough the Selling Base Price when a Campaign Price is set below it, matching the "lookbook" pricing treatment already specified for the buyer app (§10 of the product spec) — reuse that visual language here so sellers preview what buyers will see.

**Bulk adjust popover** (replaces the current unlabeled button behavior):
- Three modes: **% off**, **Flat ₹ off**, **Set fixed price**.
- Applies to selected rows (checkbox column already exists) or "all visible" if none selected.
- Live preview of resulting price range in the popover before applying (e.g. "₹58,000 → ₹52,200 for 12 products").

**Reset overrides** — unchanged behavior, but relabel to **"Reset to base price"** for clarity.

### 4.3 Campaign Summary sidebar (right column) — additive

Keep existing fields (Products, Brands, In stock, New, Reach, Valid from/until). Add:

- **Avg. discount** — computed from the campaign price column, e.g. "−7.4% avg across 19 products." This is the single number that answers "what am I actually offering," which today requires reading every row.
- **Price overrides** — count of rows where Campaign Price ≠ Selling Base Price (already a placeholder field "Manual tag overrides: 0" exists for tag state — add a sibling "Price overrides" count, don't conflate the two).

### 4.4 Launch bar (bottom, unchanged)
- Discard draft / Save & close / Publish campaign — keep as-is. No new copy needed; "Publish campaign" already reads correctly.

---

## 5. Campaign List Page

Largely working well — keep the structure (KPI cards, Today's Read panel, table). Two refinements:

1. **"AVG CONVERSION" KPI card** currently shows "0%" with no context when there's genuinely no data yet (all three seed campaigns show 0% conversion despite 8 orders attributed — likely a computation bug, flag to engineering separately from this UX spec). Empty/zero states across all four top KPI cards need a visual distinction between "0 because nothing happened yet" vs "0 because of a data gap" — the former should read as neutral, the latter shouldn't be shown as confidently as "0%."
2. **Table row status** — "DRAFT / Not yet sent" and "LIVE / 24d · until 27 Jul" are good, keep. Add a third state for campaigns nearing expiry (e.g. <3 days left) — visually distinct chip (e.g. amber "ENDING SOON") so it surfaces without the seller needing to compute days-left mentally from the date column.

---

## 6. Campaign Performance Page — Monitoring Depth

Current tabs: **Products / Performance / Buyers**. Keep this structure — it already anticipates the three depths requested. Fill them out:

### 6.1 Products tab (currently just a count "8" — needs a real table)
Full per-product performance table:

| PRODUCT | CAMPAIGN PRICE | UNITS SOLD | REVENUE | % OF CAMPAIGN GMV |
|---|---|---|---|---|

Sort by revenue descending by default. This replaces/absorbs the "Top SKUs in this catalog" widget currently on the Performance tab — one canonical place for product-level numbers instead of a preview widget plus a separate tab with the same data.

### 6.2 Performance tab (mostly built — keep Cumulative orders chart + Funnel card)
Add one new funnel stage. Current funnel: Views → Opens→Order conversion → AOV → Abandoners. Extend to reflect the WhatsApp distribution channel explicitly:

**Sent → Delivered → Opened (in app) → Ordered**

This is the actual journey for a WhatsApp-shared campaign and today the funnel starts at "Views," silently assuming the buyer already opened the link — it skips whether the message even reached them. Requires webhook status from AiSensy/Interakt (delivery/read receipts) — see §7.

### 6.3 Buyers tab (currently just a count "1" — needs a real table)
Full per-buyer drill-down table:

| BUYER | WHATSAPP STATUS | OPENED CAMPAIGN | ORDERS | GMV | LAST ACTIVITY |
|---|---|---|---|---|---|

- WHATSAPP STATUS: Sent / Delivered / Read / Failed — pulled from the messaging provider webhook, not inferred.
- This absorbs and expands the "Per-buyer activity" widget currently shown on the Performance tab (same consolidation logic as §6.1 — one canonical buyer-level table, not a preview widget duplicated across tabs).
- Sort/filter by "Not yet opened" as a quick filter — this is the actionable view: which buyers in my target group haven't engaged, so I know who to nudge.

---

## 7. Data / Backend Dependencies (flag for engineering — not in this spec's UI-only scope)

- **WhatsApp delivery/read tracking** (§6.2, §6.3) requires a new field on however campaign shares are logged — e.g. `app.campaign_share_events(campaign_id, buyer_id, channel, status, provider_message_id, occurred_at)` populated via AiSensy/Interakt webhook. Not currently in the schema (per `DealFlow_Product-Spec_v1.md` §5.4). This is the one piece of this spec that isn't pure frontend — needs a small schema addition + webhook handler before §6.2/§6.3 can show real data. Flag as a fast-follow, ship §4–§6.1 first since those only touch existing tables (`published_catalogs`, `published_catalog_items`, `price_list_items`, `orders`).
- Everything else in this spec reads from tables that already exist (`app.published_catalog_items.price_override` is exactly the field the Campaign Price column edits).

---

## 8. Non-Goals

- No new feature flag — this ships under the existing `df_catalog_publishing` flag (table/RPC name unchanged; flag name intentionally not renamed to avoid churn on something invisible to sellers).
- No wizard/multi-step flow — single-page builder retained, just reordered and with pricing surfaced.
- No removal of Pricelists/Catalogs standalone pages.
- No changes to `resolve_price()` precedence order.

---

## 9. Rollout Sequence

| Phase | Scope |
|---|---|
| P0 | Campaign builder: inline Campaign Price column, bulk-adjust popover, avg. discount + price override count in summary sidebar |
| P1 | Campaign list: ending-soon chip, KPI zero-state distinction |
| P2 | Performance page: Products tab (real table), Buyers tab (real table) — both read from existing `orders`/`order_items`, no schema change needed |
| P3 | WhatsApp send/delivery funnel stage + status column — blocked on `campaign_share_events` table + webhook (§7) |

---

## 10. Open Questions for Phani

1. Should "visibility-only" campaigns (no discount, Campaign Price = Selling Base Price for every row) be visually labeled differently in the campaign list, e.g. "NEW ARRIVALS" style tag vs "OFFER" tag, so sellers/buyers both know at a glance whether there's a deal or just new stock?
2. For the ending-soon chip threshold — 3 days, or should it match campaign duration proportionally (e.g. last 15% of validity window)?
3. AiSensy vs Interakt — which is the confirmed WhatsApp provider for P3, since the webhook payload shape differs between them?
