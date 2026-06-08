You are executing a phased migration of the WineYard Catalog buyer app into the DealFlow codebase. 

Read the full migration plan first:
  /Users/phanikrovvidi/projects/deal-flow/wineyard-migration-plan.md

Source codebase (WineYard — read-only, do not modify):
  /Users/phanikrovvidi/projects/wineyard-catalog/app/src/

Target codebase (DealFlow — all writes go here):
  /Users/phanikrovvidi/projects/deal-flow/

Execute the phases below sequentially. Use a separate subagent for each phase. Do not start the next phase until the current one passes its validation gate. If a phase fails validation after 2 attempts, stop and write a BLOCKED.md file in the repo root explaining what failed and why.

---

PHASE 1 — Schema migrations
Subagent scope: Write SQL migration files only. No application code changes yet.

Tasks:
1. Run: cd /Users/phanikrovvidi/projects/deal-flow && supabase migration new rename_orders_to_sales_orders
2. In that migration file, rename app.orders → app.sales_orders and rename all its indexes and triggers.
3. Run: supabase migration new add_estimates_invoices_otp_integrations
4. In that migration file, create:
   - app.estimates (schema in migration plan Section 5b)
   - app.estimate_items (Section 5d)
   - app.invoices (Section 5c)
   - app.invoice_items (Section 5d)
   - app.otp_requests (Section 5e)
   - app.tenant_integrations (Section 5f)
   - ALTER TABLE app.sales_orders ADD COLUMN cart_hash text; (Section 5g)
   - CREATE INDEX on sales_orders(buyer_id, cart_hash)
5. Run: supabase migration new add_estimates_indexes
   Add all missing indexes for the new tables.

Validation gate: Run `supabase db push --dry-run` (or `supabase migration list`). All migrations must apply without errors. No application code should be changed in this phase.

---

PHASE 2 — Update all DealFlow seller app references from orders → sales_orders
Subagent scope: Find and fix every reference to app.orders in the DealFlow seller app.

Tasks:
1. Search across src/ and supabase/ for all references to 'orders' table (the app.orders table, not the route path /orders). Fix them to reference sales_orders. Use grep to find them first, then edit.
2. Update src/types/database.ts: rename the orders table type to sales_orders.
3. Update src/hooks/useOrders.ts: all Supabase queries referencing .from('orders') → .from('sales_orders').
4. Update any RPC or function in supabase/migrations/ that references app.orders by name.
5. Do NOT rename the URL route /orders in the seller app — keep the UI routes as-is. Only the DB table name changes.

Validation gate: Run `npx tsc --noEmit` from /Users/phanikrovvidi/projects/deal-flow. Zero type errors related to orders/sales_orders. 

---

PHASE 3 — Copy zero-change WineYard files into DealFlow
Subagent scope: File copies only. No modifications to copied files except import path updates.

Copy these files from WineYard src/ to DealFlow src/, creating directories as needed. After copying each file, update any import paths that reference WineYard-specific aliases to use DealFlow's @/ alias.

Copies:
  WineYard: src/lib/whatsapp/otp-service.ts         → DealFlow: src/lib/whatsapp/otp-service.ts
  WineYard: src/hooks/useScrollDirection.ts          → DealFlow: src/hooks/useScrollDirection.ts
  WineYard: src/hooks/useSwipe.ts                    → DealFlow: src/hooks/useSwipe.ts
  WineYard: src/components/shared/LoadingSkeleton.tsx → DealFlow: src/components/buyer/LoadingSkeleton.tsx
  WineYard: src/components/shared/OfflineBanner.tsx   → DealFlow: src/components/buyer/OfflineBanner.tsx
  WineYard: src/components/auth/OTPInput.tsx          → DealFlow: src/components/buyer/auth/OTPInput.tsx
  WineYard: src/components/auth/OtpForm.tsx           → DealFlow: src/components/buyer/auth/OtpForm.tsx
  WineYard: src/components/auth/PhoneInput.tsx        → DealFlow: src/components/buyer/auth/PhoneInput.tsx
  WineYard: src/components/layout/AppColumn.tsx       → DealFlow: src/components/buyer/layout/AppColumn.tsx
  WineYard: src/components/layout/BottomTabs.tsx      → DealFlow: src/components/buyer/layout/BottomTabs.tsx

Validation gate: Run `npx tsc --noEmit`. Copied files must compile with zero errors. If a file has unresolved imports that genuinely don't exist in DealFlow yet, stub the missing dependency with a TODO comment and a type-safe empty export.

---

PHASE 4 — New TypeScript types
Subagent scope: Write src/types/buyer.ts only.

Create /Users/phanikrovvidi/projects/deal-flow/src/types/buyer.ts with the following types. These replace WineYard's src/types/catalog.ts for the DealFlow context:

- BuyerCatalogItem: product info for the buyer catalog grid. Fields: tenant_product_id (string), internal_sku (string), name (string), brand_name (string | null), category_name (string | null), base_selling_price (number), final_price (number), price_type ('price_list' | 'base'), image_urls (string[] | null), gst_rate (number), stock_status ('available' | 'limited' | 'out_of_stock'), available_qty (number | null)
- BuyerCartItem: cart line. Fields: tenant_product_id (string), internal_sku (string), name (string), quantity (number), unit_price (number), gst_rate (number), line_total (number), image_urls (string[] | null)
- BuyerSession: JWT context for an authenticated buyer. Fields: buyer_id (string), tenant_id (string), role ('buyer_admin' | 'buyer_assistant'), phone (string), business_name (string), contact_name (string | null)
- EstimateRequest: { items: BuyerCartItem[]; notes?: string; catalog_id?: string | null }
- EstimateResponse: { success: boolean; estimate_id: string; estimate_number: string | null; whatsapp_sent: boolean; sync_pending?: boolean; error?: string }

Also export a cartItemFromCatalogItem(item: BuyerCatalogItem, qty: number): BuyerCartItem helper function.

Validation gate: `npx tsc --noEmit` passes.

---

PHASE 5 — Port cart context
Subagent scope: Write src/contexts/BuyerCartContext.tsx only.

Copy the logic from WineYard's src/components/cart/CartContext.tsx into DealFlow at src/contexts/BuyerCartContext.tsx. Make these changes:
1. Replace all references to CartItem → BuyerCartItem (import from @/types/buyer)
2. Replace all references to zoho_item_id → tenant_product_id
3. Change localStorage key from 'wineyard_cart' → 'dealflow_cart'
4. Export: CartProvider, useCart, BuyerCartContext (named exports, not default)

Validation gate: `npx tsc --noEmit` passes.

---

PHASE 6 — Unified auth API routes
Subagent scope: Write 3 new API routes for buyer + seller unified phone OTP auth.

Create these files in /Users/phanikrovvidi/projects/deal-flow/app/api/auth/:

1. phone-otp/send/route.ts — POST handler:
   - Accept: { phoneNumber: string }
   - Look up phone in app.buyer_users (via app.buyers.phone) and app.tenant_users (via auth.users phone field)
   - Generate 6-digit OTP, store in app.otp_requests (ref_id = nanoid(), expires in 10 min)
   - Call sendOTP() from src/lib/whatsapp/otp-service.ts
   - Return: { success: boolean; ref_id: string; context_count: number; registered: boolean }
   - Use Supabase service role client (src/lib/supabase.ts createServiceClient pattern)

2. phone-otp/verify/route.ts — POST handler:
   - Accept: { ref_id: string; otp_code: string; phone: string }
   - Validate OTP against app.otp_requests (check expiry, attempts < 3, not used)
   - Increment attempts on failure; mark used=true on success
   - On success: look up all contexts (tenant_id + role pairs) for this phone across tenant_users and buyer_users
   - If zero contexts: return { registered: false }
   - If one context: create/upsert auth.users via supabase.auth.admin.createUser, return { contexts: [...], auto_selected: true, session_token: ... }
   - If multiple contexts: return { contexts: [{ tenant_id, tenant_name, role, buyer_id? }], auto_selected: false }
   - Return: { success: boolean; registered: boolean; contexts: Context[]; auto_selected: boolean }

3. phone-otp/select-context/route.ts — POST handler:
   - Accept: { ref_id: string; tenant_id: string; role: string }
   - Validate the ref_id was recently verified (add a verified_at timestamp to otp_requests)
   - Issue a Supabase session for the corresponding auth.users record
   - Return: { success: boolean; redirect: '/dashboard' | '/shop/home' }

Validation gate: `npx tsc --noEmit` passes. All route files must export a named POST function.

---

PHASE 7 — Buyer catalog API route
Subagent scope: Write one API route that serves products to the buyer PWA.

Create /Users/phanikrovvidi/projects/deal-flow/app/api/buyer/catalog/route.ts — GET handler:

- Require a valid buyer session (read JWT claims: buyer_id, tenant_id)
- Accept query params: catalog_id? (uuid), category_id? (uuid), brand_id? (uuid), search? (text), limit? (default 40), offset? (default 0)
- Query: published_catalog_items JOIN tenant_products JOIN catalog.products WHERE catalog_id = ? AND tenant_id = ?
- For each product, call the resolve_price(tenant_product_id, buyer_id, 1) RPC to get final_price
- Map result to BuyerCatalogItem[] (from src/types/buyer.ts)
- Return: { items: BuyerCatalogItem[]; total: number; has_more: boolean }

Also create app/api/buyer/catalog/[share_token]/route.ts — GET handler (guest mode, no auth):
- Look up app.published_catalogs WHERE share_token = ? AND status = 'published'
- Return same BuyerCatalogItem[] shape but with final_price = base_selling_price (no buyer-specific pricing)
- No buyer_id required

Validation gate: `npx tsc --noEmit` passes.

---

PHASE 8 — Port product card and catalog UI components
Subagent scope: Port 4 components from WineYard to DealFlow buyer components.

1. Copy WineYard's src/components/catalog/ProductCard.tsx → DealFlow src/components/buyer/catalog/ProductCard.tsx
   Changes: import BuyerCatalogItem from @/types/buyer; replace zoho_item_id → tenant_product_id; replace useCart import to @/contexts/BuyerCartContext; replace all inline style objects with Tailwind classes matching DealFlow's design tokens (teal/cream/ember palette from design-system/colors_and_type.css)

2. Copy WineYard's src/components/catalog/ProductGrid.tsx → DealFlow src/components/buyer/catalog/ProductGrid.tsx
   Changes: same type swap as above

3. Copy WineYard's src/components/catalog/SearchBar.tsx → DealFlow src/components/buyer/catalog/SearchBar.tsx
   Changes: style migration to Tailwind/shadcn Input component

4. Create DealFlow src/components/buyer/layout/BuyerShell.tsx: wraps children with CartProvider (from BuyerCartContext), BottomTabs, AppColumn. This is what app/(buyer)/layout.tsx should render.

Validation gate: `npx tsc --noEmit` passes. Do not wire up live pages yet — components only.

---

After all 8 phases complete, write a MIGRATION_STATUS.md file at the repo root summarising:
- Which phases completed successfully
- Which phases had issues (with specific error messages)
- What manual steps remain before the buyer PWA is live
- Any TODOs left in code (run grep -r "TODO" src/components/buyer/ src/contexts/Buyer* app/api/buyer/ app/api/auth/phone-otp/)

Do not run `supabase db push` (apply migrations to production) — leave that for human review. Do run `npx tsc --noEmit` after every phase.
