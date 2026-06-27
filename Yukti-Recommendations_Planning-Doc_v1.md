# Yukti Buyer App — Recommendation Engine Architecture

**Date:** 2026-06-26  
**Status:** Draft for review  
**Scope:** Multi-tenant recommendation framework for Yukti buyer PWA (DealFlow platform)

---

## 1. Goals

Increase cart value and order frequency through contextual product recommendations. Specifically:

- **Attach rate:** Surface companions (cables, SMPS, storage) that belong in every bundle
- **Upsell:** Guide buyers toward higher-spec alternatives within the same system type
- **Cross-sell:** Expose products from compatible categories the buyer hasn't tried yet
- **Repeat purchase:** Reduce friction for installers restocking consumables

Non-goals for this phase: real-time ML scoring, collaborative filtering, A/B experimentation framework.

---

## 2. Context — What We Learned from WineYard

**Kept from the previous system:**
- Pre-computed association tables (`product_associations`, `category_associations`) — correct pattern
- Statistical lift + confidence scores — right signal quality bar
- Tiered fallback: SKU → category → global bestsellers

**Problems to fix:**
1. **Accessory pollution in bestsellers** — PVC boxes (738 orders) and BNC wires (650 orders) outrank cameras in frequency. These are not discovery products; surfacing them as "bestsellers" wastes a carousel slot.
2. **Proximity = order history only** — New or low-volume SKUs get no recommendations. A newly added 8mp camera has zero co-purchase data but is clearly similar to 5mp cameras.
3. **Performance** — Endpoints recomputed on every user action; carousels reloaded on every click. Fix: pre-compute everything, serve static snapshots, cache client-side.

---

## 3. Multi-Tenant Scoping

Yukti is a multi-tenant platform. Each tenant (distributor) has their own:
- Product catalog (`app.tenant_products`)
- Order history (`app.orders`, `app.order_items`)
- Buyer relationships (`app.buyers`)

**Implication for recommendations:**
- Every recommendation table rows must carry `tenant_id`
- Batch jobs run per-tenant, not globally
- A buyer from Tenant A must never see recommendations computed from Tenant B's order data
- The serving RPCs always filter by `tenant_id` from the JWT claim — never from client input

This means:
- `product_associations` → add `tenant_id uuid NOT NULL`
- `category_associations` → add `tenant_id uuid NOT NULL`
- `product_popularity` → add `tenant_id uuid NOT NULL`
- `customer_profiles` → already keyed to a buyer; buyer is implicitly tenant-scoped
- All indexes include `tenant_id` as the leading column

---

## 4. Product Role Classification

### 4a. System Type (already exists)

The `system_type` column on products (`analog_hd`, `ip_network`, `wifi`, `standalone_remote`, `fiber_optic`, `universal`, `service`) is the primary semantic grouping. It was already designed in the schema.

**Key insight:** `universal` items (PVC, cables, SMPS, nail clips, hard disks) are accessories that appear in every order regardless of system type. They should not compete with `anchor` products in bestseller carousels but are highly valuable as companion suggestions.

### 4b. Recommendation Role (new — category-level flag)

Add `recommendation_role` to the `app.tenant_categories` table (or `catalog.categories` if global):

| Role | Meaning | Examples |
|------|---------|---------|
| `anchor` | Primary discovery products — what a buyer is shopping for | Cameras, DVRs, NVRs, PoE Switches |
| `companion` | Add-ons that belong alongside an anchor | Cables, SMPS, PVC boxes, nail clips, adaptors |
| `storage` | Storage decisions (capacity-driven, not impulse) | Hard Disk, Memory Card |
| `service` | Exclude from all recommendations | Installation Charges, AMC, Config fees |

**Rules:**
- Bestsellers carousel: show only `anchor` products. Companions are high-frequency but not discovery.
- "Frequently Bought Together" / "Complete Your Kit": companions shine here.
- "More from this Category": show within same role. Don't mix anchors and companions in one carousel.

---

## 5. Two Signal Types

### Signal A: Behavioral (order-derived)

Computed from `app.orders` + `app.order_items` within a rolling time window.

| Signal | Source | Used for |
|--------|--------|---------|
| Co-purchase lift | Items in same order | Frequently Bought Together |
| Customer co-purchase | Items across same buyer's orders | People Also Bought |
| Order frequency | Count of orders per product | Bestsellers |
| Repeat purchase rate | Same buyer, multiple orders | Buy Again |
| Category co-occurrence | Categories in same order | Category cross-sell |

Behavioral signals are strong for established SKUs and stable catalog. Weak for new products.

### Signal B: Structural (catalog-derived)

Computed from product attributes, no order history required. Works for all SKUs including new ones.

| Signal | Source | Used for |
|--------|--------|---------|
| Same `system_type` | `tenant_products.system_type` | System-type cross-sell |
| Same category | Category grouping | More from this Category |
| Same brand | Brand attribute | Brand companions |
| Spec tier proximity | Parsed from product name (mp rating, channel count) | Upgrade Path |
| Bundle archetype match | Pre-defined bundle templates | Complete Your Kit gap analysis |

Structural signals are the fallback for low-volume products and the engine for upgrade-path upsell.

---

## 6. Widget Catalog

Eight widgets, ordered by expected cart-value impact.

---

### W1 — Complete Your Kit ⭐ (highest impact)

**Placement:** Cart screen, persistent "You might have missed" section  
**Signal type:** Structural (bundle archetype templates)  
**Mechanism:**
1. Detect which system archetype the cart suggests based on `system_type` of items already in cart
2. Compare cart items against the archetype's required component roles (camera, recorder, storage, cabling, power, mounting)
3. Surface the most popular products in the missing roles, filtered to the detected system type

**Bundle archetypes (pre-defined, editable by tenant):**

| Archetype | Component Roles Required |
|-----------|--------------------------|
| HD Analog | HD Camera, DVR, Hard Disk, BNC+DC Wire, 3+1 Cable, PVC Box, SMPS |
| IP Network | IP Camera, NVR, PoE Switch, Hard Disk, CAT6 Cable, RJ45, PVC Box |
| WiFi Standalone | WiFi Camera, Memory Card |
| Solar/4G Remote | Solar/4G Camera, Memory Card, 4G Router |

**Performance:** Bundle templates are fetched once at app load. Cart-gap analysis runs client-side — zero server calls when the buyer opens cart.

---

### W2 — Frequently Bought Together

**Placement:** Product detail page, below Add to Cart  
**Signal type:** Behavioral (co-purchase lift within same order)  
**Filter:** `lift > 3 AND co_occurrence_count > 10` (lower threshold than WineYard's 50 — adjustable per tenant based on data volume)  
**Fallback:** Category-level associations → Same system_type bestsellers  
**Display:** 3–5 products in a horizontal scroll. Show total bundle price.

---

### W3 — Buy Again

**Placement:** Home screen (logged-in only), first carousel  
**Signal type:** Behavioral (customer's own purchase history)  
**Mechanism:** Query buyer's last 12 months of orders, surface products ordered more than once sorted by recency of last purchase. Prioritize items with `repeat_purchase_rate > 0.25`.  
**Note:** This is a live query, not pre-computed — it's personal to the buyer and small enough to be fast. Cache in React Query for the session.

---

### W4 — People Also Bought

**Placement:** Product detail page  
**Signal type:** Behavioral (cross-order customer-level associations)  
**Difference from W2:** W2 = same order. W4 = same buyer across different orders. Catches items that are bought on a subsequent trip (e.g., buyer buys cameras today, comes back for cables next week).  
**Filter:** Exclude products already in buyer's cart or recently purchased.

---

### W5 — More from this System Type

**Placement:** Product detail page, Category listing page  
**Signal type:** Structural + Behavioral hybrid  
**Mechanism:** Show top products sharing the same `system_type` as the viewed product, ranked by `product_popularity.order_count_30d` within the tenant.  
**Why this beats "More from Category":** In CCTV, a buyer looking at IP cameras cares about NVRs and PoE Switches (different categories, same system type) more than about other connector brands in the same category.

---

### W6 — More from this Category

**Placement:** Product detail page, below W5  
**Signal type:** Structural (category rank)  
**Mechanism:** Top products within the same category by `category_rank`, excluding the current product and items already in cart.  
**Note:** Most useful when `recommendation_role = 'companion'` — e.g., viewing BNC Wire → other connectors.

---

### W7 — Bestsellers

**Placement:** Home screen, Catalog home  
**Signal type:** Behavioral (order frequency, rolling 30d)  
**Filter:** `recommendation_role = 'anchor'` only. Companions excluded from global bestsellers. Show category-level bestsellers in category pages (companions allowed within category context).  
**Tenant-scoped:** Each tenant's bestsellers reflect only their own order history.

---

### W8 — Upgrade Path

**Placement:** Product detail page, as "Consider upgrading" secondary section  
**Signal type:** Structural (spec tier within same brand + category)  
**Mechanism:** Parse spec tier from product name patterns (e.g., 2.4mp → 5mp cameras, 4-Ch DVR → 8-Ch DVR, 1TB HDD → 2TB HDD). Surface the next-tier product. Powered by a `product_upgrade_paths` table (see §7.3).  
**Note:** Keep this subtle — don't push upgrades on buyers who are in replenishment mode. Show only on anchor products, not companions.

---

## 7. Data Model Changes

### 7.1 Add `tenant_id` to all recommendation tables

All existing recommendation tables from the March 2026 schema get `tenant_id`:

```sql
-- Add to product_associations, category_associations, product_popularity
ALTER TABLE app.product_associations 
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL REFERENCES app.tenants(id);

ALTER TABLE app.category_associations 
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL REFERENCES app.tenants(id);

ALTER TABLE app.product_popularity 
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL REFERENCES app.tenants(id);
```

Update unique constraints and indexes to include `tenant_id` as leading column.

---

### 7.2 Add `recommendation_role` to categories

```sql
ALTER TABLE catalog.categories 
  ADD COLUMN IF NOT EXISTS recommendation_role text 
  DEFAULT 'anchor' 
  CHECK (recommendation_role IN ('anchor', 'companion', 'storage', 'service'));
```

Seed values based on WineYard classification:
- `companion`: Connectors, PVC Accessories, Cables, SMPS, Adaptors, Tools, General
- `storage`: Hard Disk, Memory Card
- `anchor`: HD Camera, IP Camera, DVR, NVR, PoE Switch, WiFi Camera, Solar Camera, 4G SIM Camera, Fiber Optic Products, Routers & Network Switch, Monitors
- `service`: Service line items

---

### 7.3 New: `product_upgrade_paths` table

Pre-defined or auto-derived upgrade relationships between SKUs.

```sql
CREATE TABLE IF NOT EXISTS app.product_upgrade_paths (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  from_product_id uuid NOT NULL, -- lower-tier product
  to_product_id   uuid NOT NULL, -- higher-tier product
  path_type     text NOT NULL CHECK (path_type IN ('spec_upgrade', 'capacity_upgrade', 'brand_upgrade')),
  source        text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  computed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_product_id, to_product_id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_paths_from 
  ON app.product_upgrade_paths (tenant_id, from_product_id);
```

Auto-computation parses product names for spec patterns (mp ratings, channel counts, HDD capacities). Manual overrides always win.

---

### 7.4 New: `bundle_archetypes` table

Editable per-tenant bundle templates that power W1.

```sql
CREATE TABLE IF NOT EXISTS app.bundle_archetypes (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  system_type     text NOT NULL REFERENCES catalog.system_types(system_type_code),
  component_role  text NOT NULL,  -- e.g., 'recorder', 'camera', 'storage', 'cabling', 'power', 'mounting'
  display_order   int NOT NULL DEFAULT 0,
  is_required     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, system_type, component_role)
);
```

Seeded from the three known WineYard archetypes. Tenant can add or remove component roles via Settings.

---

## 8. Pre-Computation Strategy

All recommendation data is batch-computed. No endpoint computes recommendations at query time.

### 8.1 Job schedule (Supabase pg_cron)

| Job | Frequency | Window | Tables written |
|-----|-----------|--------|---------------|
| `compute_product_associations` | Weekly (Sunday 2am) | Rolling 90d | `product_associations` |
| `compute_category_associations` | Weekly (Sunday 2am) | Rolling 90d | `category_associations` |
| `compute_product_popularity` | Daily (3am) | Rolling 30d | `product_popularity` |
| `compute_customer_profiles` | Weekly (Monday 3am) | Rolling 90d | `customer_profiles` |
| `compute_upgrade_paths` | Weekly (Sunday 3am) | Catalog scan | `product_upgrade_paths` |

### 8.2 Tenant isolation in batch jobs

Each job iterates over active tenants. The job function signature:

```sql
-- Example: runs per-tenant association computation
CREATE OR REPLACE FUNCTION app.compute_product_associations_for_tenant(
  p_tenant_id uuid,
  p_time_window_days int DEFAULT 90
) RETURNS void ...
```

pg_cron calls a wrapper that fans out to each active tenant:

```sql
SELECT app.compute_product_associations_for_tenant(id, 90)
FROM app.tenants
WHERE status = 'active';
```

### 8.3 Association computation logic

For `product_associations` (co-purchase within same order):

```sql
-- Co-occurrence matrix for a tenant, rolling window
WITH order_pairs AS (
  SELECT 
    oi1.tenant_product_id AS item_a,
    oi2.tenant_product_id AS item_b,
    COUNT(DISTINCT oi1.order_id) AS co_occurrence
  FROM app.order_items oi1
  JOIN app.order_items oi2 
    ON oi1.order_id = oi2.order_id 
    AND oi1.tenant_product_id < oi2.tenant_product_id
  JOIN app.orders o ON o.id = oi1.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= now() - make_interval(days => p_time_window_days)
    AND o.status NOT IN ('cancelled', 'draft')
  GROUP BY oi1.tenant_product_id, oi2.tenant_product_id
  HAVING COUNT(DISTINCT oi1.order_id) >= 5  -- minimum support threshold
)
-- Calculate lift from marginal frequencies, insert bidirectional rows
...
```

Minimum support of 5 orders (vs WineYard's 50) — adjusted for smaller tenants. Make this a configurable tenant setting.

---

## 9. Serving Layer — RPCs

One RPC per widget type. All accept `tenant_id` from JWT (never from client). All read from pre-computed tables only.

### `app.get_recommendations_for_product(p_product_id, p_tenant_id, p_buyer_id, p_widget_types text[])`

Accepts an array of widget types and returns all requested carousels in one call. This is the key performance fix — one round trip loads everything the product detail page needs.

```sql
-- Returns JSON: { "frequently_bought_together": [...], "people_also_bought": [...], ... }
```

### `app.get_home_recommendations(p_tenant_id, p_buyer_id)`

Returns home page carousels: bestsellers + buy_again (if buyer has history).

### `app.get_cart_gap_analysis(p_tenant_id, p_cart_product_ids uuid[])`

Returns the bundle archetype match + missing component roles + recommended products to fill gaps. Used for W1 on cart page.

### `app.get_bestsellers(p_tenant_id, p_category_id uuid DEFAULT NULL, p_limit int DEFAULT 20)`

Global bestsellers (anchor only) or category bestsellers. Used for fallback and catalog homepage.

---

## 10. Client-Side Performance

### 10.1 Load strategy

- **Product detail page:** One call to `get_recommendations_for_product` with all needed widget types on page mount. Cache result with React Query `staleTime: 10 minutes`. Do not refetch on tab switch or scroll.
- **Home page:** One call to `get_home_recommendations` on mount. `staleTime: 5 minutes`.
- **Cart:** `get_cart_gap_analysis` called once when cart opens, or when cart contents change (debounced, 500ms). Bundle archetype templates prefetched at app init.

### 10.2 React Query setup

```ts
// Product detail — fetch all carousels in one query
const { data: recommendations } = useQuery({
  queryKey: ['recommendations', productId, tenantId],
  queryFn: () => supabase.schema('app').rpc('get_recommendations_for_product', {
    p_product_id: productId,
    p_tenant_id: tenantId,
    p_buyer_id: buyerId,
    p_widget_types: ['frequently_bought_together', 'people_also_bought', 'more_from_system_type', 'upgrade_path']
  }),
  staleTime: 10 * 60 * 1000,  // 10 minutes
  gcTime: 30 * 60 * 1000,     // keep in cache 30 minutes
})
```

### 10.3 Cart gap — client-side computation

The bundle archetype templates (W1) are fetched once at app init and stored in a context. When cart contents change:

```ts
function computeCartGap(cartProducts, archetypes) {
  const detectedSystemType = detectDominantSystemType(cartProducts)
  const archetype = archetypes[detectedSystemType]
  const coveredRoles = getCoveredComponentRoles(cartProducts, archetype)
  const missingRoles = archetype.filter(role => !coveredRoles.has(role.component_role))
  return missingRoles
}
```

No network call. Missing role → product mapping is fetched from pre-computed bestsellers-by-role, loaded at app init.

---

## 11. Fallback Hierarchy

When a widget cannot find enough data, fall back gracefully:

```
W2/W4 (product-level behavioral)
  → if lift data insufficient: category_associations (same category pair)
  → if category data insufficient: bestsellers within same system_type
  → if system_type has < 3 products: global tenant bestsellers (anchors only)

W5 (system type)
  → if system_type = 'universal': fall back to same category
  → if category too small: global bestsellers

W8 (upgrade path)
  → if no upgrade path exists: show peer products (same category, same brand, similar spec tier)
  → if none: skip widget entirely (don't show empty carousel)
```

**Rule:** Never show an empty carousel. Either fill with fallback or hide the widget.

---

## 12. Handling Accessories Correctly

The "accessory problem" is solved at three layers:

| Layer | Mechanism |
|-------|-----------|
| Bestsellers (W7) | `recommendation_role = 'anchor'` filter — companions never appear |
| Companion carousels (W2, W1) | Companions appear *only as suggestions*, never as the anchor product being viewed |
| Category rank (W6) | Within-category, companions rank fine — viewing PVC boxes → other PVC boxes is correct |
| Cart gap (W1) | Companions fill "missing role" slots — cables are expected, not surprising |

---

## 13. Build Sequence

### Phase 1 — Foundation (prerequisite)
- [ ] Add `tenant_id` to all recommendation tables from March 2026 schema
- [ ] Add `recommendation_role` to categories, seed values
- [ ] Create `bundle_archetypes` and `product_upgrade_paths` tables
- [ ] Build `compute_product_associations_for_tenant` RPC + pg_cron schedule
- [ ] Build `compute_product_popularity` daily job

### Phase 2 — Serving Layer
- [ ] `get_recommendations_for_product` RPC (multi-widget, single round trip)
- [ ] `get_home_recommendations` RPC
- [ ] `get_cart_gap_analysis` RPC
- [ ] `get_bestsellers` RPC
- [ ] RLS policies on all recommendation tables (service-role write, authenticated read within tenant)

### Phase 3 — Buyer App UI
- [ ] React Query setup with stale times as specified
- [ ] Home: Bestsellers carousel (W7) + Buy Again carousel (W3)
- [ ] Product detail: Frequently Bought Together (W2) + People Also Bought (W4)
- [ ] Product detail: More from System Type (W5)
- [ ] Cart: "Complete Your Kit" gap widget (W1) — client-side computation
- [ ] Cart: "You might have missed" product cards from gap analysis

### Phase 4 — Enhancements (post-pilot)
- [ ] More from Category (W6) — lower priority, covered by W5 fallback
- [ ] Upgrade Path (W8) — requires spec parsing logic
- [ ] Per-tenant min support threshold configuration in Settings
- [ ] Tenant can manually edit bundle archetypes via cockpit Settings
- [ ] `compute_upgrade_paths` auto-classifier

---

## 14. What to Defer

| Feature | Why defer |
|---------|----------|
| Real-time personalization (user-session signals) | Supabase pg_cron is sufficient; real-time adds complexity with marginal gain for B2B repeat buyers |
| Collaborative filtering / ML scoring | The statistical lift + structural model covers this use case well; ML adds ops overhead without clear uplift at this stage |
| A/B testing widget placement | Needs PostHog experiments feature flag + event instrumentation first |
| Cross-tenant recommendations | Never. Tenants are strictly isolated. |
| Recommendation analytics dashboard | PostHog events for widget impressions + add-to-cart from widget — instrument first, dashboard later |

---

## 15. PostHog Event Instrumentation

Track from day one to measure widget impact:

```ts
posthog.capture('recommendation_widget_impression', {
  widget_type: 'frequently_bought_together',
  product_id: productId,
  tenant_id: tenantId,
  result_count: results.length,
})

posthog.capture('recommendation_add_to_cart', {
  widget_type: 'frequently_bought_together',
  source_product_id: productId,
  recommended_product_id: addedProductId,
  tenant_id: tenantId,
})
```

Key metric: **Widget attach rate** = (add-to-cart from recommendation) / (product detail page views). Target: >15% on W2 within 30 days of launch.
