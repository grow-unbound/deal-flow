# DealFlow — Settings Section Spec

**Version:** 2.0  
**Status:** Draft  
**Owner:** Phani  
**Access:** `seller_admin` only. Every change is written to `app.audit_log`. `seller_assistant` has no access to Settings.

---

## 1. Purpose

The Settings section is the distributor admin's control panel for two distinct concerns:

1. **Feature configuration** — turn modules on or off for their business and configure them to match their workflow.
2. **Tier awareness** — surface features the tenant does not yet have access to, with clear upgrade nudges to drive plan upgrades.

The page is split into sections accessible via a left sub-nav within the Settings route. Visible only to `seller_admin`.

---

## 2. Pricing Tiers

Three tiers: **Starter**, **Growth**, **Scale**.

**Key principle:** Starter is self-serve (signup infra to be built). Growth and Scale are differentiated primarily by usage limits, not features. Zoho integration is available from Starter — it is the conversion wedge (WineYard).

### Tier Feature Matrix

| Feature / Module | Starter | Growth | Scale |
|---|:---:|:---:|:---:|
| Brand & Product Master | ✅ | ✅ | ✅ |
| Customer (Buyer) Master | ✅ | ✅ | ✅ |
| Orders (basic workflow) | ✅ | ✅ | ✅ |
| Buyer Enquiries (Estimates) toggle | ✅ | ✅ | ✅ |
| Sales Orders toggle | ✅ | ✅ | ✅ |
| Invoices toggle | ✅ | ✅ | ✅ |
| Invoice PDF generation toggle | ✅ | ✅ | ✅ |
| Tally CSV Export | ✅ | ✅ | ✅ |
| Search (full-text + pgvector) | ✅ | ✅ | ✅ |
| Zoho Books / Inventory integration | ✅ | ✅ | ✅ |
| Locations (delivery zones) | ✅ | ✅ | ✅ |
| WhatsApp notifications (credits-based) | ✅ | ✅ | ✅ |
| Cohorts | ✅ | ✅ | ✅ |
| Pricing Engine (price lists per cohort) | ✅ | ✅ | ✅ |
| Catalog Publishing + share token | ✅ | ✅ | ✅ |
| Buyer App (WhatsApp OTP PWA) | ✅ | ✅ | ✅ |
| **Cohort limit** | 5 | 20 | Unlimited |
| **Price list limit** | 2 | 10 | Unlimited |
| **Published catalog limit** | 3 | 15 | Unlimited |
| Custom subdomain (`{slug}.dealflow.in`) | — | — | ✅ (or paid addon) |
| AI-powered features (Phase 2) | — | — | ✅ |
| Replenishment forecasting (Phase 2) | — | — | ✅ |
| Payments (Phase 2) | — | — | ✅ |

> **Note:** Subdomain is not in v1 scope. All tenants use `dealflow.in/{slug}` for now.

### Tier limits stored as app constants

Tier limits (cohort count, price list count, catalog count) are **not stored in the DB** — they live in a TypeScript constants file checked at the app layer. This avoids a DB abstraction that adds no value in v1.

```ts
// src/constants/tier-limits.ts
export const TIER_LIMITS = {
  starter: { cohorts: 5, price_lists: 2, catalogs: 3 },
  growth:  { cohorts: 20, price_lists: 10, catalogs: 15 },
  scale:   { cohorts: Infinity, price_lists: Infinity, catalogs: Infinity },
} as const;
```

`app.tenants.plan_tier` (enum: `starter | growth | scale`) is the single source of truth for a tenant's tier.

---

## 3. Settings Navigation

Left sub-nav within `/settings`:

1. Business Profile
2. Team & Users
3. Feature Modules ← primary focus of this spec
4. WhatsApp & Notifications
5. Integrations
6. Billing & Plan

All sections are visible regardless of tier. Locked features show a clear locked state rather than being hidden — seeing what you're missing is the upgrade nudge.

---

## 4. Business Profile

Always available on all tiers.

| Field | Type | Notes |
|---|---|---|
| Company name | Text | Displayed in buyer app header and exports |
| Logo | Image upload (R2) | Max 2MB, PNG/JPG/SVG |
| GSTIN | Text | Validated 15-char alphanumeric |
| Address | Text fields | Line 1, Line 2, City, State, Pincode |
| Business phone | Tel | Used as WhatsApp sender number for OTP |
| Business email | Email | Reply-to for transactional comms |

**Not in v1:** Subdomain slug configuration (assigned by ops at tenant creation).

---

## 5. Team & Users

Always available on all tiers.

### User list
Table: Name, Email, Role, Status (Active / Invited / Deactivated), Last login, Actions (Edit role / Deactivate / Resend invite).

### Invite user
Fields: Email, Role (seller_admin | seller_assistant). Sends invite email via Resend.

### Roles
- `seller_admin` — full access including Settings
- `seller_assistant` — all cockpit access except Settings and cost prices

### Constraints
- Cannot deactivate the last active `seller_admin`
- Admin cannot downgrade their own role
- Deactivated = soft-deleted (`deleted_at`)

---

## 6. Feature Modules

Each module follows a three-state card pattern (see Section 10). The page groups modules into logical sections.

---

### 6.1 Order Workflows

**Tier:** All tiers (core product)  
Orders cannot be disabled. This section configures how orders flow through the business.

#### Global order settings

| Setting | Type | Default | Description |
|---|---|---|---|
| **Order number format** | Text | `ORD-{YYYY}-{SEQ}` | Admin sets their preferred prefix. App shows a recommended format with tokens: `{SEQ}` (sequential number), `{YYYY}` (year), `{MM}` (month). Example: `WY-{YYYY}-{SEQ}` → WY-2025-0001. |
| **Inventory lock stage** | Select | Sales Order | At which stage inventory is reserved. Options: **Buyer Enquiry** / **Sales Order** / **Invoice**. This controls when stock is decremented in `tenant_inventory`. |
| **Invoice PDF generation** | Toggle | Off | When on, a downloadable PDF invoice is generated and stored in R2 when an invoice is created or confirmed. |

#### Sub-toggles (independent — no dependencies between them)

| Toggle | Feature key | Default | Description |
|---|---|---|---|
| **Buyer Enquiries** | `orders.enquiries` | Off | Enables the Enquiry stage before an order is created. Buyer submits an enquiry; seller converts it to an order. Adds "Enquiries" sub-tab in Orders cockpit. Previously called "Estimates" — renamed to match how Indian distributors speak. |
| **Sales Orders** | `orders.sales_orders` | Off | Enables a confirmed Sales Order stage. Adds "Sales Orders" to the order workflow. |
| **Invoices** | `orders.invoices` | Off | Enables invoice creation and tracking linked to orders. Adds "Invoices" sub-tab. Independent of Enquiries and Sales Orders — can be enabled alone. |

**Disabling a toggle with active records:** Show warning — "You have X open [enquiries / sales orders / invoices]. Disabling will hide them from the cockpit but not delete them. Proceed?"

---

### 6.2 Buyer App

**Tier:** All tiers  
**Default:** Off (must be explicitly enabled)

When disabled, all buyer PWA URLs return a "Not available" page and share tokens are inactive.

#### Master toggle: Enable Buyer App

Sub-settings shown only when master toggle is on.

| Setting | Type | Default | Description |
|---|---|---|---|
| **WhatsApp Business Number** | Text | — | The AiSensy/Interakt number for OTP delivery. Required before any buyer can log in. |
| **Share link expiry** | Toggle | Off | If on, published catalog share links expire after N days. |
| **Share link expiry (days)** | Number | 90 | Shown only when expiry toggle is on. |
| **Credit limit visibility** | Toggle | On | **Tenant-wide setting.** If off, credit limit information is hidden everywhere in the app — buyer PWA Profile screen, order screens, cockpit buyer detail. Use for tenants who do not offer credit (e.g., WineYard). If on, credit details are always shown to buyers. |
| **Show out-of-stock products** | Toggle | On | **Tenant-wide setting.** Controls whether inventory-zero products appear in buyer catalogs. On = shown with "Out of stock" label. Off = hidden from buyers entirely. |

**Fixed (not configurable in v1):**
- OTP expiry: 10 minutes (system default, no setting needed)
- Persistent session duration: 15 days (system default, no setting needed)
- Buyer app branding: uses Business Profile logo and system accent color (no per-tenant override in v1)

**WhatsApp credits:** OTP delivery and WhatsApp notifications consume credits purchased at tenant level. Credit balance and top-up is handled in Billing & Plan, not here.

---

### 6.3 Catalog & Pricing

**Tier:** All tiers (subject to plan limits on cohort / price list / catalog counts)  
**Default:** Cohort pricing and catalog publishing are off.

#### Cohort Pricing

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Cohort Pricing** | Toggle | Off | Activates Cohorts and Price Lists nav items. Without this, all buyers see base selling price only. |
| **Price visibility to buyers** | Select | Discounted only | Options: Discounted price only / Show original + discounted / Hidden (show on request) |

#### Catalog Publishing

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Catalog Publishing** | Toggle | Off | Activates the Catalogs nav item and share-token generation. |
| **Default catalog expiry (days)** | Number | 0 (no expiry) | How long a published catalog stays active. 0 = never expires. |

**Not in v1:** Quantity-based pricing (breakpoint pricing per SKU).

---

### 6.4 Search

**Tier:** All tiers  
**Default:** Off

| Setting | Type | Default | Description |
|---|---|---|---|
| **Enable Search** | Toggle | Off | Activates full-text + pgvector search in the cockpit and buyer PWA. |
| **Search scope** | Multi-select | Products + Brands | Entities to index: Products / Brands / Buyers / Orders. |

---

## 7. WhatsApp & Notifications

**All tiers.** WhatsApp is the only notification channel (no email notifications in v1 product).

WhatsApp delivery requires credits purchased at tenant level. This section configures which events trigger a message — it does not manage the credit balance (that's in Billing & Plan).

### WhatsApp notification triggers

| Trigger | Default | Recipient | Description |
|---|---|---|---|
| **Buyer Enquiry received** | On | seller_admin | When a buyer submits an enquiry via PWA |
| **Order placed** | On | seller_admin | When a buyer places an order |
| **Order confirmation to buyer** | On | Buyer | When seller confirms the order |
| **Dispatch notification** | On | Buyer | When order status = Dispatched |
| **Catalog shared** | On | Buyer | When a catalog share link is created for a buyer |
| **OTP delivery** | System | Buyer | Always on — powers buyer app login. Non-configurable. |

**Requires:** Buyer App enabled + WhatsApp Business Number configured (see 6.2).

**Low inventory:** Controlled per-product (not here). Source of record is Tally/Busy/Zoho for tenants using those integrations. No global low-inventory notification trigger in v1.

---

## 8. Integrations

*(Full integration-specific settings to be specced separately per integration. Outline below.)*

### 8.1 Tally Export

Available on all tiers. No toggle — access is via the Exports nav item. Settings here control format preferences only.

| Setting | Type | Default |
|---|---|---|
| Export format version | Select | Tally Prime |
| Company name in Tally | Text | Inherits Business Profile name |
| Default ledger group | Text | "Sundry Debtors" |
| Include cost price in Item Master | Toggle | Off |

### 8.2 Zoho Books / Inventory

Available on all tiers (conversion wedge for WineYard). Full settings spec to be written separately. Outline:

- OAuth connect / disconnect
- Sync direction (DealFlow → Zoho in v1)
- Auto-sync orders toggle
- Auto-sync products toggle
- Sync frequency (real-time / hourly / daily)
- Last sync timestamp + "Sync now" + sync log

---

## 9. Billing & Plan

**Always visible.**

### Current plan card
- Plan name badge (Starter / Growth / Scale)
- Plan limits usage: Cohorts (X / 5), Price Lists (X / 2), Catalogs (X / 3) — shown for Starter and Growth, "Unlimited" for Scale
- WhatsApp credits: balance + "Top up" CTA

### Feature comparison table
Compact table of all features/limits per tier, current tier highlighted. Doubles as the upgrade pitch.

### Upgrade CTA
- Starter → "Upgrade to Growth — higher limits on Cohorts, Price Lists, and Catalogs"
- Growth → "Upgrade to Scale — unlimited everything + AI features"
- Scale → "You're on our highest tier."

**MVP:** CTA opens a modal with contact form (name + message + pre-filled plan interest). No self-serve checkout. Starter self-serve signup infra is a separate sprint.

---

## 10. UX Patterns for Feature Cards

### Three card states

#### State A: Tier-locked
```
┌─────────────────────────────────────────────────────┐
│  🔒  [Feature name]                     [Scale]     │
│  One-line description of what it unlocks.           │
│                                                     │
│  [Upgrade to Scale →]                               │
└─────────────────────────────────────────────────────┘
```
- Muted background, lock icon, tier badge
- All controls disabled and non-interactive
- Upgrade button → Billing & Plan section

#### State B: Available, disabled (toggle off)
```
┌─────────────────────────────────────────────────────┐
│  [Feature name]                             ○ Off   │
│  One-line description.                              │
└─────────────────────────────────────────────────────┘
```
- Toggle is interactive
- Sub-settings hidden until enabled

#### State C: Available, enabled (toggle on)
```
┌─────────────────────────────────────────────────────┐
│  [Feature name]                             ● On    │
│  ─────────────────────────────────────────────────  │
│  [Key sub-setting 1]      [value]                   │
│  [Key sub-setting 2]      [value]                   │
│  [Configure →]                                      │
└─────────────────────────────────────────────────────┘
```
- Sub-settings expand inline, showing 2–3 key settings
- "Configure →" opens full sub-settings panel (or inline accordion expands fully)

### Tier badge pill variants
| Tier | Style |
|---|---|
| Growth | `bg-amber-100 text-amber-800 border border-amber-200` |
| Scale  | `bg-purple-100 text-purple-800 border border-purple-200` |

### Plan limit warning
When a tenant approaches their tier limit (≥80% used), show an inline warning banner in the relevant section (e.g., Cohorts):
```
⚠️  You've used 4 of 5 cohorts on your Starter plan. Upgrade to Growth for up to 20.
```

---

## 11. Lean Data Model

### Guiding principle
v1 uses the simplest storage that works. One JSONB blob per tenant. No per-feature rows, no tier-rules table.

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
  "search": {
    "enabled": false,
    "scope": ["products", "brands"]
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

### Tier checking (app layer, not DB)

```ts
// src/lib/tier.ts
import { TIER_LIMITS } from '@/constants/tier-limits'

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

One function. No per-feature RPCs.

```sql
CREATE FUNCTION app.update_tenant_settings(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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
    settings   = app.tenant_settings.settings || p_patch,  -- merge, not replace
    updated_at = now(),
    updated_by = auth.uid();

  INSERT INTO app.audit_log (tenant_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_tenant_id, auth.uid(), 'tenant_settings', v_tenant_id::text, 'updated', p_patch);
END;
$$;
```

The app calls `PATCH /api/settings` with just the changed sub-object (e.g., `{ "orders": { "features": { "enquiries": true } } }`). The RPC deep-merges it.

---

## 12. Settings Route Structure

```
app/(seller)/settings/
├── page.tsx                     → Redirect to /settings/profile
├── layout.tsx                   → Settings shell with left sub-nav
├── profile/page.tsx             → Business Profile
├── team/page.tsx                → Team & Users
├── features/
│   ├── page.tsx                 → Feature Modules overview (all cards)
│   ├── orders/page.tsx          → Order Workflow sub-settings
│   ├── buyer-app/page.tsx       → Buyer App sub-settings
│   ├── catalog/page.tsx         → Catalog & Pricing sub-settings
│   └── search/page.tsx          → Search sub-settings
├── notifications/page.tsx       → WhatsApp & Notifications
├── integrations/
│   ├── page.tsx                 → Integrations list
│   ├── tally/page.tsx           → Tally settings
│   └── zoho/page.tsx            → Zoho OAuth + sync settings
└── billing/page.tsx             → Billing & Plan
```

Each route requires a `loading.tsx` skeleton per project navigation standard.

---

## 13. Out of Scope (v1)

- Self-serve plan upgrades (MVP = contact form modal)
- Starter self-serve signup infra (separate sprint)
- Custom subdomain / white-label domain
- Per-user notification preferences
- Buyer app branding (logo override, accent color)
- Webhook configuration
- API key management
- Audit log viewer in Settings UI
- Returns / refunds configuration
- Multi-warehouse / multi-location settings (Locations is in scope from Starter — configured on product/order, not in Settings)
- Payment gateway configuration (Phase 2)
- Quantity-based pricing (Phase 2)
- Minimum order value (Phase 2)
- AI features (Phase 2)

---

## 14. Open Questions Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Usage limits per tier | Starter: 5 cohorts / 2 price lists / 3 catalogs. Growth: 20 / 10 / 15. Scale: unlimited. Stored as app constants, not DB. |
| 2 | Starter self-serve signup | Planned — separate sprint. v1 ops-assisted. |
| 3 | seller_assistant access to settings | No access. Settings is seller_admin only. |
| 4 | Invoice PDF generation | Configurable toggle in Order Workflows (default off). PDFs stored in R2. |
| 5 | Low inventory alert | Per-product level, driven by Tally/Busy/Zoho. No global setting in v1. |

---

## 15. Remaining Open Questions

| # | Question | Owner |
|---|---|---|
| 1 | Integrations section — full settings spec for Tally and Zoho | Review separately |
| 2 | WhatsApp credits — purchase flow and balance display in Billing | Spec separately |
| 3 | Order number format — supported token list (`{SEQ}`, `{YYYY}`, `{MM}`, `{DD}`?) and zero-padding rules | Phani to confirm |
| 4 | Locations — how are delivery zones modeled? Per-buyer or per-catalog or both? | Spec separately |
