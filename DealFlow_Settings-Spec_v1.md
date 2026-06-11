# DealFlow — Settings Section Spec

**Version:** 1.0  
**Status:** Draft  
**Owner:** Phani  
**Access:** `seller_admin` only. Every change is written to `app.audit_log`.

---

## 1. Purpose

The Settings section is the distributor admin's control panel for two distinct concerns:

1. **Feature configuration** — turn modules on or off for their business and configure them to match their workflow.
2. **Tier awareness** — surface features the tenant does not yet have access to, with clear upgrade nudges to drive plan upgrades.

The page is split into sections accessible via a left sub-nav within the Settings route. It is never visible to `seller_assistant`, `buyer_admin`, or `buyer_assistant` roles.

---

## 2. Pricing Tiers

Three tiers: **Starter**, **Growth**, **Scale**.

### Tier Feature Matrix

| Feature / Module | Starter | Growth | Scale |
|---|:---:|:---:|:---:|
| Brand & Product Master | ✅ | ✅ | ✅ |
| Customer (Buyer) Master | ✅ | ✅ | ✅ |
| Orders (basic workflow) | ✅ | ✅ | ✅ |
| Estimates toggle | ✅ | ✅ | ✅ |
| Sales Orders toggle | ✅ | ✅ | ✅ |
| Invoices toggle | ✅ | ✅ | ✅ |
| Tally CSV Export | ✅ | ✅ | ✅ |
| Email notifications | ✅ | ✅ | ✅ |
| Cohorts | — | ✅ | ✅ |
| Pricing Engine (price lists per cohort) | — | ✅ | ✅ |
| Catalog Publishing + share token | — | ✅ | ✅ |
| Buyer App (WhatsApp OTP PWA) | — | ✅ | ✅ |
| WhatsApp notifications | — | ✅ | ✅ |
| Search (full-text + pgvector) | — | ✅ | ✅ |
| Zoho Books / Inventory integration | — | — | ✅ |
| AI-powered features (Phase 2) | — | — | ✅ |
| Replenishment forecasting (Phase 2) | — | — | ✅ |
| Payments (Phase 2) | — | — | ✅ |

### Tier state stored on tenant

`app.tenants.plan_tier` — enum: `starter | growth | scale`  
Set by DealFlow ops (not self-serve in MVP). Upgrade flow in MVP = contact sales / manual.

---

## 3. Settings Navigation

Left sub-nav within `/settings`. Sections:

1. Business Profile
2. Team & Users
3. Feature Modules ← primary focus of this spec
4. Notifications
5. Integrations
6. Billing & Plan

All sections are visible to the admin regardless of tier. Locked sections show a clear locked state rather than being hidden — visibility of what you're missing is intentional.

---

## 4. Business Profile

Basic company identity. Always available on all tiers.

| Field | Type | Notes |
|---|---|---|
| Company name | Text | Displayed in buyer app header and catalog PDFs |
| Logo | Image upload (R2) | Max 2MB, PNG/JPG/SVG, used in buyer PWA and exports |
| GSTIN | Text | Validated format (15-char alphanumeric) |
| Address (line 1, line 2, city, state, pincode) | Text | Used on invoices and exports |
| Business phone | Tel | WhatsApp sender number for OTP flows |
| Business email | Email | Reply-to for transactional emails via Resend |
| Subdomain slug | Text (read-only after first save) | `{slug}.dealflow.in` — contact support to change |

**Actions:** Save (with optimistic update + rollback on error).

---

## 5. Team & Users

Manage who has access to the cockpit. Always available on all tiers.

### User list view
- Table: Name, Email, Role, Status (Active / Invited / Deactivated), Last login, Actions
- Actions per row: Edit role, Deactivate, Resend invite

### Invite user
- Fields: Email, Role (seller_admin | seller_assistant)
- Sends invite email via Resend
- Invited user record created in `app.tenant_users` with `status = invited`

### Roles
- `seller_admin` — full cockpit access including Settings
- `seller_assistant` — all cockpit access except Settings and cost prices

### Constraints
- Cannot deactivate the last active `seller_admin`
- Admin cannot downgrade their own role
- Deactivated users cannot log in; records are soft-deleted (`deleted_at`)

---

## 6. Feature Modules

The core of the Settings section. Each module follows a consistent card pattern (see Section 9 for UX spec).

### 6.1 Order Workflows

**Tier:** Starter+  
**Always visible and available.** Orders are the core of the product — this section cannot be disabled.

#### Sub-toggles (independent, default: off)

| Toggle | Key | Description |
|---|---|---|
| **Estimates** | `feature.estimates` | Enables creating an Estimate before it becomes an order. Adds "Estimates" sub-tab in Orders cockpit. |
| **Sales Orders** | `feature.sales_orders` | Enables a confirmed Sales Order stage between estimate/receipt and invoice. |
| **Invoices** | `feature.invoices` | Enables generating and tracking Invoices linked to orders. Adds "Invoices" sub-tab. |

**Dependency rules (enforced in UI + DB):**
- Enabling Sales Orders does NOT require Estimates to be on.
- Enabling Invoices does NOT require Sales Orders to be on.
- If a toggle is turned off while active records exist, show a warning: "You have X open [estimates/sales orders/invoices]. Disabling this will hide them from the cockpit but not delete them. Proceed?"

#### Additional order settings
- **Order number prefix** — e.g., `ORD-`, `WY-`. Applied to all new order IDs. Default: `ORD-`
- **Minimum order value (₹)** — Optional. If set, orders below this value are blocked at submission. 0 = no minimum.
- **Default order expiry (days)** — Number of days before a draft order auto-cancels. 0 = never.

---

### 6.2 Buyer App

**Tier:** Growth+  
**Default:** Off (must be explicitly enabled by admin)

When enabled, exposes `shop.dealflow.in/{share_token}` for buyers.

#### Enable toggle
Master toggle: **Enable Buyer App**. When off, all buyer app URLs return a "Coming soon" page and share tokens are inactive.

#### Sub-settings (visible only when master toggle is on)

| Setting | Type | Description |
|---|---|---|
| **WhatsApp OTP** | Toggle (required) | Must be configured before buyers can log in. Links to WhatsApp config sub-section. |
| **WhatsApp Business Number** | Text | The registered AiSensy/Interakt number used for OTP delivery. |
| **OTP expiry (minutes)** | Number | Default: 5. Range: 1–10. |
| **Persistent sessions** | Toggle | If off, buyers must re-verify OTP every session. Default: on. |
| **Session timeout (days)** | Number | How long a persistent session stays valid. Default: 30. |
| **Buyer app branding** | | |
| — Logo override | Image upload | If blank, uses Business Profile logo. |
| — Accent color | Color picker | Hex value. Used for CTAs in buyer PWA. Default: brand primary. |
| **Share link expiry** | Toggle | If on, published catalog share links expire after N days. Default: off (links never expire). |
| **Default share link expiry (days)** | Number | Only shown when expiry toggle is on. Default: 90. |
| **Credit limit visibility** | Toggle | Show/hide the buyer's credit limit on their Profile screen. Default: on. |

---

### 6.3 Catalog & Pricing

**Tier:** Growth+  
**Default:** Both cohort pricing and catalog publishing are off.

#### Cohort Pricing
| Setting | Type | Description |
|---|---|---|
| **Enable Cohort Pricing** | Toggle | Activates the Cohorts and Price Lists nav items in the cockpit. Without this, all buyers see base selling price only. |
| **Price visibility to buyers** | Select | Options: Show discounted price only / Show both original + discounted / Hide price (show on request) |
| **Quantity-based pricing** | Toggle | Allow price list items to define per-qty breakpoints (e.g., 1–10 units = ₹X, 11+ = ₹Y). Default: off. |

#### Catalog Publishing
| Setting | Type | Description |
|---|---|---|
| **Enable Catalog Publishing** | Toggle | Activates the Catalogs nav item and share-token generation. |
| **Default catalog expiry (days)** | Number | How long a published catalog stays active. 0 = no expiry. Default: 0. |
| **Require OTP to view catalog** | Toggle | If on, buyer must verify WhatsApp OTP even just to browse (not just to order). Default: off. |
| **Show out-of-stock products** | Toggle | Control whether inventory-zero products appear in buyer catalogs. Default: on (shown as "Out of stock"). |

---

### 6.4 Search

**Tier:** Growth+  
**Default:** Off

| Setting | Type | Description |
|---|---|---|
| **Enable Search** | Toggle | Activates the full-text + pgvector search bar in the cockpit and buyer PWA. |
| **Search scope** | Multi-select | Products / Brands / Buyers / Orders. Controls what entities are indexed. Default: Products + Brands. |

Phase 2 (Scale): AI-powered semantic search — shown as a locked card within this section for Growth tenants.

---

## 7. Notifications

**Tier:** Starter+ for email. Growth+ for WhatsApp.

### Email notifications (Starter+)

| Trigger | Default | Description |
|---|---|---|
| New order received | On | Sent to seller_admin when a buyer places an order |
| Order status changed | On | Sent to buyer when their order moves stages |
| Catalog shared | On | Sent to buyer when a catalog share link is created for them |
| New user invited | On | Sent to invited seller team member |
| Low inventory alert | Off | Sent to seller_admin when a product's stock drops below threshold |

Low inventory threshold: configurable numeric field (per-product overrides handled on the product record, not here).

### WhatsApp notifications (Growth+)

| Trigger | Default | Description |
|---|---|---|
| Order confirmation | On | WhatsApp message to buyer on order placement |
| Dispatch notification | On | WhatsApp message to buyer when order status = dispatched |
| Catalog share | On | WhatsApp message to buyer with catalog link |
| OTP delivery | System (non-configurable) | Always on; powers buyer app login |

**Requires:** Buyer App enabled + WhatsApp Business Number configured.

---

## 8. Integrations

### 8.1 Tally Export (Starter+)

Always available, no toggle needed — access is via the Exports nav item. Settings here control format preferences.

| Setting | Type | Description |
|---|---|---|
| **Export format version** | Select | Tally Prime / Tally ERP 9 |
| **Company name in Tally** | Text | Defaults to Business Profile company name. Override if Tally company name differs. |
| **Default ledger group** | Text | Used in Ledger Master CSV. Default: "Sundry Debtors" |
| **Include cost price in Item Master** | Toggle | Default: off. Only seller_admin can see cost prices; this controls whether they appear in the export. |

### 8.2 Zoho Books / Inventory (Scale only)

**Tier:** Scale  
**Default:** Disconnected

| State | UI |
|---|---|
| Not connected | "Connect Zoho" primary button → OAuth flow |
| Connected | Green "Connected" badge, account name, "Disconnect" secondary action |

**Sub-settings (visible only when connected):**

| Setting | Type | Description |
|---|---|---|
| **Sync direction** | Select | DealFlow → Zoho only (MVP). Bi-directional in Phase 2. |
| **Auto-sync orders** | Toggle | Push confirmed orders to Zoho as Sales Orders. Default: on. |
| **Auto-sync products** | Toggle | Pull product updates from Zoho into DealFlow catalog. Default: off (manual pull). |
| **Sync frequency** | Select | Real-time / Every hour / Daily. Default: Every hour. |
| **Last sync** | Display | Timestamp of last successful sync. "Sync now" button. |
| **Sync log** | Link | Opens a drawer showing last 50 sync events with status + error details. |

For Growth tenants: show the Zoho integration card in a locked state — grayed out, Scale badge, upgrade CTA.

---

## 9. Billing & Plan

**Always visible on all tiers.**

### Current plan card
- Plan name (Starter / Growth / Scale) with color badge
- Renewal date (or "Manual — contact sales" for MVP)
- Usage stats:
  - Active products: X / [limit or "Unlimited"]
  - Active buyers: X / [limit or "Unlimited"]
  - Orders this month: X

### Feature comparison table
A compact comparison of what each tier includes, with the current tier highlighted. Each row is a feature with ✅ / — per tier. This doubles as the upgrade pitch.

### Upgrade CTA
- For Starter: "Upgrade to Growth — unlock Buyer App, Cohorts, and Catalog Publishing"
- For Growth: "Upgrade to Scale — unlock Zoho integration and advanced analytics"
- For Scale: "You're on our highest tier. Thank you!" 

**MVP:** CTA opens a modal with a "Contact us" form (name + message + pre-filled plan interest) that sends an email to DealFlow ops via Resend. No self-serve checkout in MVP.

---

## 10. UX Patterns for Tier-Gated Features

### Three card states

#### State A: Tier-locked (tenant is below required tier)
```
┌─────────────────────────────────────────────────────┐
│  🔒  Buyer App                          [Growth]    │
│  Let your buyers browse catalogs and place          │
│  orders directly from their phone via WhatsApp.     │
│                                                     │
│  [Upgrade to Growth →]                              │
└─────────────────────────────────────────────────────┘
```
- Card background: slightly muted (e.g., `bg-cream-50 opacity-75`)
- Lock icon (16px, muted color) left of module name
- Tier badge: small pill — `bg-amber-100 text-amber-700` for Growth, `bg-purple-100 text-purple-700` for Scale
- "Upgrade to [tier] →" button: secondary style, links to Billing & Plan section
- All toggles and inputs are `disabled` and non-interactive
- No hover/focus states on disabled controls

#### State B: Tier-available, feature disabled
```
┌─────────────────────────────────────────────────────┐
│  Buyer App                                  ○ Off   │
│  Let your buyers browse catalogs and place          │
│  orders directly from their phone via WhatsApp.     │
└─────────────────────────────────────────────────────┘
```
- Toggle is off but interactive
- No sub-settings shown while disabled (collapsed)
- Click toggle → confirmation dialog if there are downstream implications

#### State C: Tier-available, feature enabled
```
┌─────────────────────────────────────────────────────┐
│  Buyer App                                  ● On    │
│  ─────────────────────────────────────────────────  │
│  WhatsApp OTP          ● On                         │
│  Session timeout       30 days                      │
│  Share link expiry     Off                          │
│  [View all Buyer App settings →]                    │
└─────────────────────────────────────────────────────┘
```
- Toggle is on
- Sub-settings expand inline (accordion) showing 2–3 key settings as a preview
- "View all [module] settings →" link opens full sub-settings panel
- Save is per-section (not a global save button for the whole page)

### Tier badge pill variants
| Tier | Style |
|---|---|
| Growth | `bg-amber-100 text-amber-800 border border-amber-200` — label: "Growth" |
| Scale | `bg-purple-100 text-purple-800 border border-purple-200` — label: "Scale" |

Badges appear inline next to the module name in both the sub-nav and the card header.

### Confirmation dialogs
Required before:
- Disabling a module that has active records (estimates/sales orders/invoices/buyer app with active buyers)
- Disconnecting Zoho (if auto-sync is on)
- Changing order number prefix (affects future records only — inform but don't block)

---

## 11. Data Model

### `app.tenant_feature_settings`

Stores per-tenant feature enable/disable state and per-feature config. Separate from PostHog flags — PostHog controls what's *available* by tier; this table controls what the admin has *enabled*.

```sql
CREATE TABLE app.tenant_feature_settings (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  feature_key    text NOT NULL,           -- e.g. 'estimates', 'buyer_app', 'cohort_pricing'
  enabled        boolean NOT NULL DEFAULT false,
  config         jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  deleted_at     timestamptz,
  UNIQUE (tenant_id, feature_key)
);
```

### `app.tenant_settings`

Flat key-value store for non-feature settings (business profile, notification prefs, etc.).

```sql
CREATE TABLE app.tenant_settings (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  settings       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES auth.users(id),
  UNIQUE (tenant_id)
);
```

`settings` JSONB shape (illustrative, enforced via Zod schema on write):
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
    "number_prefix": "WY-",
    "min_order_value": 0,
    "default_expiry_days": 0
  },
  "notifications": {
    "email": { "new_order": true, "status_change": true, "catalog_shared": true, "low_inventory": false },
    "whatsapp": { "order_confirmation": true, "dispatch": true, "catalog_share": true }
  },
  "tally": {
    "format_version": "prime",
    "company_name_override": "",
    "default_ledger_group": "Sundry Debtors",
    "include_cost_price": false
  }
}
```

### Feature keys reference

| Feature key | Module | Tier |
|---|---|---|
| `estimates` | Order Workflows | Starter+ |
| `sales_orders` | Order Workflows | Starter+ |
| `invoices` | Order Workflows | Starter+ |
| `buyer_app` | Buyer App | Growth+ |
| `cohort_pricing` | Catalog & Pricing | Growth+ |
| `catalog_publishing` | Catalog & Pricing | Growth+ |
| `search` | Search | Growth+ |
| `zoho_integration` | Integrations | Scale |
| `ai_intake` | AI (Phase 2) | Scale |
| `replenishment` | AI (Phase 2) | Scale |
| `payments` | Billing (Phase 2) | Scale |

### Resolution logic (pseudo-code)

```
function canUseFeature(tenantId, featureKey):
  tier = getTenantTier(tenantId)                    // from app.tenants.plan_tier
  tierOk = FEATURE_TIER_MAP[featureKey] <= tier     // tier hierarchy check
  if not tierOk: return { available: false, reason: 'upgrade_required' }
  
  setting = getTenantFeatureSetting(tenantId, featureKey)
  if setting.enabled: return { available: true, enabled: true }
  return { available: true, enabled: false, reason: 'disabled_by_admin' }
```

Both the UI component and every SECURITY DEFINER RPC must call this check independently. Never trust only the UI toggle.

---

## 12. RPC: `app.update_tenant_feature_setting`

```sql
CREATE FUNCTION app.update_tenant_feature_setting(
  p_feature_key  text,
  p_enabled      boolean,
  p_config       jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid := auth.jwt() ->> 'tenant_id';
  v_user_id   uuid := auth.uid();
  v_role      text := auth.jwt() ->> 'role';
BEGIN
  IF v_role != 'seller_admin' THEN
    RAISE EXCEPTION 'Only seller_admin can modify feature settings';
  END IF;
  
  -- Tier check: verify tenant plan allows this feature
  PERFORM app.assert_feature_tier(v_tenant_id, p_feature_key);
  
  INSERT INTO app.tenant_feature_settings
    (tenant_id, feature_key, enabled, config, updated_by)
  VALUES
    (v_tenant_id, p_feature_key, p_enabled, p_config, v_user_id)
  ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
    enabled    = EXCLUDED.enabled,
    config     = EXCLUDED.config,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

  -- Audit log
  INSERT INTO app.audit_log (tenant_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_tenant_id, v_user_id, 'tenant_feature_setting', p_feature_key,
          CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,
          jsonb_build_object('config', p_config));
END;
$$;
```

---

## 13. Settings Route Structure

```
app/(seller)/settings/
├── page.tsx                     → Redirect to /settings/profile
├── layout.tsx                   → Settings shell with left sub-nav
├── profile/page.tsx             → Business Profile
├── team/page.tsx                → Team & Users
├── features/
│   ├── page.tsx                 → Feature Modules overview
│   ├── orders/page.tsx          → Order Workflow sub-settings
│   ├── buyer-app/page.tsx       → Buyer App sub-settings
│   ├── catalog/page.tsx         → Catalog & Pricing sub-settings
│   └── search/page.tsx          → Search sub-settings
├── notifications/page.tsx       → Notifications
├── integrations/
│   ├── page.tsx                 → Integrations overview
│   ├── tally/page.tsx           → Tally export settings
│   └── zoho/page.tsx            → Zoho OAuth + sync settings
└── billing/page.tsx             → Billing & Plan
```

Each route requires a `loading.tsx` skeleton per the project's navigation standard.

---

## 14. Out of Scope (MVP)

- Self-serve plan upgrades (MVP = contact sales modal)
- Per-user notification preferences (admin configures globally)
- Webhook configuration
- API key management
- White-label domain (custom domain for buyer PWA beyond `shop.dealflow.in`)
- Audit log viewer in UI (logged to DB; no UI in MVP)
- Returns / refunds configuration
- Multi-warehouse / multi-location settings
- Payment gateway configuration (Phase 2)

---

## 15. Open Questions

| # | Question | Owner | Resolution |
|---|---|---|---|
| 1 | What are the usage limits per tier (max products, max buyers)? | Phani | TBD |
| 2 | Is the Starter tier self-serve signup or always sales-assisted? | Phani | TBD |
| 3 | Should `seller_assistant` have read-only view of settings (no edit)? | Phani | TBD |
| 4 | Invoices — generate PDF from within DealFlow or just track status? | Phani | TBD |
| 5 | Low inventory alert threshold — set globally in Settings or per-product only? | Phani | TBD |
