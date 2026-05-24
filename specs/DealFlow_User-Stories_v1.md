# DealFlow — Full Product Backlog (Claude Code Story Architect)

**Spec version:** DealFlow_Product-Spec_v1 (rev 2026-05-19)
**Story format:** 4-part BDD schema for autonomous Claude Code agent consumption
**Total stories:** 63 across 12 epics

---

## Story ID Convention

```
EP-{EPIC_NUM}-{STORY_NUM}
```

Each story is self-contained and implementable in a single feature-branch session.
All UI stories must use **Ember & Cream** design tokens from `src/lib/theme/tokens.ts`.
All backend stories must respect **RLS + multitenant isolation** from day one.

---

## Epic Index

| Epic | Module | Feature Flag | Stories |
|------|--------|-------------|---------|
| EP-01 | Tenant Onboarding | `df_tenant_onboarding` | 5 |
| EP-02 | Brand & Product Master | `df_brand_product_master` | 8 |
| EP-03 | Customer Master | `df_customer_master` | 5 |
| EP-04 | Cohort Builder | `df_cohorts` | 4 |
| EP-05 | Pricing Engine | `df_pricing_engine` | 5 |
| EP-06 | Catalog Publishing | `df_catalog_publishing` | 6 |
| EP-07 | Buyer PWA | `df_buyer_app` | 9 |
| EP-08 | Order Management | `df_order_management` | 5 |
| EP-09 | Tally CSV Export | `df_tally_export` | 3 |
| EP-10 | Search | `df_search` | 4 |
| EP-11 | RBAC + Multitenant Security | *(cross-cutting)* | 5 |
| EP-12 | Zoho Integration | `df_zoho_integration` | 4 |

---

---

# EPIC 01 — Tenant Onboarding

---

### EP-01-001 — Distributor Sign-Up & Tenant Creation

#### 1. Objective & User Value
- **As a** distributor business owner, **I want to** register my business and create a DealFlow account, **so that** I have an isolated tenant workspace for managing my brands, products, and buyers.

#### 2. Acceptance Criteria (Functional Boundaries)
- User can sign up with email + password via Supabase Auth; a new row is created in `app.tenants` and `app.tenant_users` (role = `seller_admin`) within the same transaction.
- If the chosen `slug` is already taken, display an inline validation error: *"This business URL is already in use. Try a different one."*
- The `subdomain` field on `app.tenants` is auto-derived from the slug (e.g., slug `wineyard` → subdomain `wineyard.dealflow.in`); it must be unique.
- After successful registration, the user is redirected to the Seller Cockpit dashboard (`/dashboard`) with a first-run onboarding banner visible.
- Feature flag `df_tenant_onboarding` must be enabled for this route; if disabled, show a *"Coming soon"* holding page.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Public route `/signup` — outside `SellerShell`, full-bleed auth layout.
- **Design Tokens:** Page background `bg-cream-50`. Form card uses `shadow-md` with border-radius `rounded-lg` (14px). Primary CTA *"Create my workspace"* uses `bg-teal-500 text-cream-50` with `<Plus/>` lucide icon left of label (16px).
- Input fields use `border-cream-300` with focus ring `ring-ember-400`. Error states render in `text-danger-500` below each field.
- Typography: form heading uses `font-display` (Fraunces), body copy uses `font-sans` (Inter).
- Must use existing `shadcn/ui` Input, Button, Form components — no custom styled primitives.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=auth/signup
npm run test:integration -- --testPathPattern=tenant-creation
npx supabase test db  # verify RLS policy on app.tenants allows self-insert
npm run lint
```

---

### EP-01-002 — Tenant Business Profile Setup

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** complete my business profile (GSTIN, primary state, plan), **so that** my tenant is correctly configured for Indian tax compliance and branding.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form captures: `business_name`, `gstin` (optional, 15-char alphanumeric format validated), `primary_state` (dropdown of Indian states), `plan` defaults to `starter`.
- GSTIN format validation runs client-side on blur and server-side on save; invalid format shows: *"GSTIN must be 15 characters in format: 22AAAAA0000A1Z5."*
- Changes persist to `app.tenants` via an RPC callable only by `seller_admin` of the tenant.
- Settings page is accessible from the Seller Cockpit sidebar under **Settings → Business Profile**.
- Saving displays a non-blocking success toast using the existing toast primitive.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/settings/profile` — rendered inside `SellerShell`.
- **Design Tokens:** Section card uses `bg-cream-100 border border-cream-300 rounded-lg`. Save CTA *"Save changes"* uses `<Save/>` icon + label, `bg-teal-500`.
- Indian state dropdown uses `shadcn/ui Select` with `font-mono` for the GSTIN input field (monospace for code-like data).
- Empty GSTIN state renders a helper text in `text-cream-600` font-size `text-sm`.
- Must use existing shadcn/ui Form, Select, Input components only.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=settings/profile
# Validate GSTIN regex: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
npm run lint
npx tsc --noEmit
```

---

### EP-01-003 — Invite Seller Team Members

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** invite colleagues by email with a defined role, **so that** my team can collaboratively manage products and orders without sharing my login.

#### 2. Acceptance Criteria (Functional Boundaries)
- Add a new navbar item in seller app called `Users & Roles` visible only to `seller_admin` 
- Show Users as a table with User properties (Full Name, Phone, Email, Role, Status)
- Allow CRUD on Users and updating roles; Add `Add User` CTA and allow to add new Users; Reuse form for Edit User as well
- Admin enters an email address and selects a role (`seller_admin` or `seller_assistant`) from a radio group or select.
- On submit, a Resend transactional email is sent with a magic invite link; a pending row is inserted into `app.tenant_users` with `is_active = false` and `invited_at` set.
- If the email is already an active user of this tenant, display: *"This user is already a member of your workspace."*
- Invited user accepts via the link → Supabase Auth account created (if new) → `tenant_users.is_active` set to `true`, `joined_at` populated.
- Admin can see a list of pending and active members with their roles in **Settings → Team**.
- Only `seller_admin` can access this page; `seller_assistant` sees a disabled/hidden invite button.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/settings/team` inside `SellerShell`.
- **Design Tokens:** Invite form in a `bg-cream-100 rounded-lg shadow-xs p-6` card. *"Send invite"* CTA: `<UserPlus/>` icon + label, `bg-teal-500`.
- Member list rows use alternating `bg-cream-50` / `bg-cream-100`. Role chip: `seller_admin` → `bg-teal-100 text-teal-700`, `seller_assistant` → `bg-cream-200 text-cream-700`. Pending members show a `bg-amber-100 text-amber-700` *"Pending"* badge.
- Must use existing shadcn/ui Badge, Table, Button, Input components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=settings/team
npm run test:integration -- --testPathPattern=invite-flow
# Verify Resend mock receives correct template payload
npm run lint
```

---

### EP-01-004 — Feature Flag Scaffold (PostHog)

#### 1. Objective & User Value
- **As a** solo founder, **I want** every major module gated behind a PostHog feature flag, **so that** I can ship incomplete work safely to production and enable features per tenant without a redeploy.

#### 2. Acceptance Criteria (Functional Boundaries)
- All 11 module flags (`df_tenant_onboarding`, `df_brand_product_master`, `df_customer_master`, `df_cohorts`, `df_pricing_engine`, `df_catalog_publishing`, `df_buyer_app`, `df_order_management`, `df_search`, `df_tally_export`, `df_zoho_integration`) are created in PostHog as boolean flags, default **off**.
- A server-side utility `lib/flags.ts` exports a `getFlag(flagName: string, tenantId: string): Promise<boolean>` function that calls the PostHog server SDK.
- A client-side React hook `useFlag(flagName: string): boolean` wraps the PostHog JS SDK.
- Both the UI route and the underlying Supabase RPC/route handler check the flag; a disabled feature cannot be reached via direct URL or API call.
- Each flag must include an `owner` note and a `removal_date` custom property in PostHog.
- Phase-2 flags (`df_ai_intake`, `df_replenishment`, `df_payments`, `df_lending`) are also created as stubs, default off.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No visible UI for this story. Flag-off routes render a centered `bg-cream-50` page with a restrained illustration + *"This feature isn't enabled yet."* message in `font-sans text-cream-700`.
- Must use existing shadcn/ui empty-state pattern. No custom inline styles.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=lib/flags
# Verify getFlag returns false for unknown flag name
# Verify flag-off route returns 404 or redirect, not 200
npm run lint
npx tsc --noEmit
```

---

### EP-01-005 — Tenant Subdomain Routing (Next.js Middleware)

#### 1. Objective & User Value
- **As a** distributor, **I want** my DealFlow workspace to be accessible at `{slug}.dealflow.in`, **so that** my team and buyers experience a branded URL that feels like my own product.

#### 2. Acceptance Criteria (Functional Boundaries)
- Next.js `middleware.ts` reads the incoming hostname, extracts the subdomain, and injects `x-tenant-slug` into the request headers for consumption by server components and API routes.
- In local development (no subdomain), `localhost:3000` resolves to a dev tenant from the environment variable `NEXT_PUBLIC_DEV_TENANT_SLUG`.
- Requests to an unrecognized subdomain serve a `404` page with the message: *"Workspace not found. Check your URL or contact your distributor."*
- The `shop.` subdomain is reserved for the Buyer PWA; any request to `shop.dealflow.in/*` is routed to the `app/(buyer)/` route group.
- The middleware must NOT break API routes or static assets.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No user-facing UI beyond the 404 page.
- 404 page: `bg-cream-50`, centered card, `font-display` h2 heading, `font-sans` body, *"Go to DealFlow home"* CTA with `bg-teal-500`.
- Must use existing shadcn/ui layout primitives only.

#### 4. Automated Verification Steps
```
npm run test:integration -- --testPathPattern=middleware
# Test: slug 'wineyard' resolves correct tenant_id from DB
# Test: unknown slug returns 404 status
# Test: /shop/* routes correctly to buyer route group
npm run lint
npx tsc --noEmit
```

---

---

# EPIC 02 — Brand & Product Master

---

### EP-02-001 — Add Brand from Master Catalog

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** search the global brand catalog and link an existing brand to my tenant, **so that** I don't have to re-enter brand data that's already in the system.

#### 2. Acceptance Criteria (Functional Boundaries)
- A search input on the Brands page queries `catalog.brands` (FTS on name + slug) and shows results in a dropdown list.
- Selecting a brand inserts a row into `app.tenant_brands` with `master_brand_id` linked; optionally sets `display_name_override`.
- If the brand is already linked to the tenant, the UI shows *"Already in your catalog"* and disables the "Use this brand" button.
- `df_brand_product_master` feature flag must be enabled; otherwise the Brands nav item is hidden.
- New brand appears immediately in the Brands list without a page refresh (optimistic update via TanStack Query).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/brands` page, *"Add Brand"* button in `SellerTopbar` action slot.
- **Design Tokens:** Add Brand button: `<Plus/>` icon + *"Add Brand"* label, `bg-teal-500 text-cream-50 rounded-md`. Search results dropdown: `bg-cream-50 border border-cream-200 shadow-md rounded-md`. Brand card in list: `bg-cream-100 rounded-lg shadow-xs border border-cream-200`.
- Brand logo renders as a 40×40 avatar; missing logo shows initials in `bg-teal-100 text-teal-700` with `font-display`.
- Must use existing shadcn/ui Command (cmdk) component for the search dropdown. No custom primitives.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=brands/add
npm run test:integration -- --testPathPattern=tenant-brands
# Verify duplicate brand insert returns error, not duplicate DB row
npm run lint
```

---

### EP-02-002 — Create Custom (Private) Brand

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** create a private brand that exists only within my tenant, **so that** I can manage house-brand or unlisted products without polluting the global catalog.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form captures: brand `name`, `slug` (auto-generated from name, editable), optional `logo_url`, `description`.
- On save, inserts into `catalog.brands` with `is_public = false` and `origin_tenant_id = current_tenant_id`; then inserts into `app.tenant_brands`.
- Slug must be URL-safe (lowercase, hyphens only); validation error shown inline if not: *"Slug may only contain lowercase letters and hyphens."*
- Private brands are visible only to the origin tenant; they do not appear in the master catalog search for other tenants.
- `seller_assistant` can create custom brands (per RBAC matrix).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/brands/new` — a drawer or full-page form within `SellerShell`.
- **Design Tokens:** Form uses `bg-cream-100 rounded-lg p-6 shadow-sm`. Save CTA: `<Plus/>` + *"Create brand"*, `bg-teal-500`. Cancel: `variant="ghost"` shadcn Button.
- Logo upload shows a dashed `border-2 border-dashed border-cream-300 rounded-lg` upload zone with `<Upload/>` icon.
- Must use existing shadcn/ui Form, Input, Textarea, Button, and the existing R2 upload utility.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=brands/create-custom
# Verify is_public=false is enforced in the INSERT
# Verify other tenant cannot query this brand via catalog search RPC
npm run lint
npx tsc --noEmit
```

---

### EP-02-003 — Add Product from Master Catalog

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** search the global product catalog and add a product to my tenant inventory with my own SKU and pricing, **so that** I avoid re-entering product data from scratch.

#### 2. Acceptance Criteria (Functional Boundaries)
- Search queries `catalog.products` (FTS on name + brand + master_sku + aliases); results show product name, brand, master SKU, and GST rate.
- Selecting a product opens a side form pre-filled with master data; user must enter `internal_sku`, `mrp`, and `base_selling_price`; `cost_price` is optional.
- `internal_sku` must be unique within the tenant; duplicate shows: *"This SKU already exists in your product list."*
- On save, inserts into `app.tenant_products` with `master_product_id` linked and `tenant_brand_id` resolved from the tenant's linked brand.
- Product appears in the Products list immediately (optimistic update).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/products` page, *"Add Product"* in topbar. Search → results sheet → configure form sheet (two-step).
- **Design Tokens:** Product card in results: `bg-cream-100 border border-cream-200 rounded-md shadow-xs`. Price fields use `font-mono` for numeric input. *"Add to catalog"* CTA: `<Plus/>` + label, `bg-teal-500`.
- Product image thumbnail: 48×48 with `rounded-md object-cover`; fallback: `bg-cream-200` with `<Package/>` icon in `text-cream-500`.
- Must use existing shadcn/ui Sheet, Command, Form, Input components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=products/add-from-master
npm run test:integration -- --testPathPattern=tenant-products-insert
# Verify internal_sku uniqueness constraint via DB test
npm run lint
```

---

### EP-02-004 — Create Custom Product

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** create a product that has no master catalog equivalent, **so that** I can manage proprietary, bundled, or unlisted items in my catalog.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form captures: `name`, `internal_sku`, `tenant_brand_id` (required, select from tenant brands), `mrp`, `base_selling_price`, `cost_price` (optional, hidden from buyers), `default_uom`, `pack_size`, `hsn_code`, `gst_rate`, `description`, `attributes` (key-value pairs UI), `image_urls` (upload).
- `master_product_id` is NULL for custom products.
- `hsn_code` + `gst_rate` are mandatory for Tally export compatibility; show warning if missing: *"HSN code and GST rate are required for Tally export."*
- `seller_assistant` cannot edit `cost_price` (field hidden/disabled per RBAC).
- Saving with a duplicate `internal_sku` returns inline error.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/products/new` within `SellerShell`.
- **Design Tokens:** Two-column form layout on desktop (`grid grid-cols-2 gap-6`). Section dividers use `border-t border-cream-200 my-4`. Cost price field wrapped in a `seller_admin`-only visibility guard with a subtle `bg-cream-200 rounded-sm` lock indicator when in read-only mode.
- `gst_rate` dropdown: 0%, 5%, 12%, 18%, 28% options using shadcn/ui Select.
- Must use existing shadcn/ui Form, Input, Select, Textarea components. Attribute key-value pairs use a dynamic `shadcn/ui` field array pattern.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=products/create-custom
# Verify cost_price field is absent from API response for seller_assistant JWT
npm run lint
npx tsc --noEmit
```

---

### EP-02-005 — Product Image Upload (Cloudflare R2)

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** upload product images that are stored reliably, **so that** my buyers see high-quality product visuals in their catalog.

#### 2. Acceptance Criteria (Functional Boundaries)
- User can upload up to 5 images per product (JPG, PNG, WebP; max 5MB each).
- Upload goes directly to Cloudflare R2 via a pre-signed URL obtained from a Next.js API route; the file never passes through the app server.
- On upload success, the public R2 URL is appended to `tenant_products.image_urls[]`.
- If file size exceeds 5MB, client-side validation blocks the upload: *"Image must be under 5MB."*
- Images can be reordered (drag-and-drop); first image is the primary display image.
- Deleting an image removes the URL from the array; the R2 object deletion is queued as a background job.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Image upload section within the product create/edit form.
- **Design Tokens:** Upload zone: `border-2 border-dashed border-cream-300 rounded-lg bg-cream-50 hover:bg-cream-100`. Uploading state shows a `bg-teal-100` progress bar. Uploaded images show `rounded-md shadow-xs` thumbnails with a `<X/>` delete button overlay on hover (`bg-cream-900/60`).
- Drag handle icon: `<GripVertical/>` in `text-cream-400`.
- Must use existing shadcn/ui and the pre-existing R2 upload utility. No third-party upload libraries.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=uploads/r2
# Mock R2 pre-signed URL generation; verify URL appended to image_urls[]
# Verify >5MB file rejected before API call
npm run lint
```

---

### EP-02-006 — Bulk Product Import via CSV

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** import a batch of products from a CSV file, **so that** I can onboard my entire product catalog in minutes without manual data entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- Parse → Preview → Confirm three-step flow: (1) Upload CSV, (2) Show parsed rows in a preview table with validation errors highlighted per row, (3) Confirm imports valid rows.
- Required CSV columns: `internal_sku`, `name`, `brand_slug`, `mrp`, `base_selling_price`, `gst_rate`, `hsn_code`. Optional: `cost_price`, `default_uom`, `pack_size`, `description`.
- Rows with missing required fields or duplicate `internal_sku` are flagged in the preview with a red `bg-danger-50` row highlight and an error tooltip.
- Valid rows can be confirmed while invalid rows are skipped (user can fix and re-upload invalid rows).
- A downloadable CSV template is available on the import page.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/products/import` — accessible via *"Import CSV"* button (`<Upload/>` + label) on the Products page topbar.
- **Design Tokens:** Step indicator uses `text-teal-500` for active step, `text-cream-400` for pending. Preview table uses `font-mono text-sm` for SKU and price columns. Invalid row highlight: `bg-danger-50 border-l-2 border-danger-500`. Valid rows: `bg-cream-50`.
- Confirm CTA: `<FileCheck/>` + *"Import N products"*, `bg-teal-500`.
- Must use existing shadcn/ui Table, Badge, Button, and Zod for CSV row validation schema.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=products/import
# Parse a fixture CSV with 1 valid + 1 invalid row; verify only valid row is inserted
# Verify template CSV download returns correct headers
npm run lint
```

---

### EP-02-007 — Edit and Deactivate Product

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** edit an existing product's details and deactivate discontinued items, **so that** my catalog stays accurate without losing historical order data.

#### 2. Acceptance Criteria (Functional Boundaries)
- Any editable field (except `internal_sku` which is immutable after creation) can be updated.
- Deactivating a product (`is_active = false`) removes it from new catalog publishing flows but does NOT delete it; existing order line items retain the reference.
- Soft-delete via `deleted_at` timestamp is used for full removal; hard delete is not permitted.
- Changes are recorded in `app.audit_log` with `entity_type = 'tenant_product'`, `action = 'update'`, and a `diff` JSONB of changed fields.
- `seller_assistant` cannot change `cost_price`; the field is absent from their form.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/products/[id]/edit` within `SellerShell`.
- **Design Tokens:** Deactivate uses a destructive variant button: `bg-danger-50 text-danger-700 border border-danger-200 hover:bg-danger-100`, with `<EyeOff/>` icon + *"Deactivate product"*.
- Inactive product badge on list: `bg-cream-200 text-cream-600` pill with *"Inactive"* label.
- Must use existing shadcn/ui AlertDialog for the deactivation confirmation modal.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=products/edit
npm run test:integration -- --testPathPattern=audit-log-product
# Verify deactivated product excluded from catalog product picker query
npm run lint
```

---

### EP-02-008 — Manage Inventory Locations & Quantities

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** define warehouse/godown locations and track stock quantities per product per location, **so that** I can monitor stock levels and set reorder alerts.

#### 2. Acceptance Criteria (Functional Boundaries)
- Admin can create locations (`app.locations`) with `name` and optional `address` JSON.
- Per product, inventory qty can be set for each location via `app.tenant_inventory`.
- `qty_available` and `qty_reserved` are separately tracked; `qty_available - qty_reserved = sellable qty`.
- A `reorder_point` can be set; products below reorder point appear in a dashboard alert (MVP: static count, no push notification).
- Inventory updates are not real-time order-deducted in MVP — manual updates only.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Product detail page `app/(seller)/products/[id]` — an *"Inventory"* tab panel below product details.
- **Design Tokens:** Location row: `bg-cream-100 rounded-md border border-cream-200`. Qty below reorder: `text-danger-600 font-mono font-semibold`. Qty healthy: `text-teal-600 font-mono`. Location name: `font-sans text-cream-900`.
- Add location CTA: `<MapPin/>` + *"Add location"*, `variant="outline"`.
- Must use existing shadcn/ui Tabs, Table, Input components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=inventory
# Verify qty_available update persists correctly per location
# Verify sellable qty = available - reserved
npm run lint
```

---

---

# EPIC 03 — Customer (Buyer) Master

---

### EP-03-001 — Create Buyer Manually

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** add a new retail buyer to my customer master, **so that** I can assign them to cohorts, publish catalogs, and accept orders from them.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form captures: `business_name` (required), `contact_name`, `phone` (required, 10-digit Indian mobile), `email`, `gstin` (optional, format validated), `geography` (city, state, pincode, zone as separate fields stored as JSONB), `credit_limit`, `payment_terms_days`, `tier` (A/B/C radio), `external_ref`.
- `phone` uniqueness is validated per tenant: duplicate shows *"A buyer with this phone number already exists."*
- `external_ref` is optional but must be unique within the tenant if provided.
- New buyer is `is_active = true` by default.
- `df_customer_master` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/customers/new` within `SellerShell`. Accessible via *"Add Customer"* (`<UserPlus/>` + label) on the Customers page.
- **Design Tokens:** Tier selector uses a styled radio group: A = `bg-teal-50 border-teal-300`, B = `bg-cream-100 border-cream-300`, C = `bg-cream-50 border-cream-200`. Credit limit input uses `font-mono`. Geography fields in a `grid grid-cols-2 gap-4` sub-section.
- Must use existing shadcn/ui RadioGroup, Input, Form, Select components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=customers/create
# Verify phone uniqueness constraint fires per-tenant not globally
npm run lint
npx tsc --noEmit
```

---

### EP-03-002 — Bulk Buyer Import via CSV

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** import my existing customer list from a CSV, **so that** I can migrate my buyer master from Tally or Excel without manual entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- Parse → Preview → Confirm flow identical to product import (EP-02-006).
- Required CSV columns: `business_name`, `phone`. Optional: `contact_name`, `email`, `gstin`, `city`, `state`, `pincode`, `zone`, `tier`, `credit_limit`, `payment_terms_days`, `external_ref`.
- Rows with invalid GSTIN format or duplicate phone (within this import batch or existing data) are flagged.
- Successfully imported buyers are immediately queryable for cohort assignment.
- Downloadable CSV template available on the import page.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/customers/import` — *"Import CSV"* (`<Upload/>` + label) button on Customers page topbar.
- **Design Tokens:** Same import stepper pattern as product import. Phone and credit limit columns: `font-mono`. Invalid row: `bg-danger-50 border-l-2 border-danger-500`.
- Must use existing shadcn/ui Table, Badge, Button. Re-use the same Zod CSV validation utility established in EP-02-006.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=customers/import
# Fixture CSV: 3 valid + 1 invalid (duplicate phone)
# Verify 3 rows inserted, 1 skipped with error
npm run lint
```

---

### EP-03-003 — Edit Buyer Profile

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** update a buyer's tier, credit terms, or contact details, **so that** their cohort membership and pricing reflect their current business relationship.

#### 2. Acceptance Criteria (Functional Boundaries)
- All fields editable except `external_ref` (immutable once set via import; editable if null).
- Changes to `tier` or `geography` may affect dynamic cohort membership; the UI shows a notice: *"Changing tier or geography may update this buyer's cohort memberships."* (no blocking).
- Updates are recorded in `app.audit_log`.
- `seller_assistant` can edit all fields except sensitive financial fields (credit_limit, payment_terms_days) which are `seller_admin`-only.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/customers/[id]/edit` within `SellerShell`.
- **Design Tokens:** Locked `external_ref` field shows `bg-cream-200 text-cream-500 cursor-not-allowed`. Admin-only fields (credit_limit) wrapped in a subtle `ring-1 ring-cream-300 rounded-md` guard.
- Save CTA: `<Save/>` + *"Save changes"*, `bg-teal-500`.
- Must use existing shadcn/ui Form, Input, Select components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=customers/edit
# Verify seller_assistant JWT cannot update credit_limit via API
npm run lint
```

---

### EP-03-004 — Deactivate & Reactivate Buyer

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** deactivate a buyer who is no longer active, **so that** they no longer appear in catalog publishing flows or order intake, while preserving their history.

#### 2. Acceptance Criteria (Functional Boundaries)
- Deactivating sets `is_active = false`; the buyer disappears from cohort evaluation queries and catalog scope selectors.
- Existing orders for the buyer are unaffected.
- `seller_admin` can reactivate a deactivated buyer at any time.
- Confirmation dialog required before deactivation: *"Are you sure? [Buyer Name] will no longer be able to place orders."*
- Action recorded in `app.audit_log`.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Buyer detail page `app/(seller)/customers/[id]` — `<EyeOff/>` + *"Deactivate"* in a dropdown menu (kebab `...`) in the topbar action slot. Only visible to `seller_admin`.
- **Design Tokens:** Confirmation dialog uses `shadcn/ui AlertDialog`. Destructive confirm button: `bg-danger-600 text-cream-50`.
- Deactivated buyer list row: `opacity-60` with *"Inactive"* badge `bg-cream-200 text-cream-600`.
- Must use existing shadcn/ui AlertDialog, DropdownMenu components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=customers/deactivate
# Verify deactivated buyer excluded from dynamic cohort evaluation query
# Verify seller_assistant cannot call deactivate RPC
npm run lint
```

---

### EP-03-005 — Buyer Detail View

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** view a buyer's full profile, order history, and cohort memberships in one place, **so that** I can make informed decisions during sales calls.

#### 2. Acceptance Criteria (Functional Boundaries)
- Detail view shows: business info, tier badge, credit terms, geography, GSTIN, linked cohorts, and last 10 orders with status.
- Cohort membership list is dynamically computed (not just `cohort_members`; includes dynamic cohorts where the buyer qualifies by rules).
- Order history links to full order detail pages.
- `external_ref` displayed as *"ERP ID"* with `font-mono`.
- Page is read-only for `seller_assistant`; edit button hidden.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/customers/[id]` within `SellerShell`. Tab layout: **Overview | Orders | Cohorts**.
- **Design Tokens:** Info grid uses `bg-cream-100 rounded-lg p-4 shadow-xs`. Tier badge: A = `bg-teal-100 text-teal-800`, B = `bg-cream-200 text-cream-700`, C = `bg-cream-100 text-cream-500`. Order status chip colors per order status. ERP ID: `font-mono text-cream-600 text-sm`.
- Must use existing shadcn/ui Tabs, Card, Badge components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=customers/detail
# Verify dynamic cohort membership computed correctly for a rule-based cohort
npm run lint
npx tsc --noEmit
```

---

---

# EPIC 04 — Cohort Builder

---

### EP-04-001 — Create Dynamic Cohort with Rule Builder

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** define cohorts using rules (e.g., state = KA AND tier = A), **so that** catalog pricing and publishing automatically applies to the right buyer segments without manual list management.

#### 2. Acceptance Criteria (Functional Boundaries)
- Rule builder supports filters on buyer fields: `geography.state`, `geography.city`, `geography.zone`, `tier`, and optionally `brand_focus` (array contains).
- Rules are stored as JSONB in `app.cohorts.rules`; evaluation runs as a server-side Postgres function.
- `is_static = false` for dynamic cohorts; membership is evaluated live when needed (catalog publish, price resolution).
- Cohort name must be unique within the tenant.
- `df_cohorts` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/cohorts/new` within `SellerShell`. Accessible via *"Create Cohort"* (`<UsersRound/>` + label) button.
- **Design Tokens:** Rule row uses a `bg-cream-100 rounded-md border border-cream-200 p-3` card with: field selector (shadcn/ui Select) + operator (`=`, `in`) + value input. Add rule button: `<Plus/>` icon, `variant="ghost"`. Rule rows connected by an *"AND"* `bg-cream-200 text-cream-600 text-xs rounded px-2` pill.
- Save CTA: `<UsersRound/>` + *"Save cohort"*, `bg-teal-500`.
- Must use existing shadcn/ui Select, Input, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=cohorts/create-dynamic
# Fixture: create rule {state:'KA', tier:'A'}; verify 3 matching buyers returned from evaluate function
npm run lint
npx tsc --noEmit
```

---

### EP-04-002 — Create Static Cohort (Manual Member List)

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** create a curated list of buyers by hand, **so that** I can build cohorts based on relationship or informal criteria that don't map to standard fields.

#### 2. Acceptance Criteria (Functional Boundaries)
- `is_static = true`; members are rows in `app.cohort_members`.
- UI presents a searchable multi-select of active buyers within the tenant.
- Members can be added or removed after creation without recreating the cohort.
- Membership count is stored in `cached_member_count` (updated on each member change).
- Static and dynamic cohorts appear in the same Cohorts list with a type badge.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/cohorts/new` — toggle between *"Rule-based"* and *"Manual list"* tab in the create form.
- **Design Tokens:** Member selector uses `shadcn/ui Command` multi-select with buyer chips: `bg-teal-50 text-teal-700 rounded-full px-2 py-0.5 text-xs`. Type badge — Dynamic: `bg-ember-50 text-ember-700`, Static: `bg-cream-200 text-cream-700`.
- Must use existing shadcn/ui Command, Badge, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=cohorts/create-static
# Verify cohort_members rows inserted; cached_member_count = inserted count
npm run lint
```

---

### EP-04-003 — Preview Cohort Membership Count

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** see a live preview of how many buyers match a rule-based cohort before saving, **so that** I don't accidentally publish a catalog to zero or all buyers.

#### 2. Acceptance Criteria (Functional Boundaries)
- As the user builds rules (on change, debounced 500ms), a server RPC evaluates the rules against live buyer data and returns a count.
- Preview shows: *"N buyers match these rules"* with a sample of up to 5 buyer names.
- If count = 0, a warning banner: *"No buyers currently match these rules. You can still save and add buyers later."*
- Preview is read-only; it does not create any DB records.
- Preview calls a distinct RPC `app.preview_cohort_count(tenant_id, rules_json)` — separate from the save path.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Inline preview panel below the rule builder on the cohort create/edit form.
- **Design Tokens:** Preview panel: `bg-cream-100 rounded-md border border-cream-200 p-3 mt-4`. Count: `font-mono text-teal-700 font-semibold text-lg`. Warning state: `bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3`. Loading state: shimmer skeleton on the count area.
- Must use existing shadcn/ui Skeleton, Alert components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=cohorts/preview
# Mock RPC; verify debounce fires after 500ms not on every keystroke
# Verify zero-count warning renders
npm run lint
```

---

### EP-04-004 — Edit and Delete Cohort

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** edit cohort rules or member lists and delete cohorts that are no longer needed, **so that** my segmentation stays accurate as my buyer base evolves.

#### 2. Acceptance Criteria (Functional Boundaries)
- Any cohort field (name, description, rules, members) is editable.
- Deleting a cohort that is actively referenced by a `published` catalog is blocked: *"This cohort is used in an active catalog. Archive the catalog before deleting the cohort."*
- Deletion uses `deleted_at` soft-delete, not hard delete.
- Editing rules of a dynamic cohort triggers a background re-evaluation of affected draft catalogs (non-blocking, queued via pg_cron).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/cohorts/[id]/edit` within `SellerShell`.
- **Design Tokens:** Delete button in kebab menu: `text-danger-600 hover:bg-danger-50`. Blocked delete shows a `shadcn/ui AlertDialog` with `bg-amber-50` warning content.
- Must use existing shadcn/ui AlertDialog, DropdownMenu components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=cohorts/edit-delete
# Verify delete blocked when referenced by published catalog
# Verify soft-delete: deleted_at set, row still exists in DB
npm run lint
```

---

---

# EPIC 05 — Pricing Engine

---

### EP-05-001 — Create Price List

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** create a named price list with an optional validity window, **so that** I can run time-limited promotional pricing or seasonal catalogs without permanent price changes.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form: `name`, `currency` (defaults to INR), `valid_from` (datetime), `valid_to` (datetime, optional), `priority` (integer, default 0).
- `valid_to` must be after `valid_from`; inline error if not: *"End date must be after start date."*
- `priority` determines conflict resolution (higher wins); hint text: *"Higher priority overrides lower when multiple price lists apply."*
- Price list created as `is_active = true`.
- `df_pricing_engine` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/price-lists/new` within `SellerShell`. Accessible via *"Create Price List"* (`<IndianRupee/>` + label) on the Price Lists page.
- **Design Tokens:** Date pickers use `shadcn/ui DateTimePicker`. Priority field: `font-mono`. Page heading: `font-display`. Save CTA: `<IndianRupee/>` + *"Create price list"*, `bg-teal-500`.
- Must use existing shadcn/ui Form, Input, DatePicker components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=price-lists/create
# Verify valid_to < valid_from returns validation error
npm run lint
npx tsc --noEmit
```

---

### EP-05-002 — Add and Edit Price List Line Items

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** set custom prices for individual products on a price list, with optional minimum quantity breaks, **so that** I can offer volume discounts automatically.

#### 2. Acceptance Criteria (Functional Boundaries)
- Line item form: `tenant_product_id` (searchable product picker), `price` (required), `min_qty` (default 1), `max_qty` (optional).
- Multiple quantity-break rows can be added per product (e.g., 1+ qty → ₹100, 10+ qty → ₹90).
- Unique constraint on `(price_list_id, tenant_product_id, min_qty)` — duplicate shows inline error.
- Price must be > 0; price cannot exceed `mrp` (show warning, not block): *"This price exceeds the product MRP."*
- Items can be removed from the price list at any time.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/price-lists/[id]` — a line item editor table within the price list detail page.
- **Design Tokens:** Price input: `font-mono`. Qty break rows: compact `h-10` table rows, `bg-cream-50` alternating. MRP exceeded warning: inline `text-amber-600 text-xs` below price input. Add item: `<Plus/>` + *"Add product"*, `variant="outline"`.
- Must use existing shadcn/ui Table, Input, Command (product search) components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=price-lists/line-items
# Verify qty-break resolution: price for qty=12 returns 10+ tier not 1+ tier
npm run lint
```

---

### EP-05-003 — Assign Price List to Cohort, Buyer, or All

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** assign a price list to a cohort, an individual buyer, or all buyers, **so that** the correct pricing is automatically applied when buyers browse catalogs or place orders.

#### 2. Acceptance Criteria (Functional Boundaries)
- Assignment form: `target_type` (radio: `cohort` / `buyer` / `all_buyers`), `target_id` (conditional: cohort picker or buyer picker based on type; null for `all_buyers`).
- A price list can have multiple assignments (e.g., assigned to cohort A and buyer B).
- Duplicate assignments (same price list + same target) are blocked: *"This price list is already assigned to that target."*
- Assignments are displayed as a list on the price list detail page with a remove option.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/price-lists/[id]` — *"Assignments"* tab panel.
- **Design Tokens:** Assignment chip: `bg-teal-50 text-teal-700 rounded-full px-3 py-1 text-sm`. Target type icon: `<Users/>` for cohort, `<User/>` for buyer, `<Globe/>` for all. Remove: `<X/>` button on chip hover.
- Must use existing shadcn/ui Tabs, Badge, Command, RadioGroup components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=price-lists/assignments
# Verify duplicate assignment blocked by DB unique constraint
npm run lint
```

---

### EP-05-004 — Price Resolution Function (`resolve_price`)

#### 1. Objective & User Value
- **As a** developer/system, **I want** a single deterministic Postgres function that resolves the effective price for a buyer + product + quantity combination, **so that** pricing logic is centralized, testable, and not duplicated across app layers.

#### 2. Acceptance Criteria (Functional Boundaries)
- Function signature: `app.resolve_price(tenant_product_id uuid, buyer_id uuid, qty numeric) RETURNS numeric`.
- Resolution order (first match wins): (1) catalog `price_override`, (2) buyer-specific price list (highest priority, valid window), (3) cohort price lists (buyer's cohorts, highest priority), (4) `all_buyers` price lists, (5) `tenant_products.base_selling_price`.
- Function must be callable from both Next.js server components (via Supabase RPC) and from within other Postgres functions.
- Unit tests cover: each fallback tier, expired price lists excluded, qty-break selection.
- Function returns `NULL` only if no price exists anywhere — this is an error state.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No direct UI. Resolved price is displayed in catalog items and order line items using `font-mono`.
- NULL price state: show `text-danger-600 text-xs` *"No price set"* warning in catalog builder.

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/resolve_price.sql
# 6 test cases: each fallback tier + qty-break + expired exclusion
npm run test:integration -- --testPathPattern=resolve-price
npm run lint
```

---

### EP-05-005 — Price List Validity and Activation

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** activate or deactivate a price list and rely on validity windows to auto-expire, **so that** I can prepare future pricing in advance without manual intervention.

#### 2. Acceptance Criteria (Functional Boundaries)
- `is_active = false` disables a price list immediately regardless of validity window.
- `valid_to` in the past causes the price list to be excluded from `resolve_price()` automatically (evaluated inside the function, not via a cron job).
- Manual `is_active` toggle available on the price list detail page.
- Deactivating a price list does not cascade-delete its items or assignments.
- Price list list view shows status chips: `Active`, `Scheduled` (future `valid_from`), `Expired` (past `valid_to`), `Inactive` (manual off).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Price list list `app/(seller)/price-lists` and detail page toggle.
- **Design Tokens:** Status chips — Active: `bg-teal-100 text-teal-700`, Scheduled: `bg-cream-200 text-cream-600`, Expired: `bg-cream-300 text-cream-500`, Inactive: `bg-danger-50 text-danger-600`. Toggle uses `shadcn/ui Switch`.
- Must use existing shadcn/ui Switch, Badge components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=price-lists/activation
# Verify expired price list returns 0 from resolve_price
# Verify is_active=false overrides valid window
npm run lint
```

---

---

# EPIC 06 — Catalog Publishing

---

### EP-06-001 — Create Draft Catalog

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** create a new catalog in draft mode, **so that** I can prepare it without it going live to buyers until I'm ready.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form: `name` (required), `valid_from`, `valid_to`, `scope_type` (`cohort` / `buyer` / `geography` / `all`), optional `hero_image_url`, `message`.
- Catalog is created with `status = 'draft'`.
- `df_catalog_publishing` feature flag must be enabled.
- `name` must be unique within the tenant.
- Draft catalogs are visible only in the Distributor Cockpit, not to buyers.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/catalogs/new` within `SellerShell`. *"Create Catalog"* (`<BookOpen/>` + label) on Catalogs page topbar.
- **Design Tokens:** Scope type selector: visual card-style radio group — each scope type as a card with icon + label (`<Users/>` Cohort, `<User/>` Buyer, `<Map/>` Geography, `<Globe/>` All). Selected card: `border-2 border-teal-500 bg-teal-50`. Hero image upload: same dashed zone pattern as product images.
- Status badge Draft: `bg-cream-200 text-cream-600`.
- Must use existing shadcn/ui RadioGroup, Form, DatePicker, Input components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/create-draft
npm run lint
npx tsc --noEmit
```

---

### EP-06-002 — Add Products to Catalog

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** select which products to include in a catalog and set their display order, **so that** buyers see a curated, relevant product selection.

#### 2. Acceptance Criteria (Functional Boundaries)
- Product picker: searchable multi-select of active `tenant_products`; adds rows to `app.published_catalog_items`.
- Each item can be marked `is_featured = true` (surfaced prominently in buyer view).
- `display_order` is managed via drag-and-drop; sequential integer values persist on reorder.
- `price_override` per item is optional; if set, overrides `resolve_price()` for this catalog.
- Duplicate product in same catalog is blocked by DB unique constraint; UI prevents selection of already-added products.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/catalogs/[id]/products` — *"Products"* tab on catalog detail.
- **Design Tokens:** Product row: `bg-cream-50 border-b border-cream-200 h-14`. Drag handle: `<GripVertical/>` in `text-cream-400`. Featured toggle: `shadcn/ui Switch`. Price override input: `font-mono text-sm w-24`. Featured badge: `bg-ember-100 text-ember-700 text-xs`.
- Must use existing shadcn/ui Table, Switch, Command, Input components with a drag-and-drop library (`@dnd-kit/core`).

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/products
# Verify display_order persists after reorder
# Verify price_override takes precedence in resolve_price
npm run lint
```

---

### EP-06-003 — Set Catalog Scope (Cohort / Buyer / Geography / All)

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** define exactly which buyers can see a catalog, **so that** product offers and pricing remain relevant and confidential to the right audience.

#### 2. Acceptance Criteria (Functional Boundaries)
- `scope_type = 'cohort'`: `scope_value = {cohort_id: uuid}` — requires cohort picker.
- `scope_type = 'buyer'`: `scope_value = {buyer_id: uuid}` — requires buyer picker.
- `scope_type = 'geography'`: `scope_value = {state: 'KA', city: 'BLR'}` — requires state + optional city selects.
- `scope_type = 'all'`: `scope_value = {}` — no additional input needed.
- Scope can be changed on a draft catalog; changing scope on a published catalog is blocked: *"Archive this catalog and create a new one to change the audience."*

#### 3. Design System & UI/UX Constraints
- **UI Placement:** *"Scope"* tab on catalog detail page `app/(seller)/catalogs/[id]/scope`.
- **Design Tokens:** Scope summary card on draft: `bg-cream-100 rounded-lg border border-cream-200 p-4`. Scope locked on published: `bg-cream-200 opacity-70 cursor-not-allowed`. Geography selects use shadcn/ui Select.
- Must use existing shadcn/ui Select, Command, Alert components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/scope
# Verify published catalog scope change returns 409 error
npm run lint
```

---

### EP-06-004 — Publish Catalog (Generate Share Token)

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** publish a draft catalog with a single action, **so that** a unique shareable link is immediately generated that I can send to buyers via WhatsApp.

#### 2. Acceptance Criteria (Functional Boundaries)
- Publishing transitions `status` from `draft` → `published`; generates a `share_token` (UUID v4, stored on `published_catalogs`).
- Pre-publish validation: catalog must have ≥1 product and a defined scope; if not, show: *"Add at least one product and set a scope before publishing."*
- The share link format: `shop.dealflow.in/{share_token}` (production) / `localhost:3000/shop/catalog/{share_token}` (dev).
- Published link is copyable from a success toast and from the catalog detail page.
- Only `seller_admin` and `seller_assistant` can publish (per RBAC).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** *"Publish"* CTA in `SellerTopbar` action slot of the catalog detail page.
- **Design Tokens:** Publish button: `<Send/>` + *"Publish catalog"*, `bg-teal-500`. Post-publish success toast: `bg-teal-50 border border-teal-300` with copy-link button `<Copy/>` icon, `variant="outline"`. Published badge: `bg-teal-100 text-teal-700`.
- Must use existing shadcn/ui toast, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/publish
# Verify share_token is unique UUID
# Verify pre-publish validation fires for empty product list
# Verify status transition draft→published persists
npm run lint
```

---

### EP-06-005 — Preview Catalog as Buyer

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** preview exactly how a catalog will look to a buyer before publishing, **so that** I catch layout or pricing errors without exposing them to customers.

#### 2. Acceptance Criteria (Functional Boundaries)
- Preview renders the Buyer PWA catalog browse screen in a sandboxed iframe or a dedicated `/preview/{catalog_id}` route, using the same components as the buyer app.
- Preview mode resolves prices using `resolve_price()` for a representative buyer (admin selects a sample buyer from a dropdown).
- Preview is accessible on draft AND published catalogs.
- Preview URL is not indexable and requires a seller session — it is not the share_token link.
- Any `price_override` on catalog items is reflected in the preview.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** *"Preview"* button (`<Eye/>` + *"Preview as buyer"*) on catalog detail page topbar. Opens in a new tab or a responsive modal at mobile viewport width.
- **Design Tokens:** Preview modal uses a `w-[390px]` container simulating a phone screen. Preview banner: `bg-amber-50 border-b border-amber-200 text-amber-700 text-xs p-2` — *"Preview mode — not visible to buyers yet."*
- Must use existing BuyerShell layout components inside the preview container.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/preview
# Verify preview route requires seller auth (returns 401 for unauthenticated)
# Verify price_override reflected in preview
npm run lint
```

---

### EP-06-006 — Archive / Expire Catalog

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** archive a published catalog when it's no longer relevant, **so that** buyers don't see outdated products or pricing when they open old links.

#### 2. Acceptance Criteria (Functional Boundaries)
- Archiving transitions `status` → `archived`; the share_token link returns a buyer-facing *"This catalog is no longer available."* message.
- Catalogs past their `valid_to` date are automatically treated as expired (read-only UI state; `status` field stays `published` but `resolve_price` and buyer access check validity).
- Archived catalogs remain visible in the cockpit for historical reference.
- Cannot archive a draft catalog (must publish first, then archive).
- `seller_admin`-only action.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Kebab menu on catalog row in catalog list and on catalog detail topbar.
- **Design Tokens:** Archived badge: `bg-cream-300 text-cream-600`. Expired badge: `bg-amber-100 text-amber-700`. Buyer-side expired page: `bg-cream-50` centered with a restrained illustration + `font-display` h2 + `font-sans` body.
- Must use existing shadcn/ui AlertDialog, DropdownMenu, Badge components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=catalogs/archive
# Verify archived catalog share_token returns expired message to unauthenticated buyer
# Verify draft→archive transition blocked
npm run lint
```

---

---

# EPIC 07 — Buyer PWA

---

### EP-07-001 — WhatsApp OTP Authentication

#### 1. Objective & User Value
- **As a** retail buyer, **I want to** log in using my WhatsApp phone number with a one-time code, **so that** I don't need to remember a password and my identity is verified on the device I actually use.

#### 2. Acceptance Criteria (Functional Boundaries)
- Buyer enters a 10-digit Indian mobile number → app calls the Meta Cloud API via AiSensy/Interakt to send a 6-digit OTP to WhatsApp.
- OTP is valid for 10 minutes; expired OTP shows: *"Code has expired. Request a new one."*
- Three failed attempts lock the phone number for 15 minutes; shows: *"Too many attempts. Try again in 15 minutes."*
- On success, Supabase Auth creates a session; `buyer_users` is queried to determine which buyers this user is associated with (may span multiple tenants).
- `df_buyer_app` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/login` — outside `BuyerShell`, full-bleed mobile-first layout.
- **Design Tokens:** Page `bg-cream-50`. WhatsApp brand color `#25D366` used ONLY for the WhatsApp icon (`<MessageCircle/>` lucide); all other elements use design tokens. Phone input: `font-mono text-lg`. OTP inputs: 6 individual `w-10 h-12 text-center font-mono text-xl` boxes with `border-cream-300 focus:ring-ember-400`. CTA: `<Send/>` + *"Send code on WhatsApp"*, `bg-teal-500`.
- iOS safe-area-inset padding applied via `env(safe-area-inset-*)`.
- Must use existing shadcn/ui Input, Button. OTP box: build with 6× controlled inputs or `InputOTP` from shadcn/ui.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/auth
# Mock AiSensy API; verify OTP message payload contains correct template
# Verify 3-attempt lockout fires correctly
# Verify expired OTP rejected
npm run lint
```

---

### EP-07-002 — Buyer Home Screen

#### 1. Objective & User Value
- **As a** returning buyer, **I want to** see my available catalogs and recent orders on a home screen, **so that** I can quickly reorder or browse new arrivals without navigating menus.

#### 2. Acceptance Criteria (Functional Boundaries)
- Shows catalogs published to this buyer (active, within validity window) from all linked distributors, sorted by `valid_to` ascending.
- Shows the buyer's last 3 orders with status chips.
- *"Order again"* shortcut on past orders adds all items to a new cart (if products still in an active catalog).
- Empty states: no catalogs → *"No catalogs available right now. Check back soon."*; no orders → *"No orders yet. Browse a catalog to get started."*
- Data fetched server-side with TanStack Query hydration for instant load.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/home` within `BuyerShell` — primary tab *"Home"*.
- **Design Tokens:** Catalog cards: `bg-cream-50 rounded-xl shadow-sm border border-cream-200` with hero image `aspect-[16/9] rounded-t-xl object-cover`. Catalog name: `font-display text-cream-900`. Distributor name: `font-sans text-sm text-cream-600`. Order row: `bg-cream-100 rounded-lg p-3 flex items-center gap-3`. Status chip per order status.
- "Order again" CTA: `<RefreshCw/>` + *"Order again"*, `bg-teal-500 rounded-full`.
- Must use existing BuyerShell, BuyerHeader components. No custom layout primitives.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/home
# Verify expired catalog NOT shown
# Verify order-again action adds correct items to cart state
npm run lint
```

---

### EP-07-003 — Catalog Browse (Tokenized + Authenticated)

#### 1. Objective & User Value
- **As a** buyer, **I want to** browse a catalog via a shared link without being forced to log in upfront, **so that** I can see what's available before committing to sign in and place an order.

#### 2. Acceptance Criteria (Functional Boundaries)
- `shop.dealflow.in/{share_token}` (public route) renders the catalog without authentication.
- Adding to cart requires a WhatsApp OTP login; unauthenticated users clicking *"Add to cart"* are redirected to `/shop/login?redirect=/shop/catalog/{share_token}`.
- Post-login redirect restores the cart state and returns to the catalog.
- Authenticated users see the catalog with their resolved prices (via `resolve_price()`); unauthenticated users see the base price.
- Invalid or archived share_token renders the buyer-side expired page (EP-06-006).
- Products are filterable by brand, category, and price range using client-side filtering (no additional DB calls at MVP scale).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/catalog/[token]` within `BuyerShell`. Tab bar hidden for tokenized (unauthenticated) access; shown after login.
- **Design Tokens:** Product grid: `grid grid-cols-2 gap-3 px-4` (mobile). Product card: `bg-cream-50 rounded-xl shadow-xs border border-cream-200`. MRP: `line-through text-cream-400 text-sm font-mono`. Cohort price: `text-teal-700 font-mono font-semibold text-base`. *"Add"* button: `+` icon, `bg-teal-500 rounded-full h-8 w-8` positioned bottom-right of card.
- Treat catalog as a curated lookbook — hero image full-bleed at top, then product grid. Brand filter pills: `bg-cream-200 text-cream-700 rounded-full px-3 py-1 text-sm` / active: `bg-teal-500 text-cream-50`.
- Must use existing BuyerShell, BuyerHeader components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/catalog-browse
# Verify unauthenticated user sees base price
# Verify authenticated user sees resolve_price output
# Verify invalid share_token renders expired state (not 500 error)
npm run lint
```

---

### EP-07-004 — Product Detail Screen

#### 1. Objective & User Value
- **As a** buyer, **I want to** see full product details including images, specifications, and pricing before adding to my cart, **so that** I can make confident purchasing decisions.

#### 2. Acceptance Criteria (Functional Boundaries)
- Displays: product images (swipeable carousel), name, brand, description, `default_uom`, `pack_size`, MRP (struck through), resolved price, GST rate (displayed as *"+ 18% GST"*), `hsn_code`.
- `attributes` JSONB rendered as a key-value spec table if non-empty.
- *"Add to cart"* updates cart quantity; if already in cart, shows quantity selector.
- MOQ (minimum order quantity) = `price_list_items.min_qty` where applicable; add-to-cart blocked below MOQ.
- Back navigation returns to catalog browse with scroll position preserved.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/product/[id]` within `BuyerShell` — deep screen, back button visible in `BuyerHeader`.
- **Design Tokens:** Image carousel: full-bleed `aspect-square` swipeable images with dot indicators `bg-cream-300` / active `bg-teal-500`. Price section: `bg-cream-100 rounded-xl p-4 mt-4`. Add-to-cart CTA: full-width `bg-teal-500 rounded-xl h-12 text-base font-semibold`. Qty selector: `<Minus/>` `font-mono count` `<Plus/>` in `border border-cream-300 rounded-lg`.
- Must use existing BuyerHeader with `showBack={true}` prop. Image carousel: CSS scroll-snap, no external carousel library.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/product-detail
# Verify MOQ enforcement: add-to-cart blocked for qty < min_qty
# Verify attributes table renders only when attributes JSONB non-empty
npm run lint
```

---

### EP-07-005 — Cart Management

#### 1. Objective & User Value
- **As a** buyer, **I want to** manage my cart (add, update quantity, remove items) before placing an order, **so that** I can finalize my purchase confidently.

#### 2. Acceptance Criteria (Functional Boundaries)
- Cart state is stored in React state (TanStack Query client-side cache), not in the database, until checkout.
- Cart persists across catalog and product detail navigation within the same session.
- Quantity can be updated inline; removing an item prompts no confirmation (undo toast instead: *"Item removed. Undo"*).
- Cart shows: item name, brand, image thumbnail, unit price (resolved), quantity, line total.
- Cart totals: subtotal (pre-tax), total GST, grand total — all computed client-side.
- Empty cart: `<ShoppingCart/>` illustration + *"Your cart is empty."* + *"Browse catalog"* CTA.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/cart` — deep screen, accessed via cart icon badge in `BuyerHeader`.
- **Design Tokens:** Cart item row: `bg-cream-50 rounded-xl p-3 flex gap-3`. Image: `48×48 rounded-lg object-cover`. Price: `font-mono text-teal-700`. Line total: `font-mono font-semibold`. Totals footer: `bg-cream-100 border-t border-cream-200 p-4` fixed at bottom above tab bar safe area. Proceed CTA: `<ShoppingCart/>` + *"Proceed to checkout"*, `bg-teal-500 rounded-xl w-full h-12`.
- Cart icon in BuyerHeader shows a `bg-ember-400 text-cream-50` badge with item count.
- Must use existing BuyerShell, BuyerHeader components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/cart
# Verify GST calculation: subtotal × gst_rate = tax_amount
# Verify undo-remove restores item to cart
npm run lint
```

---

### EP-07-006 — Checkout and Order Placement

#### 1. Objective & User Value
- **As a** buyer, **I want to** review my cart and place an order with delivery address details, **so that** my distributor receives a confirmed, structured order they can fulfill.

#### 2. Acceptance Criteria (Functional Boundaries)
- Checkout shows cart summary (read-only), delivery address (pre-filled from buyer profile, editable), and order notes (optional).
- Placing order: inserts `app.orders` (status = `received`) + `app.order_items`; cart is cleared; buyer redirected to order confirmation screen.
- Order number generated as `DF-{YEAR}-{5-digit-seq}` (unique per tenant).
- If session expired during checkout, prompt re-authentication and preserve cart state.
- `buyer_assistant` orders go to `status = 'draft'` (pending buyer_admin approval); `buyer_admin` orders go directly to `status = 'received'`.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/checkout` — deep screen within `BuyerShell`.
- **Design Tokens:** Section cards `bg-cream-100 rounded-xl p-4 mb-4`. Order total: `font-mono text-2xl text-teal-700 font-bold`. *"Place order"* CTA: `<Check/>` + *"Place order"*, `bg-teal-500 rounded-xl w-full h-14 text-base font-semibold`. Loading state: button shows spinner + *"Placing order..."*, disabled.
- Must use existing shadcn/ui within BuyerShell. Address fields use Form, Input components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/checkout
# Verify order_number uniqueness per tenant (5-digit seq)
# Verify buyer_assistant order status = 'draft'
# Verify cart cleared after successful order
npm run lint
```

---

### EP-07-007 — Buyer Order List and Status

#### 1. Objective & User Value
- **As a** buyer, **I want to** view all my orders and their current status, **so that** I can track deliveries and plan my business without calling the distributor.

#### 2. Acceptance Criteria (Functional Boundaries)
- Shows all orders for the authenticated buyer, newest first.
- Status displayed as human-readable labels: Received, Confirmed, Dispatched, Delivered, Cancelled.
- Tapping an order shows line items, quantities, prices, and a status timeline.
- `buyer_assistant` sees only their own placed orders (not all buyer orders); `buyer_admin` sees all orders for the buyer account.
- Orders from all linked distributors are shown, grouped by distributor.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/orders` — primary tab *"Orders"* in `BuyerTabBar`.
- **Design Tokens:** Order card: `bg-cream-50 rounded-xl p-4 border border-cream-200 mb-3`. Order number: `font-mono text-sm text-cream-600`. Status chip colors: Received `bg-cream-200`, Confirmed `bg-teal-100 text-teal-700`, Dispatched `bg-ember-100 text-ember-700`, Delivered `bg-teal-500 text-cream-50`, Cancelled `bg-danger-50 text-danger-600`. Status timeline: vertical line `bg-cream-300`, active node `bg-teal-500`.
- Must use existing BuyerShell, BuyerTabBar components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/orders
# Verify buyer_assistant sees only own orders
# Verify buyer_admin sees all buyer orders
npm run lint
```

---

### EP-07-008 — Buyer Profile Screen

#### 1. Objective & User Value
- **As a** buyer, **I want to** view my business profile and see which distributors I'm linked to, **so that** I can verify my account details and manage my connections.

#### 2. Acceptance Criteria (Functional Boundaries)
- Profile shows: business name, GSTIN, phone, contact name, tier badge, and a list of linked distributors (tenant names).
- Read-only view in MVP; the distributor (seller) manages buyer data.
- Logout button clears the Supabase session and redirects to `/shop/login`.
- Tapping a distributor shows the active catalogs from that distributor.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `/shop/profile` — primary tab *"Profile"* in `BuyerTabBar`.
- **Design Tokens:** Profile card: `bg-cream-100 rounded-xl p-5`. Business name: `font-display text-xl text-cream-900`. Phone: `font-mono`. Tier badge: same as cockpit tier colors. Logout: `<LogOut/>` + *"Log out"*, `variant="ghost" text-danger-600`.
- Must use existing BuyerShell, BuyerTabBar, BuyerHeader components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=buyer/profile
# Verify logout clears Supabase session cookie
npm run lint
```

---

### EP-07-009 — PWA Install and Offline Shell

#### 1. Objective & User Value
- **As a** buyer, **I want to** install the DealFlow buyer app to my phone home screen and get a loading shell even on poor connectivity, **so that** the app feels native and works reliably in Indian SMB network conditions.

#### 2. Acceptance Criteria (Functional Boundaries)
- `manifest.json` configured: `name`, `short_name`, `start_url` (`/shop/home`), `display: standalone`, `theme_color` (`#1F3A34` teal-500), `background_color` (`#FDFBF7` cream-50), icons (192×192, 512×512).
- Service worker registered via Next.js PWA plugin (`next-pwa`); caches the app shell (HTML, CSS, JS) for offline viewing.
- Offline fallback page: `bg-cream-50`, `<WifiOff/>` illustration, *"You're offline. Your last viewed content may be available below."*
- iOS add-to-home-screen banner shown once after third visit using `localStorage` visit counter.
- Android install prompt captured and shown as a native-style `shadcn/ui` banner.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Global — applies to all `/shop/*` routes.
- **Design Tokens:** PWA install banner: `bg-teal-500 text-cream-50` bottom sheet with `<Download/>` + *"Add to home screen"* CTA.
- Must NOT introduce a new service worker framework beyond `next-pwa`.

#### 4. Automated Verification Steps
```
# Lighthouse PWA audit score ≥ 90
npm run build && npx lighthouse http://localhost:3000/shop/home --only-categories=pwa
# Verify manifest.json accessible at /manifest.json
npm run lint
```

---

---

# EPIC 08 — Order Management

---

### EP-08-001 — Order List View with Status Filters

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** see all incoming orders in a filterable table, **so that** I can prioritize fulfilment and track outstanding work at a glance.

#### 2. Acceptance Criteria (Functional Boundaries)
- Orders listed newest first; filterable by `status`, `buyer_id` (searchable), and date range.
- Columns: order number, buyer name, placed at, total amount, status, source.
- Pagination: 25 rows per page; total count shown.
- `df_order_management` feature flag must be enabled.
- `seller_assistant` sees all orders but cannot change status (change status button hidden).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/orders` within `SellerShell`. Nav item: `<ShoppingCart/>` Orders.
- **Design Tokens:** Table `bg-cream-50`. Header row `bg-cream-200 text-cream-700 font-semibold text-xs uppercase`. Order number: `font-mono`. Amount: `font-mono text-right`. Status chips (same colors as buyer-side). Filter bar: `bg-cream-100 border-b border-cream-200 px-4 py-3` with `<Filter/>` icon label.
- Must use existing shadcn/ui Table, Select, DateRangePicker, Badge components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=orders/list
# Verify status filter applied correctly in DB query
# Verify pagination: page 2 returns rows 26-50
npm run lint
```

---

### EP-08-002 — Order Detail View

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** view a complete order detail including line items, buyer info, and status history, **so that** I can process and fulfil it accurately.

#### 2. Acceptance Criteria (Functional Boundaries)
- Shows: order number, buyer business name + GSTIN, placed at, source, line items (product name, SKU, qty, unit price, GST, line total), subtotal, tax, grand total, notes, current status.
- Status timeline: horizontal stepper showing all status transitions with timestamps.
- Links to buyer profile and to the originating catalog (if `catalog_id` is set).
- `external_ref` displayed as *"ERP Reference"* with `font-mono`.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/orders/[id]` within `SellerShell`.
- **Design Tokens:** Header section: `bg-cream-100 rounded-lg p-5 shadow-sm border border-cream-200`. Line items table: `font-mono text-sm` for amounts. Status stepper: completed steps `bg-teal-500 text-cream-50`, current step `bg-ember-400 text-cream-50`, pending `bg-cream-300 text-cream-600`. Total row: `font-mono font-bold text-teal-700 text-lg`.
- Must use existing shadcn/ui Table, Badge, Separator components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=orders/detail
# Verify line total = qty × unit_price (+ tax)
npm run lint
```

---

### EP-08-003 — Order Status Transitions

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** change an order's status (Confirm, Dispatch, Mark Delivered, Cancel), **so that** buyers are kept informed and my operations stay organized.

#### 2. Acceptance Criteria (Functional Boundaries)
- Valid transitions: `received` → `confirmed`; `confirmed` → `dispatched` (or `partially_dispatched`); `dispatched` → `delivered`; any non-delivered status → `cancelled`.
- Invalid transitions are blocked by the server RPC with a `409 Conflict` response; the UI shows: *"This status change is not allowed."*
- Status change recorded in `app.audit_log` with actor, timestamp, old/new status in `diff`.
- `seller_admin` and `seller_assistant` can change status (per RBAC matrix).
- Cancellation requires a reason field (stored in `orders.notes` with a prefix tag).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Order detail page — *"Update status"* dropdown button in `SellerTopbar` action slot. Only valid next-state options shown.
- **Design Tokens:** Dropdown menu items: confirm `text-teal-700`, dispatch `text-ember-600`, deliver `text-teal-700 font-semibold`, cancel `text-danger-600`. Confirmation dialog for cancel: `shadcn/ui AlertDialog` with reason textarea.
- Must use existing shadcn/ui DropdownMenu, AlertDialog, Textarea components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=orders/status
npx supabase test db --file=tests/order_status_transitions.sql
# Verify invalid transition (received → delivered) returns 409
npm run lint
```

---

### EP-08-004 — Manual Order Creation in Cockpit

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** create an order on behalf of a buyer directly in the cockpit, **so that** I can process phone or WhatsApp orders without requiring buyers to use the app.

#### 2. Acceptance Criteria (Functional Boundaries)
- Form: select buyer (searchable), select products (multi-product line items with qty and price), add notes, set source = `cockpit_manual`.
- Price auto-resolved via `resolve_price()` but overridable per line item.
- Subtotal, tax, and grand total computed automatically on the form.
- Order created with status = `received` and `placed_by` = current seller user.
- Validation: at least 1 line item required; qty must be > 0.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/orders/new` — *"Create order"* (`<Plus/>` + label) on Orders page topbar.
- **Design Tokens:** Line item row: `bg-cream-50 border-b border-cream-200`. Qty input: `font-mono w-16 text-center`. Price input: `font-mono w-24`. Auto-resolved price shows as a `text-cream-500 text-xs` hint below override field. Totals: `bg-cream-100 rounded-lg p-4 text-right font-mono`.
- Must use existing shadcn/ui Form, Command (product search), Input, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=orders/create-manual
# Verify source='cockpit_manual' set
# Verify line total correctly computed
npm run lint
```

---

### EP-08-005 — Invoice PDF Generation

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** generate a PDF invoice for a dispatched or delivered order, **so that** I can share it with buyers and maintain records.

#### 2. Acceptance Criteria (Functional Boundaries)
- Invoice PDF generated server-side (Node.js PDF library); includes: distributor logo + name + GSTIN, buyer details + GSTIN, order number, date, line items (HSN, qty, unit, GST rate, amount), subtotal, GST breakup (CGST/SGST or IGST based on state), grand total.
- PDF stored to Cloudflare R2 on generation; URL stored on the order record.
- Re-generation allowed (overwrites existing PDF).
- Available for orders with status ≥ `dispatched`.
- Download via a `<FileDown/>` + *"Download invoice"* button.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Order detail page — *"Download invoice"* in `SellerTopbar` action slot.
- **Design Tokens:** Button: `<FileDown/>` + *"Download invoice"*, `variant="outline"`. While generating: spinner + *"Generating..."*, disabled. Invoice PDF layout uses Ember & Cream palette with Fraunces heading + Inter body (implemented as static HTML→PDF template).
- Must use an existing Node PDF library (e.g., `@react-pdf/renderer` or `puppeteer`). No new service dependencies.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=orders/invoice-pdf
# Verify PDF generation for order with IGST (inter-state) vs CGST/SGST (intra-state)
# Verify R2 upload URL stored on order record
npm run lint
```

---

---

# EPIC 09 — Tally CSV Export

---

### EP-09-001 — Item Master CSV Export

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** export my product catalog as a TallyPrime-compatible CSV, **so that** I can import it into Tally without manual re-entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- Exports all active `tenant_products` for the tenant in TallyPrime Item Master CSV format.
- Required columns: `Name`, `Part No.` (internal_sku), `HSN/SAC`, `GST Rate (%)`, `Unit`, `MRP`, `Opening Balance`, `Opening Rate`.
- `Opening Balance` and `Opening Rate` default to 0 in MVP.
- File name: `DealFlow_ItemMaster_{tenant_slug}_{YYYY-MM-DD}.csv`.
- Download is triggered directly (no email); file served as `Content-Type: text/csv` with download disposition.
- `df_tally_export` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/exports` page within `SellerShell`. Nav: `<FileDown/>` Exports. Separate CTA cards for each export type.
- **Design Tokens:** Export card: `bg-cream-100 rounded-lg p-5 shadow-xs border border-cream-200`. Export type icon: `<Package/>` for Item Master. Download button: `<FileDown/>` + *"Export Item Master"*, `bg-teal-500`. Last exported: `text-cream-500 text-xs font-mono` below button.
- Must use existing shadcn/ui Card, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=exports/item-master
# Parse generated CSV; verify all required columns present
# Verify HSN + GST rate populated for all rows (no blank cells)
npm run lint
```

---

### EP-09-002 — Sales Voucher CSV Export

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** export orders as a TallyPrime Sales Voucher CSV, **so that** I can post revenue transactions into Tally in bulk.

#### 2. Acceptance Criteria (Functional Boundaries)
- Exports orders with `status IN ('dispatched', 'delivered')` for a user-selected date range.
- Required columns: `Date`, `Voucher No.` (order_number), `Buyer Ledger` (business_name), `Item Name`, `Qty`, `Rate`, `Amount`, `GST Rate`, `CGST`, `SGST`, `IGST`, `Total`.
- CGST/SGST vs IGST determined by comparing seller `primary_state` and buyer `geography.state`.
- File name: `DealFlow_SalesVoucher_{tenant_slug}_{from}_{to}.csv`.
- Date range picker on the Exports page for this export type.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/exports` — *"Sales Voucher"* export card below Item Master card.
- **Design Tokens:** Date range picker: `shadcn/ui DateRangePicker`. Export button: `<FileDown/>` + *"Export Sales Vouchers"`, `bg-teal-500`. Date range summary: `font-mono text-sm text-cream-600`.
- Must use existing shadcn/ui DateRangePicker, Card, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=exports/sales-voucher
# Verify inter-state order: IGST populated, CGST/SGST = 0
# Verify intra-state order: CGST = SGST = tax/2, IGST = 0
npm run lint
```

---

### EP-09-003 — Ledger Master CSV Export

#### 1. Objective & User Value
- **As a** `seller_admin` or `seller_assistant`, **I want to** export my buyer list as a TallyPrime Ledger Master CSV, **so that** I can create customer accounts in Tally without manual entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- Exports all active buyers for the tenant.
- Required columns: `Name` (business_name), `Group` (defaults to *"Sundry Debtors"*), `GST No.` (gstin), `State`, `Address`, `Pincode`, `Opening Balance` (defaults to 0).
- File name: `DealFlow_LedgerMaster_{tenant_slug}_{YYYY-MM-DD}.csv`.
- Buyers with missing GSTIN export with a blank `GST No.` cell (not an error).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/exports` — *"Ledger Master"* export card.
- **Design Tokens:** Same card pattern as Item Master and Sales Voucher exports. Export button: `<Users/>` icon + *"Export Ledger Master"*, `bg-teal-500`.
- Must use existing shadcn/ui Card, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=exports/ledger-master
# Parse generated CSV; verify column headers match TallyPrime format exactly
npm run lint
```

---

---

# EPIC 10 — Search

---

### EP-10-001 — Full-Text Search Index (tsvector + GIN)

#### 1. Objective & User Value
- **As a** developer/system, **I want** a generated `tsvector` column and GIN index on products, **so that** full-text search queries are fast and return ranked results without external infrastructure.

#### 2. Acceptance Criteria (Functional Boundaries)
- A generated column `search_doc tsvector` added to `catalog.products` and `app.tenant_products`, built from: product name (weight A), brand name (weight B), category name (weight B), description (weight C), and HSN code (weight D).
- GIN index created on `search_doc`.
- `catalog.product_aliases.alias` included in the tsvector via a trigger that updates `search_doc` on alias insert/update.
- `websearch_to_tsquery` used for query parsing (handles partial matches, phrase queries).
- `ts_rank_cd` returns a ranked result set.
- `df_search` feature flag must be enabled.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No direct UI for this story. This is a backend-only migration.
- Downstream search results UI uses this index via the `search_products` RPC (EP-10-003).

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/search_fts.sql
# Verify GIN index used in EXPLAIN ANALYZE for tsquery
# Verify alias inclusion: alias 'CCTV' matches product named 'Security Camera'
npm run lint
```

---

### EP-10-002 — pgvector Semantic Search

#### 1. Objective & User Value
- **As a** developer/system, **I want** product embeddings stored in a pgvector column with an HNSW index, **so that** intent-based queries ("wide angle dome camera") match products even without exact keyword overlap.

#### 2. Acceptance Criteria (Functional Boundaries)
- `embedding vector(1536)` column on `catalog.products` and `app.tenant_products`; backfilled via a Supabase scheduled function using OpenAI `text-embedding-3-small`.
- HNSW index created: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`.
- A batch backfill job embeds all existing products on first run; incremental updates run on product create/update (pg_cron, low priority, does not block writes).
- Embedding input: concatenation of `name + brand_name + category_name + description + attributes`.
- Semantic search query: embed the user's search string at query time → compute cosine distance → return top-K results.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No direct UI. Backend infrastructure for search_products RPC.
- Error handling: if embedding service unavailable, fall back to pure FTS only (degraded gracefully, no error to user).

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/search_vector.sql
# Verify HNSW index used in EXPLAIN ANALYZE for vector search
# Verify semantic fallback: disable embedding service mock → FTS results returned
npm run lint
```

---

### EP-10-003 — Hybrid Search RPC (`search_products`)

#### 1. Objective & User Value
- **As a** developer/system, **I want** a single `app.search_products(tenant_id, query, filters)` RPC that combines FTS and vector search with weighted scoring, **so that** the frontend has one stable entry point and search quality is better than either method alone.

#### 2. Acceptance Criteria (Functional Boundaries)
- Function signature: `app.search_products(tenant_id uuid, query text, filters jsonb DEFAULT '{}') RETURNS TABLE (tenant_product_id uuid, name text, brand_name text, score numeric, ...)`.
- Hybrid score: `0.6 * fts_rank + 0.4 * (1 - vector_distance)`, normalized 0–1.
- Filters supported: `brand_id`, `category_id`, `min_price`, `max_price`, `in_stock_only` (requires `tenant_inventory`).
- Results ordered by `score DESC`, limit 50.
- Empty query string returns all active products for the tenant (no FTS, no vector, plain listing).
- Function is gated by RLS — only returns products visible to the calling tenant/buyer.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No direct UI. Called by search components in cockpit and buyer app.
- Results must return within 500ms at MVP scale (< 10k products per tenant); validated in integration test.

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/search_hybrid.sql
# Verify hybrid score > pure FTS for intent query 'surveillance camera'
# Verify filter: brand_id excludes other brand results
# Verify RLS: tenant B cannot see tenant A products in results
npm run lint
```

---

### EP-10-004 — Search UI in Cockpit and Buyer App

#### 1. Objective & User Value
- **As a** `seller_admin/assistant`, **I want** a search bar in the Products page, and **as a** buyer, **I want** a search bar in the catalog view, **so that** finding a product is instant and doesn't require scrolling through hundreds of SKUs.

#### 2. Acceptance Criteria (Functional Boundaries)
- Search input debounced 300ms → calls `search_products` RPC → results rendered in real time.
- Cockpit search: covers `app.tenant_products`; results show product name, brand, SKU, price.
- Buyer app search: covers the active catalog's products only; results show product name, price, image thumbnail.
- No results state: *"No products found for '{query}'. Try different keywords."*
- Search state is reflected in the URL query param `?q=` for shareability (cockpit) and back-navigation (buyer app).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Cockpit: `<Search/>` input in `SellerTopbar` on the Products page. Buyer app: `<Search/>` bar at the top of `/shop/catalog` below the hero image.
- **Design Tokens:** Search input: `bg-cream-50 border border-cream-300 rounded-md shadow-xs`. Focus: `ring-2 ring-ember-400`. Result items cockpit: table rows with `font-mono` SKU. Result items buyer app: same product card grid as catalog browse. Loading: skeleton shimmer in `bg-cream-200`.
- Must use existing shadcn/ui Input, Skeleton, Command components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=search/ui
# Verify debounce: RPC called once after 300ms, not on every keystroke
# Verify URL param ?q= updated on search
# Verify no-results state renders
npm run lint
```

---

---

# EPIC 11 — RBAC + Multitenant Security

---

### EP-11-001 — JWT Custom Claims Hook (tenant_id, role, buyer_id)

#### 1. Objective & User Value
- **As a** system, **I want** every authenticated JWT to carry `tenant_id`, `role`, and `buyer_id` (if applicable) as custom claims, **so that** RLS policies and server components can enforce authorization without additional DB lookups on every request.

#### 2. Acceptance Criteria (Functional Boundaries)
- Supabase Auth custom claim hook (`auth.hook_jwt_claims`) populates: `tenant_id` (from `tenant_users`), `role` (from `tenant_users.role`), `buyer_id` (from `buyer_users`, nullable).
- A user with access to multiple tenants gets the claim for their "current" tenant (resolved by subdomain at login time); switching tenants requires re-authentication or an explicit tenant-switch RPC.
- JWT claims are verified server-side in Next.js via `getUser()` + `jwtPayload`; client-supplied `tenant_id` headers are never trusted without JWT verification.
- Claims refresh when user role or tenant membership changes (handled by Supabase session refresh).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No UI for this story (backend-only).
- Auth errors that indicate stale claims redirect to `/login` with a `?reason=session_expired` param and display: *"Your session has expired. Please log in again."* in a `bg-amber-50 border border-amber-200 rounded-md p-3` banner.

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/jwt_claims.sql
# Verify tenant_id claim matches tenant_users row
# Verify buyer_id null for seller roles
npm run test:integration -- --testPathPattern=auth/jwt-claims
npm run lint
```

---

### EP-11-002 — Row-Level Security Policies on All `app.*` Tables

#### 1. Objective & User Value
- **As a** system, **I want** RLS policies on every `app.*` table that enforce tenant isolation and role-based access, **so that** a compromised or malicious JWT cannot read or write another tenant's data.

#### 2. Acceptance Criteria (Functional Boundaries)
- Every `app.*` table has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- SELECT policies: `auth.jwt() ->> 'tenant_id' = tenant_id::text`.
- INSERT/UPDATE policies additionally check role via `auth.jwt() ->> 'role' IN ('seller_admin', 'seller_assistant')` (or `seller_admin`-only for sensitive tables).
- `app.audit_log` is INSERT-only from application (no SELECT via RLS for non-admin; SECURITY DEFINER function writes it).
- `catalog.*` tables: `is_public = true` readable by all; non-public readable only by `origin_tenant_id`.
- Buyer-scoped tables (`published_catalogs`, `orders`, `price_lists`): buyer reads filtered by `auth.jwt() ->> 'buyer_id'`.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No UI. Backend-only.
- Application-level: any RLS violation returns a generic `403` to the client; never expose the actual SQL error.

#### 4. Automated Verification Steps
```
npx supabase test db --file=tests/rls_policies.sql
# 10 cross-tenant test cases (tenant A JWT → tenant B data)
# Verify each returns 0 rows (SELECT) or error (INSERT/UPDATE)
npm run lint
```

---

### EP-11-003 — Role-Based UI Gating in Seller Cockpit

#### 1. Objective & User Value
- **As a** system, **I want** the seller cockpit UI to show or hide controls based on the authenticated user's role, **so that** `seller_assistant` cannot see or accidentally trigger `seller_admin`-only actions.

#### 2. Acceptance Criteria (Functional Boundaries)
- `seller_assistant` hidden controls: cohort builder, price list management, tenant settings, deactivate buyer, manage cost_price, invite team members.
- Hidden means: either the nav item is absent OR the button is not rendered (not just disabled — never render sensitive controls for unauthorized roles).
- Server-side: even if `seller_assistant` guesses the URL (`/cohorts/new`), the underlying RPC rejects the call with a `403`.
- UI gate implemented via a `useRole()` hook that reads from the JWT claim.
- Feature flags AND role checks must both pass; a feature-off module is hidden regardless of role.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Applied globally across `app/(seller)/*` routes.
- **Design Tokens:** No special styling for hidden elements — they are simply not rendered. If a user navigates directly to a gated URL, render a centered `bg-cream-50` *"You don't have permission to access this page."* using existing shadcn/ui components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=rbac/ui-gating
# Render cockpit with seller_assistant JWT; assert cohort nav item absent
# Render with seller_admin JWT; assert cohort nav item present
npm run lint
npx tsc --noEmit
```

---

### EP-11-004 — Cross-Tenant Security Test Suite

#### 1. Objective & User Value
- **As a** developer, **I want** a permanent integration test suite that attempts cross-tenant data access, **so that** every PR is automatically protected against multitenant data leakage regressions.

#### 2. Acceptance Criteria (Functional Boundaries)
- 10 integration tests covering: SELECT tenant B products with tenant A JWT, INSERT order to tenant B with tenant A JWT, UPDATE buyer in tenant B with tenant A JWT, access buyer app catalog from wrong tenant, access cockpit with buyer JWT.
- Tests run with feature flags both ON and OFF to ensure flag-off features cannot be reached via API.
- All 10 tests must pass and return `0 rows` or `error` (never real data).
- Tests run in CI on every PR via `npm run test:security`.
- Tests use isolated Supabase test DB seeded with two tenants + fixture data.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No UI. CI test suite.

#### 4. Automated Verification Steps
```
npm run test:security
# All 10 cross-tenant tests pass
# Flag-on + flag-off variants both tested
```

---

### EP-11-005 — Seller / Buyer Route Isolation

#### 1. Objective & User Value
- **As a** system, **I want** seller routes and buyer routes to be fully isolated — authenticated buyers cannot access cockpit routes and authenticated sellers cannot bypass the buyer app's buyer-only data views, **so that** each user sees only their appropriate surface.

#### 2. Acceptance Criteria (Functional Boundaries)
- Requests to `app/(seller)/*` with a buyer JWT (role = `buyer_admin` or `buyer_assistant`) are rejected → redirect to `/shop/home`.
- Requests to `app/(buyer)/*` with a seller JWT are rejected → redirect to `/dashboard`.
- Middleware enforces this check before any route handler executes.
- A user legitimately associated with both a seller role and a buyer role (edge case) is handled by explicit tenant-switch; the app never combines both roles in one session.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** No UI beyond the redirect behavior. Both target pages already exist.

#### 4. Automated Verification Steps
```
npm run test:integration -- --testPathPattern=middleware/route-isolation
# Buyer JWT → seller route: verify redirect to /shop/home
# Seller JWT → buyer route: verify redirect to /dashboard
npm run lint
```

---

---

# EPIC 12 — Zoho Integration

---

### EP-12-001 — Zoho OAuth Connection Setup

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want to** connect my Zoho Books/Inventory account via OAuth, **so that** my DealFlow data can sync to Zoho without manual re-entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- A *"Connect Zoho"* button in **Settings → Integrations** initiates the Zoho OAuth 2.0 flow (authorization code grant).
- On successful OAuth, access token + refresh token stored securely (encrypted in `app.tenants.settings` JSONB under `zoho_tokens`).
- Token refresh is handled automatically before API calls; expired refresh tokens display: *"Zoho connection expired. Reconnect to continue syncing."*
- Disconnecting clears the tokens and deactivates all Zoho sync jobs for the tenant.
- `df_zoho_integration` feature flag must be enabled; integration tile hidden if flag is off.
- WineYard is the pilot tenant; flag enabled for `wineyard` tenant only initially.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/settings/integrations` within `SellerShell`. Zoho tile: `bg-cream-100 rounded-lg border border-cream-200 p-5` with Zoho logo + connection status.
- **Design Tokens:** Connected state: `<CheckCircle/>` in `text-teal-500` + *"Connected"* in `text-teal-700`. Disconnected: `<AlertCircle/>` in `text-cream-400` + *"Not connected"*. Connect button: `bg-teal-500`, Disconnect: `variant="destructive"`.
- Must use existing shadcn/ui Card, Button components. Never display raw tokens in the UI.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=integrations/zoho-oauth
# Mock Zoho OAuth server; verify tokens stored (not logged, not exposed in response)
# Verify token refresh called when access token expired
npm run lint
```

---

### EP-12-002 — Item Master Sync to Zoho

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want** my product catalog to sync to Zoho Inventory as Items, **so that** I don't have to maintain two systems for product data.

#### 2. Acceptance Criteria (Functional Boundaries)
- On demand (manual *"Sync items"* button) and on product create/update (async, via pg_cron queue), tenant products are pushed to Zoho Inventory Items API.
- Mapping: `internal_sku` → Zoho `sku`, `name` → `name`, `mrp` → `rate`, `hsn_code` → `hsn_or_sac`, `gst_rate` → `tax_percentage`, `default_uom` → `unit`.
- On first sync, creates new item in Zoho; on subsequent syncs, updates existing (matched by `external_ref` = Zoho item ID).
- Sync errors (Zoho API 4xx/5xx) are logged per product with timestamp and error message; visible in a sync log table in the integration settings page.
- `cost_price` is NOT synced to Zoho (privacy).

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/settings/integrations` — Zoho tile expanded with *"Sync Items"* (`<RefreshCw/>` + label) button and a sync log table.
- **Design Tokens:** Sync log table: `font-mono text-xs`. Error rows: `bg-danger-50`. Success rows: `bg-teal-50`. Last synced timestamp: `text-cream-500 text-xs`.
- Must use existing shadcn/ui Table, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=integrations/zoho-items
# Mock Zoho Items API; verify payload includes all required fields
# Verify cost_price NOT in payload
# Verify external_ref updated after first sync
npm run lint
```

---

### EP-12-003 — Customer Master Sync to Zoho

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want** my buyer list to sync to Zoho Books as Contacts/Ledgers, **so that** invoice generation in Zoho has correct customer data.

#### 2. Acceptance Criteria (Functional Boundaries)
- On demand (manual *"Sync customers"* button) and on buyer create/update (async queue), buyers are pushed to Zoho Books Contacts API.
- Mapping: `business_name` → Zoho `contact_name`, `gstin` → `gst_no`, `phone` → `mobile`, `email` → `email`, `geography.state` → `state`.
- Create new / update existing (matched by `external_ref` = Zoho contact ID).
- Inactive buyers (`is_active = false`) are not synced.
- Sync errors logged per buyer in the sync log.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** `app/(seller)/settings/integrations` — *"Sync Customers"* (`<Users/>` + label) button below *"Sync Items"*.
- **Design Tokens:** Same sync log pattern as item sync. Must use existing shadcn/ui Table, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=integrations/zoho-customers
# Mock Zoho Contacts API; verify inactive buyer NOT in payload
# Verify GSTIN correctly mapped to gst_no
npm run lint
```

---

### EP-12-004 — Sales Order / Invoice Push to Zoho

#### 1. Objective & User Value
- **As a** `seller_admin`, **I want** confirmed or dispatched orders to be pushed to Zoho Books as Sales Orders, **so that** invoice generation and revenue recording in Zoho stays current without manual entry.

#### 2. Acceptance Criteria (Functional Boundaries)
- Triggered automatically when order status transitions to `confirmed` (sales order push) or `dispatched` (invoice push).
- Sales order payload: order_number, buyer Zoho contact_id (from `external_ref`), line items (Zoho item_id from product `external_ref`, qty, rate, tax_id).
- Both buyer and product must have a valid `external_ref` (Zoho ID); if missing, sync is skipped and a warning logged: *"Sync skipped: buyer or product not yet synced to Zoho."*
- Order `external_ref` updated with the Zoho Sales Order ID after successful push.
- Manual *"Retry sync"* button on the order detail page for failed syncs.

#### 3. Design System & UI/UX Constraints
- **UI Placement:** Order detail page `app/(seller)/orders/[id]` — Zoho sync status chip in the order header. *"Retry sync"* button (`<RefreshCw/>`) visible only when sync has failed.
- **Design Tokens:** Sync status chip — Synced: `bg-teal-100 text-teal-700`, Failed: `bg-danger-50 text-danger-600`, Pending: `bg-cream-200 text-cream-600`. Retry button: `<RefreshCw/>` + *"Retry sync"*, `variant="outline"`.
- Must use existing shadcn/ui Badge, Button components.

#### 4. Automated Verification Steps
```
npm run test:unit -- --testPathPattern=integrations/zoho-orders
# Verify skip behavior when buyer external_ref is null
# Verify order external_ref updated after successful push
# Verify retry button visible only on failed sync status
npm run lint
```

---

---

## Dependency Map

```
EP-01 (Onboarding) ──► EP-02 (Brand/Product) ──► EP-05 (Pricing)
                   └──► EP-03 (Customer Master) ──► EP-04 (Cohorts) ──► EP-06 (Catalog)
                                                                    └──► EP-05
EP-06 (Catalog) ──► EP-07 (Buyer PWA)
EP-07 ──► EP-08 (Order Management)
EP-08 ──► EP-09 (Tally Export)
EP-01-004 (Flags) ──► ALL other epics
EP-11 (RBAC) ──► ALL epics (runs in parallel from day 1)
EP-10 (Search) ──► EP-06 + EP-07 (enhances, not blocks)
EP-12 (Zoho) ──► EP-02 + EP-03 + EP-08 (depends on data existing)
```

## Build Sequence (12-Week Alignment)

| Week | Stories to Complete |
|------|---------------------|
| 1 | EP-01-001 through EP-01-005, EP-11-001, EP-11-002 |
| 2 | EP-11-003, EP-11-005 + Design system tokens + Shell layouts |
| 3 | EP-02-001 through EP-02-008 |
| 4 | EP-03-001 through EP-03-005, EP-04-001 through EP-04-004 |
| 5 | EP-05-001 through EP-05-005 |
| 6 | EP-06-001 through EP-06-006 |
| 7 | EP-07-001 through EP-07-003 + EP-07-009 |
| 8 | EP-07-004 through EP-07-008 |
| 9 | EP-08-001 through EP-08-005 |
| 10 | EP-10-001 through EP-10-004 |
| 11 | EP-09-001 through EP-09-003, EP-12-001 through EP-12-004 |
| 12 | EP-11-004, polish, cross-tenant tests, onboarding |

---

*Generated from DealFlow_Product-Spec_v1 (rev 2026-05-19) | 63 stories across 12 epics*
