# WineYard Catalog → DealFlow Buyer PWA: Migration Plan

**Verdict: Migration is feasible and high-value. Estimated effort: 4–6 weeks (1–2 devs).**

The WineYard buyer UI is materially more mature than the current DealFlow buyer PWA (static placeholder content). Porting it saves 3–4 weeks of UI work. The migration is surgery, not copy-paste — Zoho references must be abstracted, the auth model bridged, and the schema aligned — but the surface is well-defined.

---

## 0. Approved Architecture Decisions

| Decision | Resolution |
|---|---|
| **Codebase** | Merge WineYard into DealFlow. Buyer PWA routes already exist at `app/(buyer)/`. WineYard becomes the first tenant, not a standalone product. |
| **Domain** | Single domain `app.dealflow.in`. No per-tenant subdomains for MVP. Defer `{slug}.dealflow.in` to post-PMF. |
| **Auth** | Unified auth for sellers AND buyers. WhatsApp OTP (Meta Cloud API) + email/password. Tenant and role resolved from phone/email after login. |
| **WhatsApp** | DealFlow owns one central WABA number. All OTP and order notifications sent from it. Distributor name + phone included in every message template. |
| **Orders schema** | Three independent tables: `app.estimates`, `app.sales_orders`, `app.invoices`. Current `app.orders` → `app.sales_orders` via migration. |
| **Integrations** | Separate `src/lib/integrations/` module. Sync functions write into app schema. App never reads from integration systems directly. |
| **external_ref** | Stays as-is (string ID of the entity in the external system). Which system it belongs to is known from `app.tenant_integrations` config for that tenant. No changes to existing columns. |
| **Tenant tokens** | Per-tenant OAuth tokens in `app.tenant_integrations`. No integration credentials in env vars (except DealFlow's own WhatsApp token). |
| **Guest mode** | `app.dealflow.in/c/{share_token}` resolves to a tenant's published catalog. `share_token` already exists in `app.published_catalogs`. No UI built yet — just the schema column. |

---

## 1. What WineYard Contains (inventory)

| Area | WineYard | DealFlow buyer (current) |
|---|---|---|
| Auth | Phone → WhatsApp OTP → custom cookie session | Seller: Supabase email/password. Buyer: not built. |
| Products | Synced from Zoho (`zoho_item_id` as PK) | `app.tenant_products` (uuid PK) |
| Pricing | Zoho pricebook per contact | `app.resolve_price()` RPC |
| Cart | `CartContext` (localStorage, reducer pattern) | Not built |
| Catalog browse | Full: search, category filter, brand filter, product grid, PDP | Static HTML placeholders |
| Estimates (enquiries) | PENDING → async Zoho estimate sync | Not built (new table needed) |
| Sales orders | Zoho sales order creation | `app.orders` (to be renamed `app.sales_orders`) |
| Order list UI | Orders tab + Enquiries tab + Transaction cards | Seller app has orders list; buyer side not built |
| Location picker | Zoho warehouse lookup, GPS fallback | `app.locations` table (schema ready) |
| Guest mode | Token-gated browse (no OTP required) | `share_token` on `app.published_catalogs` (schema ready; UI not built) |
| PostHog | Integrated | Integrated |

---

## 2. What Can Be Reused (~60% of WineYard frontend)

These files have zero Zoho dependency and port with type renaming only:

| Component / Module | WineYard path | Adaptation |
|---|---|---|
| Cart context & reducer | `src/components/cart/CartContext.tsx` | Replace `zoho_item_id` → `tenant_product_id` |
| Cart page, bar, sheet | `src/components/cart/Cart*.tsx` | Same layout, identifier swap |
| Product card | `src/components/catalog/ProductCard.tsx` | Type swap, no logic change |
| Product grid / carousel | `src/components/catalog/ProductGrid.tsx`, `ProductCarousel.tsx` | Type swap |
| Search, brand/category filters | `src/components/catalog/SearchBar.tsx`, `BrandFilter.tsx`, `CategoryFilter.tsx` | Wire to DealFlow API routes |
| Catalog page header | `src/components/catalog/CatalogPageHeader.tsx` | Direct port |
| Home client | `src/components/catalog/HomeClient.tsx` | Adapt data sources |
| Bottom tab nav + app column | `src/components/layout/BottomTabs.tsx`, `AppColumn.tsx` | Direct port to `app/(buyer)/layout.tsx` |
| OTP form UI | `src/components/auth/OtpForm.tsx`, `OTPInput.tsx`, `PhoneInput.tsx` | Keep UI; replace backend call contract |
| Order / enquiry UI | `src/components/orders/OrdersTab.tsx`, `TransactionCard.tsx`, `LineItemRow.tsx`, `EnquiryCard.tsx` | Adapt to `app.sales_orders` + `app.estimates` |
| Offline banner, skeletons | `src/components/shared/*.tsx` | Direct port |
| WhatsApp OTP service | `src/lib/whatsapp/otp-service.ts` | Direct port; env vars already aligned |
| Image URL resolvers | `src/lib/catalog/resolve-product-thumbnail-url.ts` | Port; adapt to `catalog.products.image_urls` |
| Pricing display util | `src/lib/pricing.ts` | Port; wire to `resolve_price()` |
| PostHog provider | `src/components/analytics/PostHogProvider.tsx` | Direct port |
| Scroll / swipe hooks | `src/hooks/useScrollDirection.ts`, `useSwipe.ts` | Direct port |

**Quick wins — copy these first (zero changes needed):**
```
src/lib/whatsapp/otp-service.ts
src/hooks/useScrollDirection.ts
src/hooks/useSwipe.ts
src/components/shared/LoadingSkeleton.tsx
src/components/shared/OfflineBanner.tsx
src/components/auth/OTPInput.tsx
src/components/auth/OtpForm.tsx
src/components/auth/PhoneInput.tsx
src/components/layout/AppColumn.tsx
src/components/layout/BottomTabs.tsx
```

---

## 3. What Must Be Rewritten (Zoho surface + auth model)

| File | Replacement |
|---|---|
| `src/lib/zoho.ts` | Moves to `src/lib/integrations/zoho/client.ts` (behind feature flag) |
| `src/types/zoho.ts` | Zoho-specific types stay in the integrations module only |
| `src/types/catalog.ts` (zoho fields) | New `src/types/buyer.ts`: `BuyerCatalogItem`, `BuyerCartItem`, `BuyerSession` |
| `src/lib/auth/server-lookups.ts` | Rewrite: phone → `app.buyers` lookup (no Zoho) |
| `src/lib/auth/otp.ts` | Rewrite: stores `buyer_id` + `tenant_id` instead of `zoho_contact_id` |
| `src/app/api/auth/send-otp/route.ts` | Rewrite against `app.buyers.phone` (seller path: `app.tenant_users`) |
| `src/app/api/auth/verify-otp/route.ts` | Rewrite: upsert `auth.users`, ensure `buyer_users` or `tenant_users` row exists |
| `src/app/api/enquiry/route.ts` | Rewrite: insert into `app.estimates` |
| `src/app/api/orders/route.ts` | Rewrite: insert into `app.sales_orders` |
| `src/app/api/catalog/route.ts` | Rewrite: query `published_catalog_items` → `tenant_products` → `resolve_price()` |
| `src/app/api/pricing-rates/route.ts` | Rewrite: call `resolve_price()` RPC directly |
| `src/contexts/AuthContext.tsx` (WY version) | Merged into DealFlow's existing `AuthContext` + new `BuyerContext` |

---

## 4. Unified Auth Model

### The core rule
One login flow handles all roles. After OTP/password verification:
1. Look up `app.tenant_users` WHERE phone matches (seller contexts)
2. Look up `app.buyer_users` WHERE phone matches (buyer contexts)
3. If one context → auto-login, set JWT claims
4. If multiple contexts → show role/tenant picker
5. JWT claims: `{ tenant_id, buyer_id | null, role, phone }`

### WhatsApp OTP (Meta Cloud API — DealFlow's own number)
- `otp-service.ts` ports directly from WineYard
- Template name changes from `wineyard_otp` → `dealflow_otp` (needs Meta approval, 2–5 business days)
- OTP state stored in new `app.otp_requests` table (below)
- Seller admins and buyer admins use the exact same OTP flow

### Ghost Supabase user pattern
Keep Meta WhatsApp OTP delivery. On successful OTP verification, upsert `auth.users` via service role (`admin.createUser({ phone, phone_confirm: true })`). This ensures RLS works correctly without changing the OTP delivery mechanism.

---

## 5. Schema Changes

### 5a. Rename app.orders → app.sales_orders

The current `app.orders` table is a sales order in accounting terms. It gets renamed. The seller Orders page already uses the correct lifecycle labels (Confirmed / In transit / Delivered / Hold / Cancelled).

```sql
-- Migration: rename orders
ALTER TABLE app.orders RENAME TO sales_orders;
ALTER INDEX idx_orders_tenant_id RENAME TO idx_sales_orders_tenant_id;
-- ... rename all related indexes and triggers
```

### 5b. New: app.estimates

Buyer submits cart → creates an estimate. Seller reviews and confirms → becomes a sales order.

```sql
CREATE TABLE app.estimates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id      uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  estimate_number text,               -- human-readable, e.g. EST-2026-0042
  status        text DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','accepted','declined','expired')),
  catalog_id    uuid REFERENCES app.published_catalogs(id) ON DELETE SET NULL,
  subtotal      numeric,
  tax_amount    numeric,
  total_amount  numeric,
  currency      text DEFAULT 'INR',
  notes         text,
  cart_hash     text,                 -- SHA-256 for duplicate detection
  valid_until   timestamptz,
  placed_by     uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  external_ref  text,                 -- Zoho estimate_id (when df_zoho_integration active)
  deleted_at    timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  created_by    uuid,
  updated_by    uuid,
  UNIQUE(tenant_id, external_ref)
);
CREATE INDEX idx_estimates_tenant_id ON app.estimates(tenant_id);
CREATE INDEX idx_estimates_buyer_id  ON app.estimates(buyer_id);
CREATE INDEX idx_estimates_cart_hash ON app.estimates(buyer_id, cart_hash);
```

### 5c. New: app.invoices

Created after goods are dispatched / delivered (by the seller or via integration sync).

```sql
CREATE TABLE app.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  sales_order_id  uuid REFERENCES app.sales_orders(id) ON DELETE SET NULL,
  invoice_number  text,
  status          text DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','paid','void','overdue')),
  subtotal        numeric,
  tax_amount      numeric,
  total_amount    numeric,
  currency        text DEFAULT 'INR',
  due_date        timestamptz,
  paid_at         timestamptz,
  external_ref    text,               -- Zoho invoice_id (when df_zoho_integration active)
  deleted_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  UNIQUE(tenant_id, external_ref)
);
```

### 5d. New: app.estimate_items and app.invoice_items

```sql
CREATE TABLE app.estimate_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id       uuid NOT NULL REFERENCES app.estimates(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  qty               numeric NOT NULL,
  unit_price        numeric NOT NULL,
  tax_rate          numeric,
  line_total        numeric,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE app.invoice_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  qty               numeric NOT NULL,
  unit_price        numeric NOT NULL,
  tax_rate          numeric,
  line_total        numeric,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
```

### 5e. New: app.otp_requests (replaces WineYard's auth_requests, Zoho-free)

```sql
CREATE TABLE app.otp_requests (
  id             bigserial PRIMARY KEY,
  phone          text NOT NULL,
  ref_id         text NOT NULL UNIQUE,
  otp_code       text NOT NULL,
  otp_expires_at timestamptz NOT NULL,
  ref_expires_at timestamptz NOT NULL,
  attempts       integer DEFAULT 0,
  used           boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_otp_requests_phone ON app.otp_requests(phone);
```

### 5f. New: app.tenant_integrations (per-tenant credentials + config)

Replaces env vars for all integration OAuth tokens.

```sql
CREATE TABLE app.tenant_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  integration   text NOT NULL,          -- 'zoho', 'tally', 'quickbooks', etc.
  is_active     boolean DEFAULT true,
  access_token  text,
  refresh_token text,
  token_expires_at timestamptz,
  config        jsonb DEFAULT '{}',     -- org_id, region, sync settings, etc.
  last_sync_at  timestamptz,
  last_sync_error text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(tenant_id, integration)
);
```

### 5g. Add cart_hash to app.sales_orders

```sql
ALTER TABLE app.sales_orders ADD COLUMN cart_hash text;
CREATE INDEX idx_sales_orders_cart_hash ON app.sales_orders(buyer_id, cart_hash);
```

### 5h. share_token already exists

`app.published_catalogs.share_token text UNIQUE` is already in `init_schemas.sql`. No change needed. Guest mode URL: `app.dealflow.in/c/{share_token}`.

---

## 6. Guest Mode Design (multi-tenant, single domain)

```
app.dealflow.in/c/{share_token}
  → look up app.published_catalogs WHERE share_token = ?
  → resolve tenant_id from catalog row
  → render catalog in read-only mode (no cart, no OTP)
  → show "Login to order" CTA → /login?next=/c/{share_token}
```

After login, the buyer's `buyer_users` row is checked against the catalog's `tenant_id`. If matched, full cart + order placement is available. If not matched (buyer from a different tenant somehow hitting a share link), show a "This catalog is not available for your account" message.

---

## 7. Integrations Module Architecture

```
src/lib/integrations/
├── index.ts                    -- registry: getIntegrationClient(tenant_id)
├── zoho/
│   ├── client.ts               -- OAuth token fetch from app.tenant_integrations
│   ├── sync-products.ts        -- Zoho items → app.tenant_products
│   ├── sync-contacts.ts        -- Zoho contacts → app.buyers
│   ├── sync-estimates.ts       -- app.estimates → Zoho estimates (write-back)
│   ├── sync-sales-orders.ts    -- app.sales_orders → Zoho sales orders (write-back)
│   ├── sync-invoices.ts        -- Zoho invoices → app.invoices (read-back)
│   └── webhook-handler.ts      -- inbound Zoho webhook events
├── tally/
│   └── ...                     -- future
└── quickbooks/
    └── ...                     -- future

app/api/webhooks/
├── zoho/route.ts               -- POST /api/webhooks/zoho
├── tally/route.ts              -- POST /api/webhooks/tally (future)
└── [integration]/route.ts      -- generic handler stub
```

**Key rule:** All integration sync functions read/write through `app.*` schema only. They never expose Zoho/Tally types to the UI layer. The UI always talks to `app.buyers`, `app.tenant_products`, `app.sales_orders`, etc.

The Zoho client reads OAuth tokens from `app.tenant_integrations` (not env vars):
```typescript
// src/lib/integrations/zoho/client.ts
export async function getZohoToken(tenantId: string): Promise<string> {
  const row = await supabase.schema('app')
    .from('tenant_integrations')
    .select('access_token, refresh_token, token_expires_at, config')
    .eq('tenant_id', tenantId)
    .eq('integration', 'zoho')
    .single()
  // refresh if needed, write back to tenant_integrations
}
```

---

## 8. Document Lifecycle (Buyer App View)

### Backend (accounting-accurate)
```
app.estimates    → app.sales_orders → app.invoices
(buyer creates)    (seller confirms)   (seller dispatches)
```

### Buyer PWA labels
```
"Inquiry"   = app.estimates  (status: draft/sent/accepted/declined/expired)
"Order"     = app.sales_orders (status: received/confirmed/dispatched/delivered/cancelled)
"Invoice"   = app.invoices   (status: sent/paid/overdue)
```

### Seller cockpit labels
- Orders page (current) → maps to `app.sales_orders`. Existing filter chips (Confirmed/In transit/Delivered/Hold/Cancelled) map 1:1.
- Estimates page (new) → `app.estimates`. Seller can review and convert to sales order.
- Invoices page (future) → `app.invoices`. Seller can record payment.

---

## 9. WineYard Data Migration to DealFlow

All migrations are one-time SQL scripts run against the WineYard Supabase project, then data imported into DealFlow Supabase.

| WineYard table | DealFlow target | Notes |
|---|---|---|
| `contacts` | `app.buyers` | `zoho_contact_id` → `external_ref`; add `tenant_id` = WineYard tenant uuid |
| `contact_persons` | `app.buyer_users` | Create `auth.users` ghost entries first; link via `user_id` |
| `items` | `app.tenant_products` | `zoho_item_id` → `external_ref`; `base_rate` → `base_selling_price` |
| `categories` | `catalog.categories` | `zoho_category_id` → `external_ref` |
| `brands` | `catalog.brands` | `brand_name` → `name`; create `app.tenant_brands` row |
| `locations` | `app.locations` | `zoho_location_id` → `external_ref` |
| `pricebooks` | `app.price_list_items` | Group by `zoho_pricebook_id` → create `app.price_lists`; items → `price_list_items` |
| `estimates` | `app.estimates` | `zoho_estimate_id` → `external_ref`; `zoho_contact_id` → look up buyer by external_ref |
| `sales_orders` | `app.sales_orders` | `zoho_salesorder_id` → `external_ref` |
| `sessions` | Dropped | Replaced by Supabase Auth sessions |
| `auth_requests` | Dropped | Replaced by `app.otp_requests` |
| `zoho_tokens` | `app.tenant_integrations` | One row: tenant=WineYard, integration=zoho, access/refresh token |

---

## 10. Migration Phases

### Phase 1 — Schema migrations (Week 1)
1. `supabase migration new rename_orders_to_sales_orders`
2. `supabase migration new add_estimates_invoices`
3. `supabase migration new add_otp_requests`
4. `supabase migration new add_tenant_integrations`
5. Update `src/types/database.ts` generated types
6. Update all existing seller app code that references `app.orders` → `app.sales_orders`

### Phase 2 — Unified Auth (Week 1–2)
1. Port `otp-service.ts` to DealFlow (unchanged from WineYard)
2. Submit `dealflow_otp` template to Meta for approval (do this day 1 — 2–5 day wait)
3. Rewrite `api/auth/send-otp`: phone lookup across `tenant_users` + `buyer_users`; generate OTP; store in `otp_requests`
4. Rewrite `api/auth/verify-otp`: validate OTP; upsert `auth.users`; return context list (tenant + role pairs)
5. Add `api/auth/select-context`: if multiple roles, buyer picks one; sets JWT claims
6. Port OTP UI components to `src/components/auth/`
7. Add `app/(auth)/login/phone/page.tsx` and `verify/page.tsx`

### Phase 3 — Product & Catalog API Layer (Week 2)
1. New types in `src/types/buyer.ts`: `BuyerCatalogItem`, `BuyerCartItem`, `BuyerSession`
2. New API routes:
   - `api/buyer/catalog/route.ts` → `published_catalog_items` + `resolve_price()`
   - `api/buyer/catalog/[share_token]/route.ts` → guest mode (no auth)
   - `api/buyer/categories/route.ts`
   - `api/buyer/products/[id]/route.ts`
3. Wire `resolve_price()` RPC for buyer context

### Phase 4 — UI Layer (Week 2–3)
1. Port cart context → `src/contexts/BuyerCartContext.tsx`
2. Port product card, grid, carousel, search, filters → `src/components/buyer/catalog/`
3. Port bottom nav, app column → `src/components/buyer/layout/`
4. Wire real data into `app/(buyer)/shop/` pages
5. Adapt to DealFlow design system tokens (replace WineYard inline styles with Tailwind + shadcn)

### Phase 5 — Estimates & Orders (Week 3–4)
1. New `api/buyer/estimates/route.ts` → insert into `app.estimates` + `app.estimate_items`
2. Port cart page with "Submit inquiry" CTA (→ estimate)
3. New `app/(buyer)/shop/checkout/page.tsx`
4. Port order history UI (OrdersTab, EnquiriesTab → "Orders" and "Inquiries" tabs)
5. Wire `app/(buyer)/shop/orders/page.tsx` with real data from `app.sales_orders` + `app.estimates`

### Phase 6 — Guest Mode (Week 4)
1. `app/(buyer)/c/[token]/page.tsx` → read-only catalog via share_token
2. No cart, no OTP; "Login to order" CTA on product card
3. PostHog: track guest views against `published_catalogs.view_count`

### Phase 7 — Zoho Write-back for WineYard (Week 5–6, behind df_zoho_integration)
1. Build `src/lib/integrations/zoho/client.ts` (reads from `app.tenant_integrations`)
2. Build `src/lib/integrations/zoho/sync-estimates.ts` (app.estimates → Zoho)
3. Build `src/lib/integrations/zoho/sync-sales-orders.ts` (app.sales_orders → Zoho)
4. Supabase Edge Function or pg_cron job: poll every 60s for WineYard tenant unsynced rows
5. Build `app/api/webhooks/zoho/route.ts` for inbound Zoho events
6. Run WineYard data migration (Section 9 above)
7. Decommission WineYard standalone Vercel deployment

---

## 11. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| **Multi-context login** (same phone = seller on Tenant A + buyer on Tenant B) | HIGH | Build context picker in Phase 2. Don't ship auth without this. |
| **dealflow_otp Meta template approval** | MEDIUM | Submit on Day 1 of Phase 2. Use text fallback (already in WineYard's otp-service) while waiting. |
| **resolve_price() empty for WineYard** | MEDIUM | WineYard pricebook → `price_list_items` migration must complete before Phase 3 goes live. |
| **app.orders → app.sales_orders rename** | MEDIUM | All seller app hooks, queries, and RPC references must be updated in Phase 1 before any other phase starts. Run `grep -r "\.orders"` across codebase. |
| **WineYard data migration** (existing estimates, contacts) | MEDIUM | Write and dry-run migration scripts against a copy of WineYard DB before running against production. |
| **Cart state during unauthenticated → authenticated transition** | LOW | Port WineYard's cart hydration pattern (localStorage persists across OTP flow). |
| **WhatsApp message templates** | LOW | Include distributor name + phone in all templates (e.g. "Your inquiry to WineYard [+91-XXXXX] has been received"). |
