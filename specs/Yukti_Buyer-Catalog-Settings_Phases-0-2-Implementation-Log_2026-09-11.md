# Yukti Buyer Catalog Settings: Phases 0-2 Implementation Log

Date: 2026-09-11
Commit: `a1b8e10b feat: add buyer catalog setup MVP`

Source specs:
- `specs/Yukti_Buyer-Catalog-Settings-Spec_v2.md`
- `specs/Yukti_Catalog-Enquiry-Modes_Product-Families-Spec_v1.md`
- Existing v1 onboarding/public catalog implementation

## Implementation Summary

Phases 0-2 were implemented as a Buyer Catalog Settings MVP around one canonical tenant catalog row in `app.catalogs`. The work reuses the existing public catalog/onboarding infrastructure instead of introducing new product-family or buyer-access tables.

The seller-facing canonical setup route is now `/catalog`, with `/catalogs` retained as a temporary redirect. The existing campaign/catalog composer area remains separate under the existing campaign-oriented routes and components.

The onboarding catalog setup has been upgraded to a 3-step flow:
1. Business basics and workflow preferences.
2. Product import and mapping review.
3. Catalog behavior, review, and publish.

The shared catalog setup contract now backs both `/api/tenant/catalog/setup` and the onboarding catalog endpoint, so future phases can build on a single loader/save path.

## Phase 0: Done

- Renamed seller navigation and page-title copy from "Catalogs" to "Catalog".
- Added canonical seller route:
  - `app/(seller)/catalog/page.tsx`
  - `app/(seller)/catalog/loading.tsx`
- Replaced the old seller `/catalogs` page with a redirect to `/catalog`.
- Updated seller mobile chrome active-label handling so `/catalog` and `/catalogs` both resolve to "Catalog".
- Updated dashboard/Pulse catalog setup nudges to point to `/catalog`.
- Preserved existing campaign/catalog-composer code paths under `/catalogs`-named API and component areas where they still represent campaign publishing workflows.

## Phase 1: Done

Schema migration added only the minimal persisted catalog behavior fields required for Phases 0-2:

- `app.catalogs.access_mode text not null default 'public_link'`
  - Allowed values: `public_link`, `approved_buyers_only`.
- `app.catalogs.collect_target_unit_price_range boolean not null default false`.
- `app.catalogs.product_display_mode text not null default 'sku_list'`
  - Allowed values: `sku_list`, `group_variants`.
- Extended `app.catalogs.pricing_mode` to include `hide_price_collect_enquiry`.
- Updated `app.catalogs_validate_pricing()` so:
  - `price_list_id` remains valid only for `assigned_price_list`.
  - `collect_target_unit_price_range = true` is valid only when `pricing_mode = 'hide_price_collect_enquiry'`.

Shared setup implementation:

- Added `src/lib/server/catalog-setup.ts` as the canonical server helper for:
  - Loading `CatalogSetupState`.
  - Creating/reusing the tenant's public catalog row.
  - Loading tenant basics.
  - Loading product summary and anomaly hints.
  - Loading price lists.
  - Reading and writing relevant existing `tenant_settings`.
  - Applying partial catalog/settings updates.
  - Handling publish intent.
- Added canonical API:
  - `GET /api/tenant/catalog/setup`
  - `PATCH /api/tenant/catalog/setup`
- Updated `/api/tenant/onboarding/catalog` to share/delegate catalog setup persistence rather than diverging.
- Added tests for API authorization, validation, SQL contract, and onboarding delegation behavior.

## Phase 2: Done

Onboarding UI:

- Refactored the existing `CatalogSetupClient` into a 3-step setup experience without replacing the broader onboarding shell.
- Added Step 0 for business basics:
  - Company/display name reference.
  - Business address.
  - WhatsApp contact/display name.
  - Demand mode.
  - Document creation mode.
- Kept product import/mapping as the middle step.
- Upgraded behavior/review step with plain-English choices for:
  - Price visibility.
  - Target rate collection.
  - Product display mode.
  - Access mode.
  - Buyer action mode.
  - Stock visibility only when relevant.
- Persisted catalog behavior to `app.catalogs`.
- Persisted business/workflow answers to existing `tenant_settings`.
- Added preview language for hidden-price enquiry mode, target-rate collection, and grouped-variant display.
- Added a detection-only variant grouping review prompt; no product-family persistence was added.

Seller catalog control center:

- Added `src/components/seller/catalog/CatalogControlCenterClient.tsx`.
- The `/catalog` page now hosts setup/review/publish controls using the shared setup API.
- The control center exposes the same core persisted catalog behavior fields as onboarding, so sellers can return after onboarding and adjust the canonical Buyer Catalog setup.

## Phase 3: Done

Phase 3 hardened the `/catalog` control center into the seller admin revision surface described in the v2 spec. No new tables, columns, or migrations were added.

Shared setup state now includes derived, read-only catalog operations data:

- Catalog `updated_at` for the setup summary's "Last updated" line.
- Product readiness counts:
  - active products
  - preview anomaly count
  - products missing images
- Customer Group brand restriction summary, derived from existing `app.cohorts.allowed_tenant_brand_ids`.

Seller catalog control center updates:

- Added a status card with live/not-live state, product count, Copy link, Open catalog, and Preview as buyer actions.
- Added a compact setup summary for access, pricing, target-rate collection, product display, and last updated.
- Moved individual settings behind inline edit controls, with the larger guided editor available through **Reconfigure catalog**.
- Preserved the right-side buyer preview and kept it wired to draft access/pricing/display changes.
- Added operational cards for:
  - Products summary and import link.
  - Photo readiness and upload-photo affordance.
  - Customer Group brand restriction summary and Customer Groups link.

Tests added/updated:

- Added `src/tests/catalog-control-center.test.tsx` for summary rendering, inline edits, hidden-price target-rate preview wiring, and customer-group restriction display.
- Extended `src/tests/catalog-setup-route.test.ts` for the expanded setup-state contract.

## Public Interfaces Landed

`CatalogPricingMode` now includes:

```ts
'hidden_until_login' | 'hide_price_collect_enquiry' | 'base_selling_rate' | 'assigned_price_list'
```

`CatalogSetupState` now includes the practical Phase 0-2 setup surface:

- Catalog status and live/share metadata.
- Access mode.
- Pricing mode.
- Target-rate flag.
- Product display mode.
- Product counts and anomaly hints.
- Price lists.
- Tenant basics.
- Workflow/settings values.
- Preview data.

`PATCH /api/tenant/catalog/setup` accepts partial updates for:

- Catalog fields.
- Existing tenant settings used by onboarding.
- Publish intent.

Validation currently covers:

- Seller-admin authorization.
- Seller-assistant rejection.
- Slug/status basics inherited from the existing catalog row.
- Pricing mode consistency.
- Price-list ownership/eligibility.
- Target-rate consistency.

## Deliberately Deferred

These items were intentionally not implemented in Phases 0-2:

- Buyer-side enforcement of `approved_buyers_only`.
- Buyer-side hidden-price enquiry submission flow for `hide_price_collect_enquiry`.
- Persistent product-family or variant-grouping tables.
- Persistent seller-curated product family/group definitions.
- Public catalog UI changes that fully hide or replace price rendering for all buyer browse/detail surfaces.
- Access request/approval flows for buyers blocked by approved-only catalogs.
- Cohort-specific catalog behavior policies.
- Any changes to the existing campaign/catalog composer data model.
- New tables for setup wizard state; the implementation uses `app.catalogs` plus existing `tenant_settings`.

## Identified Follow-On Work

Later phases should build from these anchors:

- Enforce `access_mode = 'approved_buyers_only'` in buyer catalog entry, browse, and product-detail APIs.
- Define the buyer UX for approved-only access:
  - Request access.
  - Pending approval.
  - Rejected/needs-more-info.
  - Existing approved buyer fast path.
- Wire `hide_price_collect_enquiry` into buyer catalog cards, detail pages, cart/enquiry paths, and order/enquiry creation.
- Decide whether "target unit price range" is collected at line-item level, enquiry level, or both.
- Add API tests around buyer-side pricing visibility once enforcement is implemented.
- Promote detection-only variant grouping into a persisted product-family model only when Phase 6 requires seller curation.
- Keep campaign publishing and Buyer Catalog settings separate in navigation and copy; any future convergence should be a product decision, not an accidental route reuse.
- Revisit public catalog cache keys/headers when access-mode enforcement lands, because approved-only responses will be buyer-specific.
- Add focused E2E/browser coverage for the `/catalog` control center after buyer-side enforcement exists.

## Data Model Notes

No new tables were added.

The only schema expansion is on `app.catalogs`, justified because these are canonical tenant catalog behavior choices rather than transient onboarding answers:

- `access_mode`
- `collect_target_unit_price_range`
- `product_display_mode`
- `pricing_mode = 'hide_price_collect_enquiry'`

Existing `tenant_settings` continues to carry onboarding/business workflow answers. Product-family review remains non-persistent in Phase 2.

## Verification

Focused tests passed before commit:

```bash
pnpm exec vitest run src/tests/onboarding/onboarding-api.test.ts src/tests/catalog-setup-route.test.ts src/tests/lib/app-catalogs-sql-contract.test.ts src/__tests__/seller/layout/SellerSidebar.test.tsx
```

Result: 4 test files, 39 tests passed.

Type check passed:

```bash
npx tsc --noEmit
```

Whitespace check passed on catalog-related paths:

```bash
git diff --check
```

## Known Workspace State After Commit

The Phase 0-2 commit intentionally excluded unrelated dirty/untracked work that was already present or developed outside this catalog-settings change. Later agents should not assume those files belong to the Phase 0-2 implementation.

Examples of excluded work at the time of commit included buyer approval/status UI, customer price-list changes, and campaign auto price-list override migration files.

## Phase 4: Done

Implemented buyer-side hidden-price enquiry mode for catalogs using `pricing_mode = 'hide_price_collect_enquiry'`.

Schema changes were kept narrow and reuse the existing estimates/enquiry model:

- Added `app.estimates.estimate_type` with `with_price` / `without_price`.
- Added `app.estimates.catalog_id` to preserve which live catalog produced the enquiry.
- Added `app.estimates.price_visibility` for `show_price` / `hide_price` provenance.
- Relaxed `app.estimate_items.unit_price` so hidden-price enquiry lines can carry `null` seller prices.
- Added `app.estimate_items.buyer_target_unit_price_min`, `buyer_target_unit_price_max`, and `buyer_note`.
- No new product-family, enquiry, or catalog-behavior tables were added.

Buyer catalog/product APIs now load the live public catalog context and suppress all buyer-visible price fields in hidden-price mode. Campaign price attribution is also suppressed for those catalog responses so buyers do not see a discounted price leak through a secondary field.

Buyer UI updates:

- Product cards and product detail pages render enquiry-first copy instead of price/subtotal copy.
- Add-to-cart creates hidden-price enquiry cart lines with `unit_price = null`.
- Mobile cart and desktop cart drawer become enquiry review surfaces in hidden-price mode.
- Cart totals, GST totals, delivery totals, order placement, campaign gap-fill widgets, and priced WhatsApp quote language are hidden/replaced for hidden-price enquiries.
- Confirmation copy shows enquiry language and omits total display for zero-price enquiries.
- Buyer enquiry/order detail surfaces show `Price pending` rather than `₹0` for hidden-price estimate lines.

Buyer estimate submission now branches by live catalog mode:

- Priced catalogs still resolve authoritative server-side prices through the existing pricing path.
- Hidden-price catalogs submit `without_price` estimates with zero header totals and nullable line prices.
- Hidden-price submissions skip immediate WhatsApp document sending because no priced document is ready.
- Hidden-price submissions still validate delivery/location, buyer access, stock routing, and catalogue context.

Seller estimate detail now surfaces buyer target-rate intent in a dedicated summary card when target ranges are present.

## Phase 5: Done

Implemented line-level target unit price range collection for hidden-price enquiries.

Product decision captured in code: target range is collected per enquiry line, not as a single enquiry-level field. This matches SKU-level negotiation better and avoids adding a new header-level structure before there is seller evidence that whole-enquiry range capture is useful.

Target-rate behavior:

- Buyer product detail accepts min/max target unit price when the catalog has `collect_target_unit_price_range = true`.
- Cart state preserves target bounds while quantities and product metadata are reconciled.
- Mobile cart allows editing target bounds per line before sending the enquiry.
- Desktop cart drawer preserves and submits target bounds captured before opening the drawer.
- Server validation requires both bounds or neither, finite non-negative values, and `max >= min`.
- Server validation rejects target bounds when the live hidden-price catalog does not enable target-rate collection.
- Seller estimate detail displays target rates beside the relevant line items.

## Phase 4-5 Verification

Type check passed:

```bash
npx tsc --noEmit
```

Focused tests passed:

```bash
pnpm exec vitest run src/tests/buyer-estimates-route.test.ts src/tests/buyer-cart-submit.test.tsx src/tests/buyer-product-card.test.tsx src/tests/product-detail-route.test.ts src/tests/buyer-document-detail.test.ts src/tests/load-buyer-transaction-detail.test.ts src/tests/estimate-detail-page.test.ts src/tests/lib/app-catalogs-sql-contract.test.ts --sequence.concurrent false
```

Result: 8 test files, 36 tests passed.

Whitespace check passed:

```bash
git diff --check
```

## Phase 4-5 Remaining Notes

- Mobile cart and desktop cart drawer both expose inline target-rate editing for hidden-price enquiry lines when target-rate collection is enabled.
- Hidden-price estimate PDF/document generation remains deferred; buyer and seller detail pages show pending prices in-app.
- The broader workspace still contains unrelated dirty work from other active streams; these Phase 4-5 notes only describe the buyer hidden-price enquiry and target-rate implementation.
