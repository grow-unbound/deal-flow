# DealFlow Settings — Claude Code Implementation Prompt

> Paste this entire prompt into Claude Code. It is self-contained.

---

## Context

This is the DealFlow distributor cockpit (Next.js App Router, Supabase, shadcn/ui, Tailwind, PostHog). You are implementing a set of improvements to the Settings module. Read `DealFlow_Settings-Spec_v3.md` and `.claude/CLAUDE.md` as authoritative references before touching any file.

The spec file at `DealFlow_Settings-Spec_v3.md` is now v4.0 — it describes the complete target state.

---

## Scope of this task

Work through the following phases in order. Commit after each phase.

---

## Phase 1 — Data model & types

### 1a. Update `src/types/tenant-settings.ts`

Add `BusinessPolicySchema` and update `OrdersSettingsSchema`:

```ts
export const BusinessPolicySchema = z.object({
  credit_enabled: z.boolean().default(true),
  gst_inclusive: z.boolean().default(false),
})
export type BusinessPolicy = z.infer<typeof BusinessPolicySchema>
```

Replace `number_format: z.string()` in `OrdersSettingsSchema` with three per-type fields:

```ts
enquiry_number_format: z.string().min(1).max(120).default('EST-{YYYY}-{SEQ}'),
sales_order_number_format: z.string().min(1).max(120).default('SO-{YYYY}-{SEQ}'),
invoice_number_format: z.string().min(1).max(120).default('INV-{YYYY}-{SEQ}'),
```

Keep `number_format` in `TenantSettingsStoredSchema` as `.optional()` for backward compat (ignored on read after migration).

Add `business_policy` to `TenantSettingsPatchSchema` and `TenantSettingsStoredSchema`.

Add `business_policy: BusinessPolicy` to `ModuleSettingsView` (it's needed in the form to conditionally show credit limit toggle) and to `GeneralSettingsView`.

Update `TenantSettingsApiPayload` and the settings API GET handler accordingly.

### 1b. Update defaults

In `src/lib/tenant-settings/defaults.ts` (or wherever defaults live), add:
```ts
business_policy: { credit_enabled: true, gst_inclusive: false }
```
and update the orders defaults to use the three per-type number format fields.

### 1c. Backward compat in GET handler

In `app/api/settings/route.ts` GET handler: when building `ModuleSettingsView.orders`, if `enquiry_number_format` is absent in stored JSONB, derive it from the old `number_format` field if present, otherwise use the default `'EST-{YYYY}-{SEQ}'`. Apply same logic to the SO and Invoice formats.

### 1d. PostHog server utility

Create `src/lib/posthog-server.ts`:

```ts
import { PostHog } from 'posthog-node'

const phServer = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
  flushAt: 1,
  flushInterval: 0,
})

export interface TenantFeatureFlags {
  df_order_enquiries?: boolean
  df_order_sales_orders?: boolean
  df_order_invoices?: boolean
  df_cohorts?: boolean
  df_catalog_publishing?: boolean
}

export async function syncTenantFeatureFlags(tenantId: string, flags: TenantFeatureFlags) {
  try {
    phServer.groupIdentify({ groupType: 'tenant', groupKey: tenantId, properties: flags })
    await phServer.flushAsync()
  } catch {
    // Non-fatal — PostHog sync failure must never break settings save
    console.error('[posthog-server] syncTenantFeatureFlags failed silently', flags)
  }
}
```

Add `posthog-node` to dependencies if not present (`npm install posthog-node`).

### 1e. Call PostHog sync from PATCH handler

In `app/api/settings/route.ts` PATCH handler, after the successful Supabase RPC call, if the patch contains `orders.features` or `catalog`, call `syncTenantFeatureFlags`. Extract `tenant_id` from the session JWT claims. Wrap in try/catch — a PostHog failure must never cause a 500.

---

## Phase 2 — General Settings: Business Policy section

### 2a. Add `BusinessPolicySection` component

Create `src/components/seller/settings/BusinessPolicySection.tsx`.

Props:
```ts
interface BusinessPolicySectionProps {
  value: BusinessPolicy
  onChange: (v: BusinessPolicy) => void
}
```

UI: a `SettingsSectionCard` with a Building2-style icon, title "Business Policy", description "Controls how credit and pricing work across your entire account."

Two `FeatureToggleRow` items:
1. **Enable credit for buyers** — label, description: "When off, credit limits, terms, and outstanding balances are hidden everywhere in the app." `checked={value.credit_enabled}`
2. **GST included in prices** — label, description: "When on, your prices are treated as GST-inclusive. GST is not broken out separately in documents." `checked={value.gst_inclusive}`. Below the toggle (when gst_inclusive is on), show a helper note: "Product GST rates are preserved and will reapply if you switch this off."

### 2b. Wire into `GeneralSettingsForm.tsx`

- Add `business_policy` to the draft state (from `data.general.business_policy`).
- Add `BusinessPolicySection` between Business Profile and Product Defaults.
- Include `business_policy` in the dirty check and in the PATCH payload.

### 2c. Conditionally hide default GST rate in `ProductDefaultsSection.tsx`

Accept an additional prop `gstInclusive: boolean`. When `gstInclusive` is true, do not render the Default GST rate select. Keep the UOM field.

---

## Phase 3 — Module Settings: Order Workflows restructure

### 3a. Token chip number format component

Create `src/components/seller/settings/NumberFormatBuilder.tsx`.

Props:
```ts
interface NumberFormatBuilderProps {
  value: string           // e.g. "EST-{YYYY}-{SEQ}"
  onChange: (v: string) => void
  preview: string         // computed by caller via previewOrderNumberFormat()
  label: string
}
```

UI design:
- Show available token chips as clickable badges: `{YYYY}` `{MM}` `{DD}` `{SEQ}`. Each chip is a small button. Clicking adds the token at the end of the current format.
- Show a separator input (max 5 chars, placeholder `-`) that inserts a separator between tokens when clicked.
- Show the current format as a visual sequence of removable chips (each chip has an × to remove it).
- Live preview: `Preview EST-2026-0001` shown below in muted text.
- The component builds and emits a format string from the chip sequence + separators.

Simple approach (no drag-drop for v1): chips are ordered left-to-right in the sequence they were added. An "×" on each chip removes it. A "Clear" link resets to default.

Internally maintain state as `Array<{ type: 'token', value: string } | { type: 'separator', value: string }>`. Serialize to a string on change.

### 3b. Restructure `ModuleSettingsForm.tsx` — Order Workflows section

Replace the current Order Workflows `FeatureModuleCard` body with the following structure:

**Always-visible global settings (no toggle):**
- Inventory lock stage select (existing, keep as-is)

**Per-type toggle + sub-settings pattern (three times, for Estimates / Sales Orders / Invoices):**

For each type (use a helper sub-component or inline — your choice):
```
<FeatureToggleRow label="Enable Estimates" ... />
{draft.orders.features.enquiries && (
  <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-4">
    <NumberFormatBuilder
      label="Estimate number format"
      value={draft.orders.enquiry_number_format}
      onChange={...}
      preview={previewOrderNumberFormat(draft.orders.enquiry_number_format)}
    />
  </div>
)}
```

For Invoices, additionally show `FeatureToggleRow` for Invoice PDF inside the expanded section.

Move the Inventory lock stage **above** the three toggle rows (always visible as a global setting for the Orders card).

Remove the old single `order-number-format` input and the old `Invoice PDF` toggle from their previous positions.

**Inventory lock stage auto-reset on save:**
In `handleSave`, before building the patch: if `inventory_lock_stage === 'enquiry'` and `features.enquiries === false`, reset `inventory_lock_stage` to `'sales_order'` (if enabled) or `'invoice'` (if enabled), with a toast warning: "Inventory lock stage reset to Sales Order because Estimates was disabled."

### 3c. Update `open_counts` type

The existing `open_counts` in `ModuleSettingsView` uses `enquiries` as the key. Update the label in the confirmation dialog to say "Estimates" (matching the renamed UI) but keep the DB key `enquiries`.

---

## Phase 4 — Catalog & Pricing: gate nav and buyer app

### 4a. Cockpit sidebar nav gating

In the seller sidebar (`src/components/layout/SellerSidebar.tsx` or equivalent), read `useTenantSettings()` to get the settings. Gate the following nav items:

| Nav item | Condition to show |
|---|---|
| Estimates (sidebar) | `settings.modules.orders.features.enquiries === true` |
| Sales Orders (sidebar) | `settings.modules.orders.features.sales_orders === true` |
| Invoices (sidebar) | `settings.modules.orders.features.invoices === true` |
| Cohorts (sidebar) | `settings.modules.catalog.cohort_pricing_enabled === true` |
| Catalogs (sidebar) | `settings.modules.catalog.catalog_publishing_enabled === true` |

If `useTenantSettings` is loading, show all nav items (fail open). If there's an error, show all nav items.

> Note: The sidebar should not block render on settings load. Show nav items immediately, then hide them reactively once settings load. Use a brief CSS transition (`opacity`) to avoid flicker.

### 4b. Buyer app Orders tab gating

In the buyer app Orders screen (`app/(buyer)/shop/.../orders/page.tsx` and its tab bar), gate sub-tabs:
- "Estimates" tab: show only if `orders.features.enquiries === true` in tenant settings
- "Sales Orders" tab: show only if `orders.features.sales_orders === true`
- "Invoices" tab: show only if `orders.features.invoices === true`

The buyer app reads tenant settings via a public settings endpoint or via the share token context — confirm how tenant settings are currently surfaced in the buyer app, and use the same pattern.

---

## Phase 5 — Credit & GST visibility app-wide

Create a hook `src/hooks/useBusinessPolicy.ts`:

```ts
export function useBusinessPolicy() {
  const { data } = useTenantSettings()
  return {
    creditEnabled: data?.modules.business_policy.credit_enabled ?? true,
    gstInclusive: data?.modules.business_policy.gst_inclusive ?? false,
  }
}
```

Default to `true` / `false` while loading to avoid hiding UI on initial paint.

### 5a. Credit-gated UI elements

In each location below, call `const { creditEnabled } = useBusinessPolicy()` and conditionally render:

| File | Element to gate |
|---|---|
| Estimate / Sales Order / Invoice composer UI | Credit headroom indicator row |
| Estimate / Sales Order / Invoice PDF template | Credit terms line |
| Customers landing page table | Credit status column header + cells |
| Customer detail page | Credit section (credit limit, credit terms, outstanding) |
| Add/Edit Customer form (`CustomerFormSheet` or similar) | Credit limit, credit terms, net payment days fields |
| Buyer app Home KPI grid | Credit limit / available credit KPI cards |
| Buyer app Profile page | Account credit section |
| Buyer app Order screens | Credit headroom bar |

For each, wrap in `{creditEnabled && (...)}`. Do not delete the underlying data — these are display-only gates.

### 5b. GST-gated UI elements

In each location below, call `const { gstInclusive } = useBusinessPolicy()` and conditionally render:

| File | Element to gate |
|---|---|
| Add/Edit Product form | GST rate field (hide when `gstInclusive`) |
| Estimate / Sales Order / Invoice composer | GST line in totals section (hide when `gstInclusive`); add "All prices inclusive of GST" note when `gstInclusive` |
| Estimate / Sales Order / Invoice PDF | Same as composer |

When `gstInclusive` is true: the total shown is the full price. Do not add GST on top. Do not display a GST subtotal row.

---

## Phase 6 — UI polish (typography, tables, layout)

### 6a. Typography fix

Audit all files in `src/components/seller/settings/`. Replace any `text-xs` used for primary form labels or input labels with `text-sm font-medium`. Helper text / captions remain `text-xs text-muted-foreground`. This aligns Settings typography with the rest of the app (Yukti R12: 14px base = Tailwind `text-sm`).

### 6b. Table layout — Locations and Categories

**`src/components/seller/settings/LocationsTable.tsx` and `LocationsSettingsClient.tsx`:**
- Remove any secondary `<h2>` or card title that duplicates the page title.
- Add a header row above the table: search input (left, `placeholder="Search locations…"`), type filter chips (Warehouse / Dispatch Point / Branch), status filter chips (Active / Inactive), sort dropdown (right, "Sort Name A→Z" default). Wire the filters client-side against the local list (no new API calls needed for the small list typical in v1).
- Ensure row action buttons are icon-only (pencil + deactivate/user-x icon), matching Team page style.

**`src/components/seller/settings/CategoriesTable.tsx` and `CategoriesSettingsClient.tsx`:**
- Same as above. Remove duplicate title. Add search input + status filter chips header row.
- Row actions: edit (pencil) + deactivate (user-x icon).

### 6c. Page layout alignment

In `app/(seller)/settings/modules/page.tsx` and `app/(seller)/settings/page.tsx`: ensure `PageWrap` is used without an additional outer `max-w-[740px]` constraint at the page level. The `max-w-[740px]` constraint belongs only inside the form content div within `ModuleSettingsForm`, not on the page shell. Check `PageWrap` implementation — confirm it provides consistent `max-w-[1440px] mx-auto` centering.

If `PageWrap` doesn't already apply `max-w-[1440px] mx-auto`, update it in `src/components/seller/layout/PageWrap.tsx` (or equivalent) to add it, but first confirm all other pages use `PageWrap` so the change is safe.

---

## Phase 7 — Verification

After all phases:

1. Run `npm run typecheck` — must pass with zero errors.
2. Run `npm run lint` — must pass.
3. Run `npm test -- --testPathPattern=settings` — existing settings tests must pass.
4. Manually verify:
   - Turn off Estimates toggle → "Estimates" disappears from sidebar. Turn it back on → reappears.
   - Turn off Cohorts toggle → "Cohorts" disappears from sidebar.
   - Turn off credit → Customer form hides credit fields. Turn it back on → fields reappear.
   - Turn on GST inclusive → Product form hides GST field, General Settings hides Default GST rate select.
   - Set a custom number format via chip UI → preview updates live → save → reload → format persists.
   - Post a settings save and confirm PostHog sync is called (check server logs for `[posthog-server]`).

---

## File list (expected to be created or modified)

**New files:**
- `src/lib/posthog-server.ts`
- `src/hooks/useBusinessPolicy.ts`
- `src/components/seller/settings/BusinessPolicySection.tsx`
- `src/components/seller/settings/NumberFormatBuilder.tsx`

**Modified files:**
- `src/types/tenant-settings.ts`
- `src/lib/tenant-settings/defaults.ts`
- `app/api/settings/route.ts`
- `src/components/seller/settings/GeneralSettingsForm.tsx`
- `src/components/seller/settings/ModuleSettingsForm.tsx`
- `src/components/seller/settings/ProductDefaultsSection.tsx`
- `src/components/seller/settings/LocationsTable.tsx`
- `src/components/seller/settings/LocationsSettingsClient.tsx`
- `src/components/seller/settings/CategoriesTable.tsx`
- `src/components/seller/settings/CategoriesSettingsClient.tsx`
- `src/components/layout/SellerSidebar.tsx` (or equivalent sidebar nav file)
- `app/(buyer)/shop/.../orders/page.tsx` (buyer app orders tabs — find the right file)
- Composer UIs for Estimate / Sales Order / Invoice (find via `src/components/seller/`)
- Customer landing, detail, and form components (find via `src/components/seller/customers/`)
- Add/Edit Product form (find via `src/components/seller/products/`)
- Buyer app Home, Profile, Order screens (find via `app/(buyer)/`)
- `src/components/seller/layout/PageWrap.tsx` (if layout fix needed)

**Before touching any file:** read it first to understand current structure. Do not assume file paths — use `find` or glob to locate the exact files.
