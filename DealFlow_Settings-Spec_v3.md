# DealFlow — Settings Section Spec

**Version:** 4.0  
**Status:** Draft  
**Owner:** Phani  
**Access:** `seller_admin` only. `seller_assistant` has no access. Every save is written to `app.audit_log`.

**Changelog:**
- v4.0 — Added Business Policy (credit toggle, GST-inclusive pricing). Per-type document number formats with chip-token UI. PostHog flag sync on module toggle saves. UI consistency fixes (typography, table layout, page alignment). Cohorts/Catalogs module toggles now gate nav and buyer app.

---

## 1. Purpose

The Settings section is the distributor admin's control panel for:

1. **System configuration** — business identity, business policy, defaults, locations, notifications
2. **Feature control** — turn modules on or off and configure their behavior
3. **Tier awareness** — surface locked features with upgrade nudges

---

## 2. Pricing Tiers

Three tiers: **Starter**, **Growth**, **Scale**.

Starter is self-serve (signup infra is a separate sprint; v1 is ops-assisted). Growth and Scale differ primarily on usage limits, not features.

### Tier Feature Matrix

| Feature / Module | Starter | Growth | Scale |
|---|:---:|:---:|:---:|
| Brand & Product Master | ✅ | ✅ | ✅ |
| Customer (Buyer) Master | ✅ | ✅ | ✅ |
| Orders (basic workflow) | ✅ | ✅ | ✅ |
| Buyer Enquiries toggle | ✅ | ✅ | ✅ |
| Sales Orders toggle | ✅ | ✅ | ✅ |
| Invoices toggle + PDF | ✅ | ✅ | ✅ |
| Tally CSV Export | ✅ | ✅ | ✅ |
| Search (full-text + pgvector) | ✅ | ✅ | ✅ |
| Zoho Books / Inventory integration | ✅ | ✅ | ✅ |
| Locations | ✅ | ✅ | ✅ |
| WhatsApp notifications (credits-based) | ✅ | ✅ | ✅ |
| Cohorts | ✅ | ✅ | ✅ |
| Pricing Engine (price lists per cohort) | ✅ | ✅ | ✅ |
| Catalog Publishing + share token | ✅ | ✅ | ✅ |
| Buyer App (WhatsApp OTP PWA) | ✅ | ✅ | ✅ |
| **Cohort limit** | 5 | 20 | Unlimited |
| **Price list limit** | 2 | 10 | Unlimited |
| **Published catalog limit** | 3 | 15 | Unlimited |
| Custom subdomain | — | — | ✅ (v2 scope) |
| AI features (Phase 2) | — | — | ✅ |
| Replenishment forecasting (Phase 2) | — | — | ✅ |
| Payments (Phase 2) | — | — | ✅ |

**Search** is always on for all tiers — no toggle, no configuration needed in v1.

Tier limits are app-layer constants, not stored in the DB:

```ts
// src/constants/tier-limits.ts
export const TIER_LIMITS = {
  starter: { cohorts: 5,        price_lists: 2,  catalogs: 3  },
  growth:  { cohorts: 20,       price_lists: 10, catalogs: 15 },
  scale:   { cohorts: Infinity, price_lists: Infinity, catalogs: Infinity },
} as const
```

`app.tenants.plan_tier` (enum: `starter | growth | scale`) is the single source of truth for a tenant's tier.

---

## 3. Settings Navigation

Six sub-routes within `/settings`:

| Sub-route | What lives here |
|---|---|
| **General** | Business profile, business policy, default product attributes, WhatsApp & notifications |
| **Team** | Users, roles, invites |
| **Feature Modules** | Order workflows, Buyer App, Catalog & Pricing |
| **Locations** | Warehouses / dispatch points with inventory flag |
| **Integrations** | Tally, Zoho |
| **Billing & Plan** | Current tier, usage, limits, upgrade CTA, WhatsApp credits |

> **Categories** are master data, not system settings. They live under Catalog (not here). General Settings holds only the *global fallback defaults* that pre-populate new category records.

---

## 4. General

One page with four grouped sections.

### 4.1 Business Profile

| Field | Type | Notes |
|---|---|---|
| Company name | Text | Used in buyer PWA and exports |
| Logo | Image upload (R2) | Max 5MB, PNG/JPG/WebP |
| GSTIN | Text | Validated 15-char alphanumeric |
| Address | Text fields | Line 1, Line 2, City, State, Pincode |
| Business phone | Tel | Used as WhatsApp sender for OTP |
| Business email | Email | Reply-to for transactional comms |

### 4.2 Business Policy

Tenant-level flags that govern how the entire app behaves for this distributor. These affect composer UIs, PDFs, and buyer-facing screens.

#### 4.2.1 Credit

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable credit for buyers** | Toggle | On | If off, the seller operates on upfront/advance payment only. When disabled, all credit-related fields and displays are hidden across the app — see Section 4.2.1a. |

**4.2.1a — What hides when credit is disabled:**

| Location | What is hidden |
|---|---|
| Estimate / Sales Order / Invoice composer | Credit headroom indicator (available credit vs. order value) |
| Estimate / Sales Order / Invoice PDF | Credit terms line |
| Customers landing page table | Credit status column |
| Customer detail page | Credit section (credit limit, credit terms, outstanding balance) |
| Add / Edit Customer form | Credit limit field, credit terms field, net payment days field |
| Buyer app: Home KPI grid | Credit limit / available credit KPIs |
| Buyer app: Profile | Account credit section |
| Buyer app: Order screens | Credit headroom bar |

The fields remain stored in the DB; they are just hidden in the UI. Turning credit back on reveals them.

#### 4.2.2 GST Pricing

| Setting | Type | Default | Description |
|---|---|---|---|
| **GST included in prices** | Toggle | Off | If off (default), prices exclude GST and GST is shown separately. If on, prices are GST-inclusive and GST is not broken out explicitly. |

**When GST is excluded (default, toggle off):**
- Show GST rate field in Add/Edit Product form.
- Show GST line in Estimate / Sales Order / Invoice composer and PDF.
- Show default GST rate selector in Product Defaults (Section 4.3).
- GST is calculated and added to subtotal in all document totals.

**When GST is included (toggle on):**
- Hide GST rate field in Add/Edit Product form (existing stored rates are retained in DB but not displayed or used in calculations).
- Hide default GST rate selector in Product Defaults.
- Hide GST line in composer UIs and PDFs.
- Add a note in composer footer and PDF footer: *"All prices inclusive of GST."*
- All document totals show inclusive price only — no separate GST amount.

> ⚠️ **Migration note:** Toggling GST inclusive does not delete stored GST rates on products. If toggled back off, existing rates resume. Communicate this in the UI via a helper text: *"Product GST rates are preserved and will reapply if you switch back."*

### 4.3 Product Defaults

These are fallback values that pre-populate when creating a new **Category**. The actual values are set per-category on the Category record under Catalog.

| Field | Type | Default | Notes |
|---|---|---|---|
| Default GST rate (%) | Select | 18% | Options: 0 / 5 / 12 / 18 / 28. **Hidden when GST is included in prices (4.2.2 toggle on).** Pre-fills GST rate on new categories. |
| Default unit of measurement | Select | Piece (PCS) | Common UOMs: PCS, Box, Case, Kg, Litre, Metre. Pre-fills UOM on new categories. |

These defaults do not override existing category values — they only apply to new categories at creation time.

### 4.4 WhatsApp & Notifications

WhatsApp is the only notification channel. Delivery consumes credits purchased at tenant level (managed in Billing & Plan).

**Requires:** Buyer App enabled + WhatsApp Business Number configured in Feature Modules > Buyer App.

| Trigger | Default | Recipient | Description |
|---|---|---|---|
| Buyer Enquiry received | On | seller_admin | When a buyer submits an enquiry via PWA |
| Order placed | On | seller_admin | When a buyer places an order |
| Order confirmation to buyer | On | Buyer | When seller confirms the order |
| Dispatch notification | On | Buyer | When order status moves to Dispatched |
| Catalog shared | On | Buyer | When a catalog share link is created for a buyer |
| OTP delivery | System — always on | Buyer | Powers buyer login. Non-configurable. |

Low inventory alerts are per-product (driven by Tally/Zoho/Busy data), not configured here.

---

## 5. Team

### User list

Table: Name, Email, Role, Status (Active / Invited / Deactivated), Last login.  
Row actions: Edit role / Deactivate / Resend invite.

Table matches the standard app table pattern: search bar + role/status filter chips + sort control in the header row. No secondary title above the table — the page title and sub-nav are sufficient.

### Invite user

Fields: Email, Role (`seller_admin` | `seller_assistant`). Sends invite via Resend. Creates `app.tenant_users` record with `status = invited`.

### Role capabilities

| Capability | seller_admin | seller_assistant |
|---|:---:|:---:|
| Settings | ✅ | ✗ |
| Cost prices | ✅ | ✗ |
| Cohort + price list management | ✅ | ✗ |
| All other cockpit features | ✅ | ✅ |

### Constraints

- Cannot deactivate the last active `seller_admin`
- Admin cannot downgrade their own role
- Deactivated users are soft-deleted (`deleted_at` set)

---

## 6. Feature Modules

Three modules. Each follows a three-state card pattern (see Section 9).

**PostHog flag sync:** Every time module toggles are saved, call `syncTenantFeatureFlags(tenantId, flags)` to update PostHog group properties. See Section 16.

---

### 6.1 Order Workflows

**Tier:** All tiers. Orders cannot be disabled — this section configures how they flow.

#### Global order settings (always visible)

| Setting | Type | Default | Description |
|---|---|---|---|
| **Inventory lock stage** | Select | Sales Order | At which stage stock is reserved in `tenant_inventory`. Options: **Buyer Enquiry** / **Sales Order** / **Invoice**. Shown only if the relevant stage toggle is on. If the selected stage is later disabled, auto-resets to the nearest enabled stage. |

#### Sub-toggles with per-type settings

Each document type is an independent toggle. When a toggle is **on**, its sub-settings expand below it. When a toggle is **off**, the corresponding nav item is hidden in the cockpit sidebar and in the buyer app Orders tab.

**Estimates (Buyer Enquiries)**

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Estimates** | Toggle | Off | Enables the Estimates stage. Adds "Estimates" tab in Orders cockpit and in buyer app Orders. |
| **Estimate number format** | Token chip UI | `EST-{YYYY}-{SEQ}` | Shown when toggle is on. See token chip spec below. |

**Sales Orders**

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Sales Orders** | Toggle | Off | Enables confirmed Sales Order stage. Adds "Sales Orders" tab in Orders cockpit and in buyer app Orders. |
| **Sales Order number format** | Token chip UI | `SO-{YYYY}-{SEQ}` | Shown when toggle is on. |

**Invoices**

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Invoices** | Toggle | Off | Enables invoice creation and tracking. Adds "Invoices" tab in Orders cockpit and in buyer app Orders. |
| **Invoice number format** | Token chip UI | `INV-{YYYY}-{SEQ}` | Shown when toggle is on. |
| **Invoice PDF generation** | Toggle | Off | When on, a PDF invoice is generated and stored in R2 on invoice create or confirm. Shown under the Invoices toggle when Invoices is enabled. |

#### Document number format — token chip UI

Replace the current free-text input with a chip-based token builder:

- Available tokens displayed as clickable chips: `{YYYY}` `{MM}` `{DD}` `{SEQ}`
- A separator field (free text, max 5 chars, e.g. `-`, `/`, `_`) between tokens
- Live preview updates instantly as chips are added/removed/reordered
- The resulting format string (e.g. `EST-{YYYY}-{SEQ}`) is stored in DB
- Token chips can be dragged to reorder, or added/removed by clicking
- `{SEQ}` is always zero-padded to 4 digits minimum (e.g. 0001)
- **Sequence derivation:** The `{SEQ}` counter is derived at document generation time (inside the order creation RPC) by counting existing records of that document type for the tenant, not stored as a counter in settings. If documents were imported via CSV or Zoho/Tally integration, the sequence picks up from the highest existing number.

**Disabling a toggle with active records:** Confirmation dialog — "You have X open [estimates / sales orders / invoices]. Disabling will hide them from the cockpit but not delete them. Proceed?"

**PostHog flags updated on save:**
- `df_order_enquiries` → mirrors `orders.features.enquiries`
- `df_order_sales_orders` → mirrors `orders.features.sales_orders`
- `df_order_invoices` → mirrors `orders.features.invoices`

---

### 6.2 Buyer App

**Tier:** All tiers.  
**Default:** Off.

When disabled, all buyer PWA URLs return a "Not available" page and share tokens are inactive.

#### Master toggle: Enable Buyer App

Sub-settings shown only when master toggle is on.

| Setting | Type | Default | Description |
|---|---|---|---|
| **WhatsApp Business Number** | Text | — | AiSensy/Interakt registered number for OTP delivery. Required before any buyer can log in. |
| **Share link expiry** | Toggle | Off | If on, published catalog share links expire after N days. |
| **Share link expiry (days)** | Number | 90 | Shown only when expiry toggle is on. |
| **Credit limit visibility** | Toggle | On | Shown only when `credit_enabled` is true (4.2.1). If credit is disabled tenant-wide, this toggle is hidden — it has no effect without credit enabled. |
| **Show out-of-stock products** | Toggle | On | Tenant-wide. Controls whether zero-inventory products appear in buyer catalogs. On = shown with "Out of stock" label. Off = hidden from buyers. |

**Fixed (not configurable in v1):**
- OTP expiry: 10 minutes
- Persistent session duration: 15 days
- Buyer app branding: uses Business Profile logo (no per-tenant override in v1)

**WhatsApp credits:** OTP and notification delivery consumes credits. Credit balance and top-up is in Billing & Plan.

---

### 6.3 Catalog & Pricing

**Tier:** All tiers (subject to plan limits on cohort / price list / catalog counts).  
**Default:** Both toggles off.

When either toggle is off, the corresponding nav item (**Cohorts** / **Catalogs**) is hidden from the cockpit sidebar and from the buyer app where applicable.

**PostHog flags updated on save:**
- `df_cohorts` → mirrors `catalog.cohort_pricing_enabled`
- `df_catalog_publishing` → mirrors `catalog.catalog_publishing_enabled`

#### Cohort Pricing

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Cohort Pricing** | Toggle | Off | Activates Cohorts and Price Lists nav items in the cockpit. Without this, all buyers see base selling price only. |
| **Price visibility to buyers** | Select | Discounted price only | Options: Discounted price only / Show original + discounted / Hidden (show on request). |

When a tenant approaches their plan limit (≥ 80% used), an inline warning appears:  
*"You've used 4 of 5 cohorts on your Starter plan. Upgrade to Growth for up to 20."*

#### Catalog Publishing

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Catalog Publishing** | Toggle | Off | Activates the Catalogs nav item and share-token generation. |
| **Default catalog expiry (days)** | Number | 0 | How long a published catalog stays active. 0 = never expires. |

---

## 7. Locations

A list of the tenant's physical locations — warehouses, dispatch points, or retail branches. Used for inventory tracking and order fulfillment routing.

**Tier:** All tiers.  
**Design note:** This sub-route is self-contained and designed to be promoted to a top-level nav item in a future version without a rewrite.

### Location list

Table matches the standard app table pattern — same layout as Team: search bar + type filter chips + status filter chips + sort control in one header row. **No secondary redundant title above the table.** Columns: Name (with address sub-line), Type (badge), City, Inventory (Tracked / Info-only), Status (Active/Inactive), Actions.

Row actions: Edit / Deactivate (icon buttons, no label text — consistent with Team row actions).

### Add / Edit location

| Field | Type | Notes |
|---|---|---|
| Name | Text | e.g. "Mumbai Warehouse", "Delhi Branch" |
| Type | Select | Warehouse / Dispatch Point / Branch |
| Address | Text fields | Line 1, City, State, Pincode |
| Inventory tracking | Toggle | If on, this location participates in `tenant_inventory` stock levels. If off, it's informational only (e.g. a sales branch that doesn't hold stock). |
| Default location | Toggle | Only one location can be the default. Used to pre-fill location on new orders and inventory adjustments. |

### Constraints
- At least one active location must exist if inventory tracking is enabled on any product.
- Deactivating a location with open orders or stock is blocked until cleared.

---

## 8. Integrations

*(Full settings spec for each integration to be written separately. Outline below.)*

### 8.1 Tally Export

Available on all tiers. No enable/disable toggle — accessible via the Exports nav item. Settings here control export format only.

| Setting | Type | Default |
|---|---|---|
| Export format version | Select | Tally Prime |
| Company name in Tally | Text | Inherits Business Profile name |
| Default ledger group | Text | Sundry Debtors |
| Include cost price in Item Master | Toggle | Off |

### 8.2 Zoho Books / Inventory

Available on all tiers. Full spec to be written separately. Outline:

- OAuth connect / disconnect
- Sync direction: DealFlow → Zoho (v1 only; bi-directional in v2)
- Auto-sync orders toggle
- Auto-sync products toggle  
- Sync frequency: Real-time / Every hour / Daily
- Last sync timestamp + "Sync now" button
- Sync log (last 50 events with status + error details)

---

## 9. Feature Card States

Three states for every module card in Feature Modules.

#### State A: Tier-locked
Card is muted. Lock icon next to module name. Tier badge. "Upgrade to [tier] →" button links to Billing & Plan. All controls are non-interactive.

#### State B: Available, disabled
Toggle is off and interactive. Sub-settings are hidden until enabled.

#### State C: Available, enabled
Toggle is on. Key sub-settings expand inline. Full sub-settings accessible via "Configure →" link or inline accordion.

**Tier badge styles:**

| Tier | Style |
|---|---|
| Growth | `bg-amber-100 text-amber-800 border border-amber-200` |
| Scale  | `bg-purple-100 text-purple-800 border border-purple-200` |

---

## 10. Billing & Plan

### Current plan card
- Plan name badge
- Usage meters per limit (Cohorts X/5, Price Lists X/2, Catalogs X/3 — shown for Starter/Growth; "Unlimited" for Scale)
- WhatsApp credits: current balance + "Top up" CTA

### Feature comparison table
All features and limits across tiers. Current tier highlighted. Functions as the upgrade pitch.

### Upgrade CTA
- Starter → "Upgrade to Growth — higher limits on Cohorts, Price Lists, and Catalogs"
- Growth → "Upgrade to Scale — unlimited everything + future AI features"
- Scale → "You're on our highest tier."

**MVP:** CTA opens a contact form modal. No self-serve checkout. Starter self-serve signup infra is a separate sprint.

---

## 11. Data Model

### Lean approach for v1

One JSONB blob per tenant. One merge RPC. No per-feature-row table. Tier limits are app constants.

### `app.tenant_settings` (one row per tenant)

```sql
CREATE TABLE app.tenant_settings (
  tenant_id   uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE RESTRICT,
  settings    jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id)
);
```

### Settings JSONB shape

```json
{
  "business": {
    "company_name": "WineYard CCTV",
    "gstin": "27AABCW1234A1Z5",
    "logo_url": "https://r2.../logo.png",
    "address": { "line1": "", "city": "Mumbai", "state": "MH", "pincode": "400001" },
    "phone": "+919876543210",
    "email": "ops@wineyard.in"
  },
  "business_policy": {
    "credit_enabled": true,
    "gst_inclusive": false
  },
  "product_defaults": {
    "gst_rate": 18,
    "uom": "PCS"
  },
  "orders": {
    "enquiry_number_format": "EST-{YYYY}-{SEQ}",
    "sales_order_number_format": "SO-{YYYY}-{SEQ}",
    "invoice_number_format": "INV-{YYYY}-{SEQ}",
    "inventory_lock_stage": "sales_order",
    "invoice_pdf_enabled": false,
    "features": {
      "enquiries": false,
      "sales_orders": false,
      "invoices": false
    }
  },
  "buyer_app": {
    "enabled": false,
    "whatsapp_number": "",
    "share_link_expiry_enabled": false,
    "share_link_expiry_days": 90,
    "credit_limit_visible": true,
    "show_out_of_stock": true
  },
  "catalog": {
    "cohort_pricing_enabled": false,
    "price_visibility": "discounted_only",
    "catalog_publishing_enabled": false,
    "default_catalog_expiry_days": 0
  },
  "notifications": {
    "whatsapp": {
      "enquiry_received": true,
      "order_placed": true,
      "order_confirmed_to_buyer": true,
      "dispatch_to_buyer": true,
      "catalog_shared_to_buyer": true
    }
  },
  "tally": {
    "format_version": "prime",
    "company_name_override": "",
    "default_ledger_group": "Sundry Debtors",
    "include_cost_price": false
  }
}
```

**Migration note for `number_format`:** The old single `orders.number_format` field is deprecated. On first read, if `enquiry_number_format` is absent, derive defaults: copy `number_format` to all three per-type fields (or use the type-specific defaults above). The old field is ignored after migration.

### `app.locations` (separate table — not JSONB)

Locations are structured records, not config blobs. They need their own table for FK references from orders and inventory.

```sql
CREATE TABLE app.locations (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('warehouse', 'dispatch_point', 'branch')),
  address           jsonb NOT NULL DEFAULT '{}',
  inventory_tracking boolean NOT NULL DEFAULT true,
  is_default        boolean NOT NULL DEFAULT false,
  external_ref      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id),
  updated_by        uuid REFERENCES auth.users(id),
  deleted_at        timestamptz,
  UNIQUE (tenant_id, external_ref)
);

-- Only one default location per tenant
CREATE UNIQUE INDEX locations_one_default_per_tenant
  ON app.locations (tenant_id)
  WHERE is_default = true AND deleted_at IS NULL;
```

### Tier checking (app layer)

```ts
// src/lib/tier.ts
const TIER_ORDER = { starter: 0, growth: 1, scale: 2 } as const

export function meetsRequiredTier(
  tenantTier: keyof typeof TIER_ORDER,
  requiredTier: keyof typeof TIER_ORDER
): boolean {
  return TIER_ORDER[tenantTier] >= TIER_ORDER[requiredTier]
}

export function getRemainingLimit(
  tenantTier: keyof typeof TIER_LIMITS,
  resource: keyof (typeof TIER_LIMITS)['starter'],
  currentCount: number
): number {
  const limit = TIER_LIMITS[tenantTier][resource]
  return limit === Infinity ? Infinity : limit - currentCount
}
```

### Single RPC for settings write

```sql
CREATE FUNCTION app.update_tenant_settings(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id uuid := (auth.jwt() ->> 'tenant_id')::uuid;
  v_role      text := auth.jwt() ->> 'role';
BEGIN
  IF v_role != 'seller_admin' THEN
    RAISE EXCEPTION 'Only seller_admin can modify settings';
  END IF;

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, p_patch, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE SET
    settings   = app.tenant_settings.settings || p_patch,
    updated_at = now(),
    updated_by = auth.uid();

  INSERT INTO app.audit_log (tenant_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_tenant_id, auth.uid(), 'tenant_settings', v_tenant_id::text, 'updated', p_patch);
END;
$$;
```

The app sends `PATCH /api/settings` with only the changed sub-object. The RPC deep-merges it into the existing blob.

---

## 12. Route Structure

```
app/(seller)/settings/
├── page.tsx                     → Redirect to /settings/general
├── layout.tsx                   → Settings shell with left sub-nav
├── general/page.tsx             → Business Profile + Business Policy + Product Defaults + Notifications
├── team/page.tsx                → Team & Users
├── modules/
│   └── page.tsx                 → Feature Modules (all cards on one page)
├── locations/page.tsx           → Locations list + add/edit
├── categories/page.tsx          → Categories list + add/edit
├── integrations/
│   ├── page.tsx                 → Integrations list
│   ├── tally/page.tsx           → Tally settings
│   └── zoho/page.tsx            → Zoho OAuth + sync settings
└── billing/page.tsx             → Billing & Plan
```

Each route requires a `loading.tsx` skeleton per the project navigation standard.

---

## 13. UI Standards for Settings Pages

Settings pages must conform to the same layout and typography standards as all other cockpit pages (per Yukti Design System R12).

### 13.1 Page layout

- Use the same `PageWrap` shell as other cockpit pages.
- Content area: `max-w-[1440px] mx-auto px-6` (or the project-standard shell — no custom narrower constraint on the outer shell).
- Form content within settings sections: `max-w-[740px]` (current, correct) for readability of form fields.
- The Modules page and the Settings base redirect page must not apply a narrower max-width to the outer shell — only to the inner form content.

### 13.2 Typography

Apply Yukti R12 standards uniformly:
- Body / form labels: `text-sm font-medium` (14px Inter 500, mapped to `--yk-text-base`).
- Helper text / captions: `text-xs text-muted-foreground` (12px Inter 500).
- Section headings within cards: `text-sm font-semibold uppercase tracking-wide text-muted-foreground` (same as table column headers across the app).
- Do not use `text-xs` for primary form labels — this is the current bug making Settings text look smaller than the rest of the app.

### 13.3 Table layout

All sub-route tables (Locations, Categories) must match the Team table pattern:

- **One page title** — from `SellerTopbar`. No secondary repeated title above the table.
- **Table header row** with: search input (left), filter chips (role/type/status — contextual), sort dropdown (right).
- **Columns:** name column first (with optional sub-line for address/slug), badge columns, status column, actions column (icon buttons only, no text labels).
- **No nested card-within-card layout** with its own header/title — the section card wrapping the table gets the icon + description only, no additional `<h2>` title duplicating the page title.

---

## 14. PostHog Feature Flag Sync

When module toggle settings are saved, the API route (`PATCH /api/settings`) must call PostHog's server-side group identify to sync the relevant flags as group properties on the tenant.

### Pattern

```ts
// src/lib/posthog-server.ts
import { PostHog } from 'posthog-node'

const phServer = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: 'https://app.posthog.com',
})

export async function syncTenantFeatureFlags(
  tenantId: string,
  flags: {
    df_order_enquiries?: boolean
    df_order_sales_orders?: boolean
    df_order_invoices?: boolean
    df_cohorts?: boolean
    df_catalog_publishing?: boolean
  }
) {
  phServer.groupIdentify({
    groupType: 'tenant',
    groupKey: tenantId,
    properties: flags,
  })
  await phServer.flushAsync()
}
```

Call `syncTenantFeatureFlags` after a successful `app.update_tenant_settings` RPC call, only when the patch includes `orders.features` or `catalog` keys.

### Architecture note (important)

PostHog group properties are the **secondary** gate. The DB settings blob (`tenant_settings.settings`) is the **primary** gate. The app reads feature state from the settings hook (`useTenantSettings`) for immediate UI decisions (navbar visibility, field hiding). PostHog flags are used for analytics segmentation and for feature-flag-based rollouts via the PostHog dashboard. Never make the app block-render waiting for PostHog — if PostHog is unavailable, fall back to DB settings.

### Flags synced

| PostHog group property | DB field |
|---|---|
| `df_order_enquiries` | `orders.features.enquiries` |
| `df_order_sales_orders` | `orders.features.sales_orders` |
| `df_order_invoices` | `orders.features.invoices` |
| `df_cohorts` | `catalog.cohort_pricing_enabled` |
| `df_catalog_publishing` | `catalog.catalog_publishing_enabled` |

---

## 15. What Lives Where — Quick Reference

| Thing | Lives in |
|---|---|
| Company name, logo, GSTIN | Settings > General > Business Profile |
| Credit enabled / GST inclusive | Settings > General > Business Policy |
| Default GST rate, default UOM | Settings > General > Product Defaults (fallback only; GST rate hidden when GST inclusive) |
| Per-category GST rate, HSN code, UOM | Catalog > Categories (category record) |
| WhatsApp notification toggles | Settings > General > Notifications |
| Team members and roles | Settings > Team |
| Order workflow toggles, per-type number format, inventory lock | Settings > Feature Modules > Orders |
| Buyer App enable, WhatsApp number | Settings > Feature Modules > Buyer App |
| Credit limit visibility, out-of-stock visibility | Settings > Feature Modules > Buyer App (tenant-wide; credit limit toggle hidden when credit disabled) |
| Cohort pricing, catalog publishing | Settings > Feature Modules > Catalog & Pricing |
| Search | Always on — no settings needed |
| Warehouse / dispatch locations | Settings > Locations |
| Tally export format | Settings > Integrations > Tally |
| Zoho sync config | Settings > Integrations > Zoho |
| Plan tier, usage meters, credit balance | Settings > Billing & Plan |

---

## 16. Out of Scope (v1)

- Self-serve plan upgrades (contact form modal only in v1)
- Starter self-serve signup infra (separate sprint)
- Custom subdomain (v2)
- Buyer app branding (logo override, accent color)
- Per-user notification preferences
- Webhook configuration
- API key management
- Audit log viewer in UI
- Returns / refunds configuration
- Quantity-based (breakpoint) pricing
- Minimum order value
- Multi-location inventory routing rules
- Payment gateway configuration (Phase 2)
- AI features (Phase 2)

---

## 17. Open Questions

| # | Question | Owner |
|---|---|---|
| 1 | Integrations — full settings spec for Tally and Zoho | Spec separately |
| 2 | WhatsApp credits — purchase flow, balance top-up, credit depletion warnings | Spec separately |
| 3 | Order number format — zero-padding width for `{SEQ}` (default: 4 digits). Confirm. | Phani |
| 4 | Locations — will they need to appear on the order form in v1, or is a single default location sufficient for now? | Phani |
| 5 | Categories spec — HSN code field, parent/child category hierarchy depth | Spec under Catalog |
| 6 | GST inclusive toggle — does switching from exclusive → inclusive retroactively affect historical invoice PDFs? (Recommendation: no — only affects new documents going forward) | Phani |
| 7 | Credit toggle — when credit is disabled, should in-flight orders with credit headroom show a warning, or silently hide? | Phani |

---

## 18. Best Practice Notes & Red Flags

### ✅ Confirmed correct

- JSONB blob with single merge RPC is the right lean approach for v1 — avoids schema proliferation.
- DB is primary source of truth for feature gates; PostHog is secondary (analytics + targeting).

### ⚠️ Deviations to watch

1. **Sequence counter in settings** — Do not store a `{SEQ}` counter in `tenant_settings`. The sequence must be derived at order generation time by the RPC via `COUNT` of existing records. Settings only stores the format string. Storing a counter in settings creates race conditions under concurrent order creation.

2. **GST inclusive + existing product data** — When `gst_inclusive` is toggled on, stored `gst_rate` values on products become dormant but are not deleted. The UI must communicate this clearly. Do not zero-out or delete product GST rates on toggle — reversibility is important.

3. **PostHog as "golden source"** — Reclarified: the DB blob is the actual golden source. PostHog flags mirror the DB. The app must not wait on PostHog for core feature gating. This avoids downtime if PostHog is unreachable.

4. **Single `number_format` → three per-type formats** — This is a breaking change in the JSONB shape. The API must handle backward compatibility: if the new per-type fields are absent, apply the defaults without error. The old `number_format` field can remain in the blob for a transition period and be ignored.

5. **Inventory lock stage auto-reset** — If the Inventory Lock Stage is set to "Buyer Enquiry" and Estimates are later disabled, the stage must auto-reset to "Sales Order" (or the next enabled stage) at save time, not silently leave an invalid state.
