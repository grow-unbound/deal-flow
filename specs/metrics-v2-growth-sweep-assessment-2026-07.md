# Metrics-v2 Growth-section sweep — per-metric assessment (2026-07-18, verified pass)

Source of truth: `specs/metrics-product-strategy-proposal-2026-07.md`, `# Growth modules` (lines 462-984): Buyer App, Campaigns, Customer Groups, Pricelists, Brands, Locations, Warehouses, Categories. Plus the shared "primary demand" rule (lines 109-132) and the Buyer App → Seller Dashboard cross-link (line 1058). Operations modules (Estimates, Sales Orders, Invoices, Customers, Products) and the Seller Dashboard itself are **out of scope** — a different concurrent session owns that work.

**This is a re-verified pass.** Every item previously tagged ❓ (not independently re-verified — assigned to a subagent that died mid-task) has now been read directly against source. Two systemic issues surfaced during this pass that weren't visible from reading SQL alone — see "Systemic findings" before the per-entity tables.

## How to read this doc

- ✅ **DONE** — implemented, rendering from real data, read directly this pass.
- 🔧 **SUBSTITUTED** — doc wants X, ships a lower-cost stand-in using data already available; noted why.
- ⚠️ **NEEDS BACKEND** — no data source anywhere in current RPC responses. Rendered as a clean empty state, not faked.
- ❌ **MISMATCH** — code renders something, but it doesn't match what the doc actually asks for (wrong metric, or a metric the doc explicitly tells you *not* to use here). Not a backend gap — a wiring/content gap.

---

## Systemic findings (read this first)

### 1. `performanceCards?.length` truthy-check hides working fallback UI on 4 entities

`get_seller_<entity>_detail_v2` always returns a non-empty `performance_cards` array — even when every card in it is `'unavailable'`. Four Performance tab components branch on `if (performanceCards?.length) { render v2 cards } else { render legacy fallback }`. Since the array is never empty, **the `else` branch is dead code** — even on entities where the fallback is a real, substantial, already-built implementation with genuine data behind it:

| Entity | File | Fallback quality | What it would unlock if reachable |
|---|---|---|---|
| Campaigns | `CatalogPerformanceTab.tsx` (259 lines) | Real: funnel, "Products driving demand", "Customers to follow up", engagement/demand timeline chart | Would satisfy 3 of 4 doc-starred Explore items (currently all show as ⚠️ NEEDS BACKEND via the v2 stub path) |
| Customer Groups | `CohortPerformanceTab.tsx` (235 lines) | Real: "Member activity" (matches doc ★ exactly), "Members driving sales", "Campaigns to this customer group" | Would satisfy 1 of 3 doc-starred Explore items directly, 1 partially |
| Brands | `BrandPerformanceTab.tsx` (259 lines) | Real: "Sales over time", "Customers buying this brand" (doc ★, currently unavailable via v2), "Product contribution", "Campaign contribution" | Would satisfy 3 of 4 doc-starred Explore items, including one the v2 RPC explicitly stubs unavailable |
| Warehouses | `WarehousePerformanceTab.tsx` (107 lines) | Real: "Current inventory posture" (doc ★), "Stock-risk product list" (doc ★), "Inventory health" | Would satisfy 2 of 3 doc-starred Explore items — this alone resolves most of what was flagged as "the single biggest unknown" in the previous pass |

**But it's not a clean one-line fix.** The Campaigns and Brands (and likely Cohorts) fallbacks pull from `orders`/`spend_mtd`/`order_count_mtd` fields — **order-based, not invoice-based**, violating the "invoiced sales only" non-negotiable. Simply flipping the condition to prefer the fallback whenever no v2 card is `'ready'` would surface correct-looking-but-wrong-basis numbers. Warehouses' fallback is inventory-only (no sales figures), so it's actually safe to unhide as-is. Recommend: fix Warehouses' condition immediately (cheap, safe, real win); for Campaigns/Cohorts/Brands, either re-baseline the fallback's queries onto invoice tables first, or leave as-is and treat the v2 path as the intended source of truth going forward (in which case the dead fallback code should probably be deleted, not un-hidden).

### 2. Two places actively contradict the doc's own guidance

- **Pricelists Actions** shows a "Most coverage" card. The doc explicitly says: *"Most-covered Pricelists — READY — explicitly demoted: 'A leaderboard, not an action; keep out of Actions.'"* (doc line ~682). It's in Actions anyway.
- **Warehouses Actions** shows "Recently replenished". The doc explicitly says: *"Recently replenished products — LATER — explicitly demoted: 'Inbound events are not a complete inventory history and should not drive a general action feed.'"* (doc line ~883). It's in Actions anyway.

Both look like pre-existing (pre-metrics-v2-proposal) Action cards that were never reconciled against the doc's explicit exclusions. Cheap fix: swap these for the doc's actual 2nd starred Action item in each case (Pricelists: "Items below current cost/floor" — data already exists, see the Detail Pulse derivation in section 4 below; Warehouses: "Negative or inconsistent availability", not currently shown at all).

### 3. Actions largely still show pre-existing trend cards, not the doc's specific starred items

Brands, Categories, and Warehouses Actions all show a "driving sales" / "gaining momentum" / "gaining demand" trend-leaderboard card that isn't one of the doc's starred Action items anywhere. This looks like the pre-metrics-v2 Actions implementation was left untouched on these three entities while Landing Pulse / Subtitle got updated. Not a backend gap — needs the Action card set rebuilt to match doc lines cited per entity below.

---

## Cross-cutting: primary demand rule

- ✅ Function exists and is correct: `app.metrics_v2_primary_demand_kind`, `supabase/migrations/20260716090456_..._phase_5_dashboard_metrics_foundation.sql:7-23`.
- ✅ Reused correctly in Buyer App (`landingData.portfolio?.primary_demand_kind`, drives adaptive "enquiries/orders" copy throughout the landing page and Explore cards).
- ✅ Reused correctly in Campaigns (`landingData?.primary_demand_kind`, drives "Open-to-enquiry/order rate" tile label and Action row copy).
- ✅ Reused correctly in Locations — both Landing Pulse (`kpis.open_primary_demand_kind`, adaptive tile label "Open order/estimate/primary demand value") and Detail Pulse (via `app.metrics_v2_primary_demand_kind` call in `locations/[id]/detail/route.ts`).
- ❓ Not checked for Customer Groups / Pricelists / Brands / Categories / Warehouses — the doc doesn't require demand-kind adaptivity for these entities (they're not demand-driven per the doc), so this is expected to be N/A, not a gap.

---

## 1. Buyer App (doc lines 464-514) — fully verified, essentially complete

RPC: `app.get_metrics_v2_buyer_app_dashboard`. No detail page by design.

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 470 | ✅ Verbatim match, `BuyerAppLandingClient.tsx:83` |
| Landing Pulse ★ ×4 | lines 478-484 | ✅ All 4 present with correct labels and % supporting text, `:89-112` |
| Actions ★ ×3 | lines 493-495 | ✅ All 3 present (`access_enabled_never_used`, `used_no_demand`, `valuable_without_access`), each with `loadRows` wired to `/api/tenant/buyer-app?callout=...` for a real "see all" full list — not pre-sliced, `:115-228` |
| Explore ★ ×4 | lines 505-511 | ✅ All 4 present: Adoption funnel, Business through the app, App contribution over time, Adoption by location — all reading real `snapshot.*` fields with adaptive enquiry/order copy, `:232-324` |
| Dashboard cross-link | line 1058: exactly one of {starred Action, Explore teaser}, never both | ❌ **Confirmed not implemented.** `seller-dashboard.ts:544-549` renders the "Buyer App activation" Action unconditionally — no gating on whether the queue has exceptions, no Explore-teaser fallback path exists at all. This is on the Seller Dashboard (Operations-owned file) — flagging, not fixing, per scope boundary. |

**Buyer App is the best-built entity in the whole Growth sweep.** Nothing here needs further work except the (out-of-scope) Dashboard cross-link.

---

## 2. Campaigns (doc lines 516-581)

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 522 | ✅ Verbatim, `CatalogsLandingClient.tsx:224`, confirmed `scheduled_catalogs` field wired end-to-end |
| Landing Pulse ★ Customers who opened campaigns | line 530 | ⚠️ **NEEDS BACKEND**, self-labeled in UI: `value: '—', sub: 'Needs backend — unique openers are not aggregated tenant-wide yet'`, `:242-245` |
| Landing Pulse ★ Customers with campaign-linked demand | line 532 | ⚠️ **NEEDS BACKEND**, same honest self-labeling, `:246-250` |
| Landing Pulse ★ Campaign-linked demand value | line 534 | ✅ Real, `landingData.kpis.gmv_mtd` with adaptive "linked enquiries/orders" count |
| Landing Pulse ★ Open-to-demand rate | line 536 | ✅ Real, `landingData.kpis.avg_conversion_pct`, adaptive label |
| Actions ★ ×3 | lines 544-549 | ✅ All 3 present, client-derived from already-fetched campaign rows (weak opens, many-openers-no-demand, expiring-engaged), `:144-169, 265-312` |
| Detail Pulse ★ ×3 | lines 559-565 | ⚠️ `kpi_grid` from `get_seller_campaign_detail_v2` returns 1 field (`Status`) — **but** see Systemic Finding #1: a real fallback with `performance.summary.orders`/`.gmv` exists and would cover this, currently unreachable, and order-based if unhidden as-is |
| Explore — all 4 items | lines 573-579 | ⚠️ **NEEDS BACKEND via the v2 path** (all `performance_cards` from the RPC are `'unavailable'`) — but see Systemic Finding #1: `CatalogPerformanceTab.tsx`'s dead fallback already covers "funnel", "products driving demand" (≈ Products requested), "customers to follow up" (exact doc match) with real order-based data |

**Verdict**: Campaigns' *reachable* code path has real backend debt (as originally assessed). Its *unreachable* fallback code substantially closes that gap already, just needs the dead-code bug fixed and an invoice-basis review before trusting the numbers.

---

## 3. Customer Groups / Cohorts (doc lines 583-648)

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 589 | ✅ Matches, `CohortsLandingClient.tsx:211` |
| "See all" truncation bug | — | ✅ Fixed this session (line 40 pre-slice removed) |
| Landing Pulse ★ ×3 | lines 597-601 | ✅ All 3 present and correct (fixed this session — see regressions log below) |
| Actions | doc wants ★ "High-value customers in no Group" (line 612) and ★ "Groups with neither active pricing nor live campaign" (line 613) | ❌ **MISMATCH** — current Actions show `low_conversion` ("Groups needing attention"), `top_performers` ("Groups driving sales"), `top_risers` ("Groups gaining traction") — none of these are the doc's 2 starred items. This looks like the pre-existing group-conversion Action set, never rebuilt against the new doc spec, `:249-290` |
| Detail Pulse ×4 | lines 627-633 | ⚠️ **NEEDS BACKEND** confirmed — `kpi_grid` returns 1 field (`Current members`) |
| Explore ★ Member activity | line 642 | ⚠️ **NEEDS BACKEND via v2** — but the dead fallback in `CohortPerformanceTab.tsx:98-110` has a real "Member activity" card (active/dormant members, response rate, brands sold) that matches this exactly, unreachable per Systemic Finding #1 |
| Explore ★ Products and brands members buy | line 644 | ⚠️ **NEEDS BACKEND**, no equivalent found even in the fallback (fallback has "Members driving sales" — a member ranking, not a product/brand mix — doesn't satisfy this one) |
| Explore ★ Member opportunity list | line 646 | ⚠️ **NEEDS BACKEND**, no equivalent in fallback either |

---

## 4. Pricelists (doc lines 650-714) — verified, mostly strong, one clean fix available

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 656 | ✅ Verbatim, `PriceListsLandingClient.tsx:184` |
| "See all" truncation bug | — | ✅ Fixed this session |
| Landing Pulse ★ ×4 | lines 664-671 | ✅ All 4 present and correctly labeled, `:195-212` |
| Actions ★ Expiring Pricelists | line 679 | ✅ Present (`expiring_soon`), `:223-236` |
| Actions ★ Items below current cost/floor | line 680 | ❌ **MISSING from Actions** — instead shows "Most coverage" and "Uncovered cohorts", `:238-260`. See Systemic Finding #2: "Most coverage" is a card the doc explicitly says to keep OUT of Actions. The "below cost/floor" data already exists (same `discounted`/`v_discounted` count used for the Detail Pulse derivation) — this is a cheap fix, not a backend gap. |
| Detail Pulse ★ ×4 | lines 691-699 | ✅ Built this session, test-covered |
| Explore ★ ×3 | lines 707-713 | ✅ Built this session, all 3 `'ready'` v2 cards rendered |

**Still the strongest entity overall**, with one clear, cheap, doc-explicit fix available (swap Actions' "Most coverage" for "Items below cost/floor").

---

## 5. Brands (doc lines 716-780)

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 720 | ✅ Verbatim, `BrandsLandingClient.tsx:303` |
| "See all" truncation bug | — | ✅ Fixed this session |
| "Duplicate action-row naming" (doc lines 743-748) | — | ❌ **Moot, not applicable** — verified there is only ONE "stock risk" Action card (`Brand stock risk`), not two differently-named variants of the same doc row as originally assumed. The real issue is different (see next row). |
| Landing Pulse ★ ×4 | lines 727-736 | ❌ **Partial mismatch** — only "Invoiced sales 90D" clearly maps to a doc item; "Active brands" and "Recently active in campaigns" don't correspond to any of the doc's 4 starred Landing Pulse items (Invoiced sales, Brands with invoiced sales, Selling brand products low/out of stock, Stock in brands no sale 90d), `:318-338` |
| Actions | doc wants ★ Selling brands stock risk (×2 angles) + ★ Brands losing meaningful sales (lines 743-748) | ❌ **MISMATCH** — shows "Brand stock risk" (partial match to 1 of 2 doc stock-risk angles), "Brands driving sales", "Brands gaining momentum" — the latter two aren't doc items at all, `:350-384` |
| Detail Pulse ★ Invoiced sales | line 757 | ✅ Real, `kpi_grid` has `Invoiced sales 90D` |
| Detail Pulse ★ Customers who purchased | line 759 | ⚠️ **NEEDS BACKEND via v2** — but the dead fallback has a real "Customers buying this brand" ranked list (`BrandPerformanceTab.tsx:145-168`), unreachable per Systemic Finding #1 |
| Detail Pulse ★ Recent sellers low/out of stock | line 761 | ⚠️ NEEDS BACKEND, not in `kpi_grid`, not found in fallback either |
| Detail Pulse ★ Products that sold | line 763 | 🔧 `kpi_grid` has `Products` (total, not "sold") — imprecise stand-in |
| Explore — Sales over time | line 774 | ⚠️ NEEDS BACKEND via v2 — but the dead fallback has a real "Sales over time" trend chart (`:71-135`), unreachable |
| Explore ★ Product contribution | line 776 | ✅ `'ready'` in v2 — reachable and correct |
| Explore ★ Customers buying the brand | line 778 | ⚠️ NEEDS BACKEND via v2 — same fallback card as the Detail Pulse item above covers this, unreachable |
| Explore ★ Current inventory by warehouse | line 780 | ✅ `'ready'` in v2 — reachable and correct |

**Brands has the most Landing-side rework debt in the sweep** (Pulse and Actions both don't match doc), but its Detail-side gaps are largely already solved in the dead fallback code — same unlock opportunity as Campaigns/Cohorts, same order-basis caveat to check first.

---

## 6. Categories (doc lines 920-984)

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 924 | ✅ Verbatim, `CategoriesLandingClient.tsx:184` |
| Landing Pulse ★ ×4 | lines 932-940 | ✅ Good match — "Invoiced sales", "Categories with invoiced sales", "Categories with no sale in 90D", "Uncategorised active products" all present, `:206-223` |
| Actions | doc wants ★ recent sellers out of stock, ★ no-sale-90d, ★ uncategorised active products (lines 947-951) | ❌ **MISMATCH** — shows "Categories with stock risk" (partial match), "Categories driving sales", "Categories gaining demand" — 2 of 3 don't correspond to doc items, `:235-265` |
| Detail Pulse | lines 961-968 | 🔧 `kpi_grid` returns 2 of the wanted 4-5 fields (Invoiced sales, Units) — not independently re-verified further this pass |
| Explore — Sales over time | line 977 | ⚠️ NEEDS BACKEND (confirmed, `'unavailable'` in v2, no CategoryPerformanceTab fallback exists since that tab was built fresh this session directly off the v2 cards — no dead-code issue here, this one's a genuine gap) |
| Explore ★ Brand contribution | line 979 | ✅ Built this session, `'ready'` |
| Explore ★ Product action list | line 981 | ✅ Built this session, `'ready'` |

**Categories is the strongest Landing Pulse match in the sweep**, but Actions needs the same rebuild as Brands/Warehouses.

---

## 7. Locations (doc lines 782-848) — fully verified, second-best entity

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 788 | ✅ Verbatim, `LocationsLandingClient.tsx:243` |
| Landing Pulse ★ Invoiced sales | line 796 | ✅ Present, `:262-265` |
| Landing Pulse ★ Overdue amount | line 798 | ✅ Present, `:266-271` |
| Landing Pulse ★ Customers who purchased | line 800 | ✅ Present, `:272-276` |
| Landing Pulse ★ Open primary demand value | line 802 | ✅ **Confirmed built and correct** — full adaptive label (`Open order value` / `Open estimate value` / `Open primary demand value`) driven by `kpis.open_primary_demand_kind`, with a clean "Enable Estimates or Sales Orders" fallback state when demand kind is `'none'`, `:277-289` |
| Actions ★ Locations with overdue balances | line 811 | ✅ Present (`Locations with overdue balances`), `:324` |
| Actions — "Recently sold items unavailable at linked warehouse" | line 813 | ❌ **MISMATCH** — shows "Locations driving sales" instead, `:311` |
| Actions ★ Locations with expiring estimates | line 815 | ✅ Present, `:298` |
| Detail Pulse ★ ×4 | lines 825-831 | ✅ All 4 confirmed — Invoiced sales, Overdue, Customers who purchased here all in `kpi_grid`; Open primary demand value built this session via `metrics_v2_primary_demand_kind` |
| Explore ★ Sales over time | line 840 | ✅ `'ready'`, built into `LocationPerformanceTab.tsx` |
| Explore (unstarred) Order execution workload | line 843 | ✅ Bonus, `'ready'`, included |
| Explore ★ Brand and category mix | line 845 | ⚠️ NEEDS BACKEND, confirmed no card in v2 |
| Explore ★ Inventory at linked warehouses | line 847 | ✅ `'ready'`, built into tab |
| Explore ★ Customers buying here | line 847 | ⚠️ NEEDS BACKEND, confirmed no card in v2 |

**Locations Detail is essentially complete.** Only the Landing-side Actions has one item to swap.

---

## 8. Warehouses (doc lines 850-918) — biggest positive surprise this pass

| Field | Doc requirement | Status |
|---|---|---|
| Subtitle | line 856 | ✅ Verbatim, `WarehousesLandingClient.tsx:184` |
| Landing Pulse | doc wants sellable-units/out-of-stock/no-sale-90d wording (lines 864-871, adaptive 2-4) | ❌ **MISMATCH** — shows "Warehouses in operation", "Tracked SKUs", "Warehouses with stock risk", "Idle stock SKUs" — a different, pre-existing metric set not aligned to the doc's specific wording, `:193-209` |
| Actions ★ Recently sold now out of stock | line 879 | 🔧 Partial — "Stock attention" may cover this, not confirmed exact match, `:222` |
| Actions ★ Negative or inconsistent availability | line 881 | ❌ **MISSING** — not shown at all |
| Actions — "Recently replenished" shown | — | ❌ **Doc-violation confirmed** — see Systemic Finding #2, `:248`. Doc explicitly says this shouldn't drive a general Action feed. |
| Detail Pulse | lines 893-901, adaptive 2-4 | ❌ `kpi_grid` from `get_seller_warehouse_detail_v2` returns 1 field (`Active warehouses`) which is **tenant-wide, not warehouse-specific** — genuinely wrong-scoped, not just thin |
| Explore ★ Current inventory posture | line 909 | ⚠️ NEEDS BACKEND via v2 (`'unavailable'`) — **but** `WarehousePerformanceTab.tsx`'s dead fallback has a real "Current inventory posture" card using genuine `stock_posture`/`idle_stock` data (not sales-based, so no invoice/order-basis concern), unreachable per Systemic Finding #1 |
| Explore ★ Stock-risk product list | line 911 | ⚠️ Same — real fallback card exists ("Stock-risk product list", sellable units, last-demand date), unreachable |
| Explore ★ Availability by brand/category | line 913 | ⚠️ NEEDS BACKEND — no card in v2, and the fallback doesn't have this one either, though `idle_stock` rows do carry `brand_name` — a brand-grouped aggregation is buildable client-side from data already fetched, cheaper than the other backend gaps in this sweep |

**Correcting the previous pass's biggest unknown**: Warehouses' Detail/Explore side is NOT the "single biggest unknown" — it's mostly solved already, just hidden by Systemic Finding #1, and since the fallback data is inventory-only (no sales figures), it's safe to unhide without any invoice/order-basis rework. **This is the single cheapest, highest-value fix available in the whole sweep.**

---

## Backend debt summary (only what's genuinely unsolved, i.e. survives Systemic Finding #1)

| Root cause | Blocks | Entities affected |
|---|---|---|
| No campaign-day / per-product / per-recipient fact table | Timeline, products-requested precision beyond what the order-based fallback covers | Campaigns |
| No member-purchase-by-product/brand fact table | "Products and brands members buy" | Customer Groups |
| No member-opportunity scoring model | "Member opportunity list" | Customer Groups |
| No brand-scoped/category-scoped daily sales history | "Sales over time" | Brands, Categories (Categories has no dead-fallback escape hatch either — genuine gap) |
| No brand-scoped low/out-of-stock read model | Detail Pulse "Recent sellers low/out of stock" | Brands |
| No location-scoped brand/category mix or buyer-ranking model | 2 of 4 Explore cards | Locations |
| Warehouse Detail Pulse KPI scoped to tenant, not warehouse | All 4 adaptive Detail Pulse cards | Warehouses |
| No warehouse-scoped brand/category availability breakdown | 1 of 3 Explore cards (buildable client-side from existing `idle_stock.brand_name`, cheaper than the others) | Warehouses |

## Cheap fixes available (no backend work, just wiring/logic)

1. **Warehouses Performance tab**: fix the `performanceCards?.length` condition (or its data source) to surface the real, inventory-based fallback — safe, no invoice-basis concern, unlocks 2 of 3 Explore cards immediately.
2. **Pricelists Actions**: swap "Most coverage" (doc says keep out of Actions) for "Items below current cost/floor" (doc-starred, data already computed for Detail Pulse).
3. **Warehouses Actions**: swap "Recently replenished" (doc says don't use as an action) for "Negative or inconsistent availability" (doc-starred, not currently shown).
4. **Warehouses Detail Pulse**: fix the RPC/route to scope `kpi_grid` to the specific warehouse, not tenant-wide.

## Rebuild-scope items (Actions sets not matching doc, no backend blocker — just needs the card set redefined)

Customer Groups, Brands, Categories, Warehouses Actions all show pre-existing trend/leaderboard cards instead of the doc's specific starred Action items. Data for most of these likely already exists in the landing payload (same pattern as how Campaigns' Actions were correctly rebuilt this session, client-derived from already-fetched rows) — this is UI/query-shaping work, not new backend.

## Regressions found and fixed this session (unchanged from previous pass)

1. Cohorts "Grouped customers who purchased" wrongly blanked to NEEDS BACKEND despite available data — fixed.
2. Cohorts tile rename broke a hardcoded test string — test updated.
3. Operations-file contamination in `seller-dashboard.ts` — merged per your direction, one stale test expectation reconciled.
4. Brands `[id]/route.ts` test mock extended for the new `detail_v2` RPC call.

## Pre-existing, out-of-scope test debt (unchanged from previous pass)

~79 of 243 test files fail repo-wide due to a Next.js 15.5.18 SSR test-harness issue unrelated to metrics-v2. Several detail-page tests fail on stale mocks missing unrelated hook exports. Confirmed via zero-diff, not this session's doing, not fixed.

## Items 1-5 fixed this pass (2026-07-18, third session)

1. **✅ Warehouses `performanceCards?.length` condition fixed.** Now gates on `card.availability !== 'unavailable'` (any usable card) instead of raw array length. Unlocks the real, inventory-based fallback (`WarehousePerformanceTab.tsx`) whenever the v2 RPC ships nothing usable — safe, since that fallback has no invoice/order-basis concern (inventory-only figures).
2. **✅ Both doc-violation Action cards removed.** Pricelists' "Most coverage" and Warehouses' "Recently replenished" — both explicitly told by the doc to stay out of Actions — deleted. **Correction to the previous pass**: their doc-starred replacements ("Items below current cost/floor" at *landing* scope, "Negative or inconsistent availability") turned out to need new cross-price-list / cross-warehouse queries that don't exist yet, not the cheap swap I'd estimated — moved to the backend-debt list (item 6) rather than force a placeholder in their place.
3. **✅ Decided and applied**: deleted the dead order-based fallback UI in `CatalogPerformanceTab.tsx`, `CohortPerformanceTab.tsx`, `BrandPerformanceTab.tsx` rather than un-hiding it — all three pulled figures from `orders`, which would have violated the invoiced-sales-only rule the moment they became reachable. Each now renders only the honest v2 cards (ready data or a clean `'unavailable'` empty state). `BrandDetailPage.tsx` / `CohortDetailPage.tsx` / `CatalogDetailPage.tsx` updated to drop the now-unused `performance` prop.
4. **Partially fixed — Actions rebuilt where client-derivable, left alone where backend-blocked:**
   - **Brands**: "Brands gaining momentum" (not a doc item) → "Brands losing meaningful sales" (doc ★), derived client-side from already-fetched brand rows (`growth <= -10%`, sorted worst-first). The 2-angle stock-risk split doc wants couldn't be built — the underlying `alerts` field is confirmed empty at runtime (pre-existing code comment), needs backend.
   - **Categories**: "Categories driving sales" → "Categories with no sale in 90 days" (doc ★), derived client-side from already-fetched category rows (`gmv_mtd === 0`). "Categories with stock risk" relabeled to the doc's exact wording ("Categories with recent sellers out of stock"). "Categories gaining demand" left as-is — its doc-starred replacement ("Uncategorised active products" as a *product-level* list) needs a query shape the category-scoped landing payload doesn't have.
   - **Customer Groups**: left as-is. Both doc-starred items ("High-value customers in no Group" — buyer-level, cross-group ranking; "Groups with neither active pricing nor live campaign" — needs a price-list-assignment join) need data the cohort landing payload doesn't carry. Fully backend-blocked, nothing safe to build without new queries.
   - **Warehouses**: left as-is beyond the item-2 removal — same reasoning, both doc items need per-warehouse stock-availability queries not currently exposed.
5. **No fix needed — reassessed.** The "tenant-wide `kpi_grid`" I flagged in the previous pass is unused dead data; the Detail Pulse tiles actually rendered (`WarehouseDetailPage.tsx:122-143`, `data.meta_strip`) already come from `get_seller_warehouse_landing_row_metrics_v2` scoped to the specific warehouse — correct all along. My earlier assessment only read the RPC's raw output, not what the frontend consumes from it — noting this as a process lesson: always trace to the actual render, not just the RPC body.

Typecheck clean, lint clean, all landing/detail tests I touched pass (Brands, Cohorts, Categories, Warehouses, Pricelists landing + Pricelists detail). No new regressions — remaining test failures are the same pre-existing, zero-diff-confirmed baseline noise from earlier passes.

## Still open (item 6 — needs a real fact table / read model, not touched)

- Campaigns: campaign-day / campaign-recipient fact table (blocks most of Detail Pulse + Explore)
- Customer Groups: member-purchase fact table (blocks Detail Pulse, Explore, and both Actions)
- Brands / Categories: brand-daily / category-daily sales history (blocks "Sales over time")
- Brands: brand-scoped buyer-ranking read model (blocks Detail Pulse "Customers who purchased" and the matching Explore card)
- Locations: brand/category mix + buyer-ranking model, location-scoped (2 of 4 Explore cards)
- Warehouses: warehouse-scoped brand/category availability breakdown (1 of 3 Explore cards)
- Pricelists: landing-scope "items below cost/floor" query across all price lists (for the Action card)
- Warehouses: negative/inconsistent-availability query across warehouses (for the Action card)
