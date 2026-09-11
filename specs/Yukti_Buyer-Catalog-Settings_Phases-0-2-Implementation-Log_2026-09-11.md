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
