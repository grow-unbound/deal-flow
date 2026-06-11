# DealFlow — Settings Section Spec

**Version:** 3.0  
**Status:** Draft  
**Owner:** Phani  
**Access:** `seller_admin` only. `seller_assistant` has no access. Every save is written to `app.audit_log`.

---

## 1. Purpose

The Settings section is the distributor admin's control panel for:

1. **System configuration** — business identity, defaults, locations, notifications
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
| **General** | Business profile, default product attributes, WhatsApp & notifications |
| **Team** | Users, roles, invites |
| **Feature Modules** | Order workflows, Buyer App, Catalog & Pricing |
| **Locations** | Warehouses / dispatch points with inventory flag |
| **Integrations** | Tally, Zoho |
| **Billing & Plan** | Current tier, usage, limits, upgrade CTA, WhatsApp credits |

> **Categories** are master data, not system settings. They live under Catalog (not here). General Settings holds only the *global fallback defaults* that pre-populate new category records.

---

## 4. General

One page with three grouped sections.

### 4.1 Business Profile

| Field | Type | Notes |
|---|---|---|
| Company name | Text | Used in buyer PWA and exports |
| Logo | Image upload (R2) | Max 2MB, PNG/JPG/SVG |
| GSTIN | Text | Validated 15-char alphanumeric |
| Address | Text fields | Line 1, Line 2, City, State, Pincode |
| Business phone | Tel | Used as WhatsApp sender for OTP |
| Business email | Email | Reply-to for transactional comms |

### 4.2 Product Defaults

These are fallback values that pre-populate when creating a new **Category**. The actual values are set per-category on the Category record under Catalog — these are just starting points to save time.

| Field | Type | Default | Notes |
|---|---|---|---|
| Default GST rate (%) | Select | 18% | Options: 0 / 5 / 12 / 18 / 28. Pre-fills GST rate on new categories. Most distributors deal in one dominant GST slab — set this once. |
| Default unit of measurement | Select | Piece (PCS) | Common UOMs: PCS, Box, Case, Kg, Litre, Metre. Pre-fills UOM on new categories. |

These defaults do not override existing category values — they only apply to new categories at creation time.

### 4.3 WhatsApp & Notifications

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

---

### 6.1 Order Workflows

**Tier:** All tiers. Orders cannot be disabled — this section configures how they flow.

#### Global order settings

| Setting | Type | Default | Description |
|---|---|---|---|
| **Order number format** | Text | `ORD-{YYYY}-{SEQ}` | Supported tokens: `{SEQ}` (zero-padded sequential), `{YYYY}`, `{MM}`, `{DD}`. App shows a live preview as the admin types. Example: `WY-{YYYY}-{SEQ}` → WY-2025-0001. Applied to all new orders going forward; does not retroactively renumber. |
| **Inventory lock stage** | Select | Sales Order | At which stage stock is reserved in `tenant_inventory`. Options: **Buyer Enquiry** / **Sales Order** / **Invoice**. |
| **Invoice PDF generation** | Toggle | Off | When on, a PDF invoice is generated and stored in R2 when an invoice is created or confirmed. |

#### Sub-toggles (all independent — no dependencies)

| Toggle | Feature key | Default | Description |
|---|---|---|---|
| **Buyer Enquiries** | `orders.enquiries` | Off | Enables the Enquiry stage. Buyer submits an enquiry via PWA; seller converts it to an order. Adds "Enquiries" sub-tab in the Orders cockpit. "Estimates" in other systems — renamed to match how Indian B2B distributors talk about this stage. |
| **Sales Orders** | `orders.sales_orders` | Off | Enables a confirmed Sales Order stage. Can be used with or without Buyer Enquiries. |
| **Invoices** | `orders.invoices` | Off | Enables invoice creation and tracking. Can be enabled independently of both Enquiries and Sales Orders. |

**Disabling a toggle with active records:** Confirmation dialog — "You have X open [enquiries / sales orders / invoices]. Disabling will hide them from the cockpit but not delete them. Proceed?"

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
| **Credit limit visibility** | Toggle | On | Tenant-wide. If off, credit limit is hidden everywhere — buyer PWA Profile, order screens, cockpit buyer detail. Use for tenants who do not offer credit (e.g. WineYard). If on, credit details are always shown. |
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

Table: Name, Type, City, Inventory tracking (Yes/No), Status (Active/Inactive).  
Row actions: Edit / Deactivate.

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
  "product_defaults": {
    "gst_rate": 18,
    "uom": "PCS"
  },
  "orders": {
    "number_format": "WY-{YYYY}-{SEQ}",
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
├── general/page.tsx             → Business Profile + Product Defaults + Notifications
├── team/page.tsx                → Team & Users
├── features/
│   ├── page.tsx                 → Feature Modules overview (all cards)
│   ├── orders/page.tsx          → Order Workflow sub-settings
│   ├── buyer-app/page.tsx       → Buyer App sub-settings
│   └── catalog/page.tsx        → Catalog & Pricing sub-settings
├── locations/page.tsx           → Locations list + add/edit
├── integrations/
│   ├── page.tsx                 → Integrations list
│   ├── tally/page.tsx           → Tally settings
│   └── zoho/page.tsx            → Zoho OAuth + sync settings
└── billing/page.tsx             → Billing & Plan
```

Each route requires a `loading.tsx` skeleton per the project navigation standard.

---

## 13. What Lives Where — Quick Reference

| Thing | Lives in |
|---|---|
| Company name, logo, GSTIN | Settings > General > Business Profile |
| Default GST rate, default UOM | Settings > General > Product Defaults (fallback only) |
| Per-category GST rate, HSN code, UOM | Catalog > Categories (category record) |
| WhatsApp notification toggles | Settings > General > Notifications |
| Team members and roles | Settings > Team |
| Order workflow toggles, number format, inventory lock | Settings > Feature Modules > Orders |
| Buyer App enable, WhatsApp number | Settings > Feature Modules > Buyer App |
| Credit limit visibility, out-of-stock visibility | Settings > Feature Modules > Buyer App (tenant-wide) |
| Cohort pricing, catalog publishing | Settings > Feature Modules > Catalog & Pricing |
| Search | Always on — no settings needed |
| Warehouse / dispatch locations | Settings > Locations |
| Tally export format | Settings > Integrations > Tally |
| Zoho sync config | Settings > Integrations > Zoho |
| Plan tier, usage meters, credit balance | Settings > Billing & Plan |

---

## 14. Out of Scope (v1)

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

## 15. Open Questions

| # | Question | Owner |
|---|---|---|
| 1 | Integrations — full settings spec for Tally and Zoho | Spec separately |
| 2 | WhatsApp credits — purchase flow, balance top-up, credit depletion warnings | Spec separately |
| 3 | Order number format — confirm supported tokens and zero-padding rules for `{SEQ}` | Phani |
| 4 | Locations — will they need to appear on the order form in v1, or is a single default location sufficient for now? | Phani |
| 5 | Categories spec — HSN code field, parent/child category hierarchy depth | Spec under Catalog |
