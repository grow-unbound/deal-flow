# Yukti Buyer App — Recommendation Engine Architecture

**Date:** 2026-06-26  
**Status:** Draft for review  
**Scope:** Multi-tenant, multi-industry recommendation framework — designed from scratch on current schema

---

## 1. Orientation

### What exists in the schema

Relevant tables already in place (no recommendation tables exist yet):

| Table | Relevance |
|---|---|
| `app.orders` + `app.order_items` | Source of all behavioral signals (co-purchase, frequency, repeat) |
| `app.tenant_products` | Products per tenant — has `tenant_category_id`, `tenant_brand_id` |
| `app.tenant_categories` | Tenant-specific categories — this is where Phase 2 role flags will land |
| `app.buyers` | Buyer profiles — personalization target |
| `app.tenants` | Multi-tenant root — all recommendation rows are scoped here |

### What does not exist and will be built

Everything recommendation-related is net-new, across three phases.

---

## 2. Design Principles

**Strict multi-tenancy.** Every recommendation table carries `tenant_id` as the leading column on all indexes. A buyer from Tenant A never sees data from Tenant B. RLS enforces this at the DB layer. Serving RPCs read `tenant_id` from the JWT claim — never from client input.

**All tables in `app` schema.** No recommendation data touches `catalog`. Catalog is read-only master reference data. Our behavioral signals (orders, associations, popularity) are tenant-specific operational data that belongs in `app`.

**Pre-compute everything, serve static snapshots.** No recommendation endpoint computes at query time. Background jobs (pg_cron) write to pre-computed tables on a schedule. API calls are pure reads. This is the fix for the runtime performance problems in the previous system.

**Generic, not industry-specific.** The framework works for electricals, electronics, automotive spares, hardware, construction material — any distributor industry. CCTV-specific concepts (system_type, component roles) are not wired in. Instead, the Phase 2 layer exposes configurable constructs that a distributor or Yukti super-admin can populate for their industry context.

**Each phase ships independently.** Phase 1 works on order data alone — zero tenant setup required. Phase 2 adds structured configuration to improve quality. Phase 3 adds cross-category semantic grouping. A distributor who never progresses past Phase 1 still gets real value.

---

## 3. Answering the Open Questions

### Q1: Can `system_type` be deferred to Phase 3 without hurting Phase 1/2?

Yes, completely safe to defer. Phase 1 and Phase 2 have no dependency on it. The only widget that benefits from cross-category grouping is "More from this Group" (e.g., IP Camera → NVR even though they're different categories). Without it, the fallback is "More from this Category" — less powerful but not broken. Defer without risk.

### Q2: Should grouping be at category level or product level?

**Category level.** Assign the group label to `app.tenant_categories`, not to each product. Every new product in that category inherits the group automatically — nothing to maintain per SKU. Product-level override exists as an escape hatch for rare edge cases (a product that genuinely straddles two groups), but the category-level assignment covers 95%+ of cases with zero effort.

### Q3: Can bundles be auto-computed, or does the distributor have to configure them?

Both, and neither is required. Three paths:

**Path A — Auto-suggested (preferred starting point).** After Phase 1 has run for 30+ days, the batch job can detect "these 3–4 categories always appear together in orders" and surface them as suggested bundle candidates in the cockpit Settings. The distributor reviews and confirms with one click. No manual definition from scratch.

**Path B — Manual setup.** The distributor defines bundles explicitly in Settings > Product Recommendations. Higher effort, better accuracy for specific use cases. Appropriate for distributors who know their bundles well (like CCTV installers knowing a Camera + DVR + HDD + Cables kit).

**Path C — Not configured.** If no bundles are defined, the "Complete Your Cart" widget simply doesn't render. Nothing breaks. All other widgets continue working.

### Q4: How does cart-gap behave in industries where bundles don't apply?

Cart gap requires bundle definitions (Phase 2). In industries where no clear bundle exists (e.g., consumer electronics, smartphones, random hardware), the widget doesn't render — suppressed by the absence of bundle definitions for the tenant. The cart page still shows co-purchase suggestions (W2 from Phase 1) which are always available regardless of bundles and work fine for non-bundle industries.

### Q5: Where does super-admin configuration live?

Two-tier config:

- **Platform defaults** (`app.reco_category_role_defaults`) — Yukti super-admin defines `recommendation_role` defaults keyed to `catalog.categories` master categories. This gives out-of-the-box sensible configuration for common industries without requiring each distributor to set up anything.
- **Tenant override** — A column on `app.tenant_categories.recommendation_role`. If set, this overrides the platform default for that tenant. If NULL, the platform default applies. Distributors control this via their Settings > Product Recommendations page.

---

## 4. Phase 1 — Behavioral Engine

**Delivers:** Bestsellers, Frequently Bought Together, People Also Bought, Buy Again.  
**Requires from tenant:** Nothing. Works on order history alone.  
**When to ship:** Immediately after enough order data exists (~30 days of orders recommended, but 14 days is usable).

### New tables

#### `app.reco_product_associations`

Pre-computed co-purchase pairs. Directional — A→B and B→A stored as separate rows so queries need no self-join.

```sql
CREATE TABLE IF NOT EXISTS app.reco_product_associations (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  product_a_id        uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  product_b_id        uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  association_type    text NOT NULL
    CHECK (association_type IN ('co_order', 'co_buyer')),
    -- co_order:  appeared in the same order (basket analysis)
    -- co_buyer:  same buyer purchased across different orders (cross-session)
  co_occurrence_count int NOT NULL DEFAULT 0,
  lift_score          numeric(10,6),
  confidence          numeric(10,6),  -- P(B | A)
  time_window_days    int NOT NULL,   -- rolling window used: 30, 60, 90
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_a_id, product_b_id, association_type, time_window_days)
);

CREATE INDEX IF NOT EXISTS idx_reco_assoc_lookup
  ON app.reco_product_associations (tenant_id, product_a_id, association_type, time_window_days);
CREATE INDEX IF NOT EXISTS idx_reco_assoc_product_b
  ON app.reco_product_associations (tenant_id, product_b_id);
```

**`co_order` vs `co_buyer`:**  
- `co_order` — items in the same order. Drives "Frequently Bought Together."
- `co_buyer` — same buyer across different orders. Drives "People Also Bought." Captures items a buyer returns for on a next trip that didn't land in the original basket.

#### `app.reco_product_popularity`

One row per product per tenant. Recomputed daily.

```sql
CREATE TABLE IF NOT EXISTS app.reco_product_popularity (
  tenant_id               uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tenant_product_id       uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE CASCADE,
  order_count_7d          int NOT NULL DEFAULT 0,
  order_count_30d         int NOT NULL DEFAULT 0,
  order_count_90d         int NOT NULL DEFAULT 0,
  revenue_30d             numeric(14,2) NOT NULL DEFAULT 0,
  unique_buyer_count_30d  int NOT NULL DEFAULT 0,
  repeat_buyer_count_30d  int NOT NULL DEFAULT 0,  -- buyers who ordered it >1x in window
  category_rank_30d       int,  -- rank within tenant_category_id by order_count_30d
  computed_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tenant_product_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_popularity_category_rank
  ON app.reco_product_popularity (tenant_id, category_rank_30d)
  WHERE order_count_30d > 0;
CREATE INDEX IF NOT EXISTS idx_reco_popularity_trending
  ON app.reco_product_popularity (tenant_id, order_count_30d DESC)
  WHERE order_count_30d > 0;
```

#### `app.reco_buyer_profiles`

Per-buyer purchase summary. Drives "Buy Again." Refreshed weekly.

```sql
CREATE TABLE IF NOT EXISTS app.reco_buyer_profiles (
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id          uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  top_products      jsonb NOT NULL DEFAULT '[]',
  -- [{product_id, order_count, last_ordered_at, product_name}] sorted by recency
  top_categories    jsonb NOT NULL DEFAULT '[]',
  -- [{category_id, order_count, last_ordered_at}]
  refreshed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_buyer_profiles_refreshed
  ON app.reco_buyer_profiles (tenant_id, refreshed_at);
```

### Batch jobs (pg_cron)

| Job function | Schedule | Window | Writes to |
|---|---|---|---|
| `app.reco_compute_popularity(tenant_id)` | Daily 3am | 7d / 30d / 90d | `reco_product_popularity` |
| `app.reco_compute_associations(tenant_id, window)` | Weekly Sunday 2am | 90d | `reco_product_associations` |
| `app.reco_refresh_buyer_profiles(tenant_id)` | Weekly Monday 3am | 12 months | `reco_buyer_profiles` |

Each function runs per-tenant. A pg_cron wrapper iterates over `app.tenants WHERE status = 'active'`.

**Minimum support threshold:** Association pairs require `co_occurrence_count >= 3` (configurable per tenant via `app.tenants.settings` JSONB field `reco_min_support`). This prevents noisy pairs from thin data. Increase as order volume grows.

### Phase 1 widgets

| Widget | Signal | Placement | Fallback |
|---|---|---|---|
| **W1 — Bestsellers** | `reco_product_popularity.order_count_30d` | Home, Catalog landing | Global order count if category is thin |
| **W2 — Frequently Bought Together** | `co_order` associations, `lift_score > 2` | Product detail page | Category bestsellers |
| **W3 — People Also Bought** | `co_buyer` associations | Product detail page | Category bestsellers |
| **W4 — Buy Again** | `reco_buyer_profiles.top_products` (logged-in only) | Home (first carousel) | None — skip if no history |
| **W5 — More from this Category** | `category_rank_30d` | Product detail, Category page | Top products in category by created_at |

### Serving RPCs

All RPCs read pre-computed tables only. All filter on JWT `tenant_id`.

```sql
-- Single call returns multiple carousels for product detail page
app.reco_get_product_page(
  p_tenant_product_id uuid,
  p_buyer_id          uuid,         -- NULL if not logged in
  p_widget_types      text[],       -- ['co_order', 'co_buyer', 'same_category']
  p_limit             int DEFAULT 8
) RETURNS jsonb

-- Home page
app.reco_get_home(
  p_tenant_id uuid,
  p_buyer_id  uuid
) RETURNS jsonb

-- Global bestsellers (used as fallback by other RPCs too)
app.reco_get_bestsellers(
  p_tenant_id     uuid,
  p_category_id   uuid DEFAULT NULL,
  p_limit         int  DEFAULT 20
) RETURNS SETOF app.tenant_products
```

### RLS

All `reco_*` tables: `ENABLE ROW LEVEL SECURITY`.
- Write policy: `service_role` only (batch jobs run as service role).
- Read policy: `app.jwt_tenant_id() = tenant_id` — same pattern as all other app tables.

---

## 5. Phase 2 — Category Roles + Bundle Framework

**Builds on:** Phase 1 must be running and generating data.  
**Delivers:** Smarter bestsellers (suppresses accessories), "Complete Your Cart" gap widget, bundle auto-suggestions.  
**Requires from tenant:** Nothing for the auto-learned path. Distributor can override when the auto-classification is wrong.

### The accessory problem — why it needs fixing

In any distribution business, there are two types of products in a cart:
- **Primary (anchor):** What the buyer came to buy. The item they searched for or browsed to. (Camera, MCB, Engine Oil, Plywood, Smartphone)
- **Companion:** Add-ons that belong alongside the anchor but aren't what the buyer's shopping for. (BNC Wire, Cable Lugs, Engine Filter, Nails, Phone Case)

Companions appear in nearly every order, so frequency-based bestsellers always surface them — wasting a discovery carousel slot on something the buyer already knows they need.

The fix is a category-level role flag — every product in a category inherits the role. Roles are **auto-classified from order behavior** (Phase 2 batch job). Distributor sees and can override them in Settings.

### New: `app.reco_category_profiles`

Auto-computed per `app.tenant_categories`. Populated by a Phase 2 batch job. No manual seeding required.

```sql
CREATE TABLE IF NOT EXISTS app.reco_category_profiles (
  tenant_id              uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tenant_category_id     uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  computed_role          text NOT NULL DEFAULT 'anchor'
    CHECK (computed_role IN ('anchor', 'companion', 'exclude')),
    -- anchor:    primary discovery products — appears in Bestsellers
    -- companion: accessory/add-on — appears only in "add to cart" suggestions, not Bestsellers
    -- exclude:   service line items (e.g. Installation Charges) — never surfaces in recommendations
  solo_order_rate        numeric(5,4),
    -- fraction of orders where this is the ONLY category present
    -- high solo rate → likely anchor (buyers sought it specifically)
  co_occurrence_breadth  int,
    -- count of distinct other categories this appears alongside
    -- very high breadth → likely companion (goes with everything)
  order_count_30d        int NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tenant_category_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_cat_profiles_tenant
  ON app.reco_category_profiles (tenant_id, computed_role);
```

**Classification logic (in the batch job):**
- `exclude`: category name matches service/charge patterns (configurable regex, e.g. `%charges%`, `%installation%`, `%amc%`) OR `order_count_30d = 0`
- `companion`: `solo_order_rate < 0.05` AND `co_occurrence_breadth > (median breadth for tenant * 1.5)` — i.e., almost never bought alone and co-occurs with a wide variety of other categories
- `anchor`: everything else

These thresholds are intentionally conservative — when uncertain, classify as `anchor` to avoid incorrectly suppressing a product from Bestsellers.

### New column on `app.tenant_categories`

Distributor override. `NULL` = use auto-computed role from `reco_category_profiles`.

```sql
ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS recommendation_role text
    CHECK (recommendation_role IN ('anchor', 'companion', 'exclude'));
  -- NULL = use reco_category_profiles.computed_role
  -- Non-null = distributor has explicitly set this; overrides auto-classification permanently
```

**Resolution order:**
1. `tenant_categories.recommendation_role` — distributor explicit override (wins always)
2. `reco_category_profiles.computed_role` — auto-learned from order behavior
3. Default `'anchor'` — safe fallback if category has no orders yet

The serving RPC resolves this via a simple COALESCE join. No pre-computation of the resolved value needed.

### Phase 2 widget improvement: W1 Bestsellers

Now filters `recommendation_role != 'companion' AND recommendation_role != 'exclude'` for global bestsellers. Category-page bestsellers allow companions when viewing a companion category.

### New: Bundle framework (optional)

#### `app.reco_bundles`

Tenant-defined (or auto-suggested and confirmed) bundles. A bundle is a named group of category roles that tends to appear together in an order. Generic concept — "4-Camera CCTV Kit" in security, "Full Room Wiring Kit" in electricals, "Engine Service Kit" in auto.

```sql
CREATE TABLE IF NOT EXISTS app.reco_bundles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  source        text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_suggested')),
    -- auto_suggested: proposed by the batch job, confirmed by distributor
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  UNIQUE (tenant_id, name)
);
```

#### `app.reco_bundle_slots`

Each slot defines one required component category in the bundle. "Complete Your Cart" checks which slots are covered by the buyer's current cart.

```sql
CREATE TABLE IF NOT EXISTS app.reco_bundle_slots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id            uuid NOT NULL REFERENCES app.reco_bundles(id) ON DELETE CASCADE,
  tenant_category_id   uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  slot_label           text,    -- optional display label, e.g. "Recorder", "Storage"
  is_required          boolean NOT NULL DEFAULT true,
  display_order        int NOT NULL DEFAULT 0,
  UNIQUE (bundle_id, tenant_category_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_bundle_slots_bundle
  ON app.reco_bundle_slots (bundle_id, display_order);
```

#### `app.reco_bundle_suggestions`

Auto-computed from Phase 1 data. Batch job identifies category clusters that co-occur in orders above a confidence threshold and writes candidate bundles here. Distributor reviews in Settings > Product Recommendations.

```sql
CREATE TABLE IF NOT EXISTS app.reco_bundle_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  suggested_name      text,
  category_ids        uuid[] NOT NULL,   -- tenant_category_ids in this cluster
  avg_co_occurrence   int NOT NULL,
  confidence_score    numeric(5,4) NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
    -- accepted: distributor clicked "Create bundle" — creates rows in reco_bundles + reco_bundle_slots
    -- rejected: distributor dismissed
  computed_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_reco_bundle_suggestions_tenant_status
  ON app.reco_bundle_suggestions (tenant_id, status, computed_at DESC);
```

### Phase 2 widget: W6 — Complete Your Cart

**Placement:** Cart page, persistent "You might be missing" section.  
**Mechanism:**
1. From buyer's cart, identify which `tenant_category_id`s are already covered.
2. Find the best matching bundle (most slot overlap with cart contents) from `reco_bundles` for this tenant.
3. For uncovered required slots, show the top product in that category from `reco_product_popularity`.
4. **If no bundles defined:** Fall back to `co_order` associations across cart items (already available from Phase 1). Show "people who bought these items also bought...". Nothing breaks.

**Cart gap runs client-side.** Bundle definitions + popularity data are fetched once on cart page mount and cached. Gap computation is pure JavaScript — no server call when cart contents change.

### Phase 2 batch additions

| Job function | Schedule | Writes to |
|---|---|---|
| `app.reco_compute_category_profiles(tenant_id)` | Weekly Sunday 1am | `reco_category_profiles` |
| `app.reco_compute_category_associations(tenant_id)` | Weekly Sunday 2am | `reco_category_associations` (new, see below) |
| `app.reco_suggest_bundles(tenant_id)` | Weekly Sunday 4am | `reco_bundle_suggestions` |

`reco_compute_category_profiles` runs first (Sunday 1am) because `reco_suggest_bundles` uses the computed roles to filter out companion/exclude categories when proposing bundle slots.

#### `app.reco_category_associations`

Category-level fallback when a product has too few orders for reliable SKU-level associations. Same structure as `reco_product_associations` but keyed to categories.

```sql
CREATE TABLE IF NOT EXISTS app.reco_category_associations (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  category_a_id       uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  category_b_id       uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  co_occurrence_count int NOT NULL DEFAULT 0,
  lift_score          numeric(10,6),
  confidence          numeric(10,6),
  time_window_days    int NOT NULL,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category_a_id, category_b_id, time_window_days)
);

CREATE INDEX IF NOT EXISTS idx_reco_cat_assoc_lookup
  ON app.reco_category_associations (tenant_id, category_a_id, time_window_days);
```

**Fallback hierarchy used by the serving RPC:**

```
Product-level co_order associations (lift > 2, count >= 3)
  → if insufficient: category_associations for product's category
  → if insufficient: bestsellers in same category (anchor role only)
  → if category also thin: tenant bestsellers globally
```

---

## 6. Phase 3 — Category Groups (deferred, safe to skip)

**What it unlocks:** Cross-category discovery within a semantic group. Example: viewing a DVR → recommend NVR/IP Cameras (different categories, same "IP surveillance" group). Without this, the fallback is "More from this Category" which misses cross-category associations.

**Why it's deferred:** Phase 1 + 2 cover 80% of the recommendation value. Category groups are a quality improvement, not table-stakes. They're also the most configuration-intensive part.

### Concept

A "category group" is a named cluster of related categories that a distributor uses to bundle their products conceptually. Examples:

| Industry | Group name | Member categories |
|---|---|---|
| CCTV / Security | Analog HD System | HD Camera, DVR, BNC Wire, SMPS |
| Electricals | Wiring Accessories | MCBs, Switches, Sockets, Cable Ducts |
| Auto Spares | Periodic Service | Engine Oil, Oil Filter, Air Filter, Spark Plug |
| Hardware | Door Fitting Kit | Hinges, Handles, Door Closers, Strike Plates |

### New tables

```sql
-- Named groups, configurable per tenant
-- A NULL tenant_id row is a platform default group (created by Yukti super-admin)
CREATE TABLE IF NOT EXISTS app.reco_category_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES app.tenants(id) ON DELETE CASCADE,
    -- NULL = platform-level default, visible to all tenants
  name         text NOT NULL,
  description  text,
  display_order int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Which categories belong to which group (per tenant)
ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS category_group_id uuid
    REFERENCES app.reco_category_groups(id) ON DELETE SET NULL;
```

**Phase 3 widget: W7 — More from this Group.** When viewing a product, shows top products from other categories in the same category group. Assigned at category level, inherited by all products in that category. Serving RPC join is simple: `tenant_categories WHERE category_group_id = $x`.

**Platform defaults.** Yukti super-admin pre-populates common group templates (e.g., "IP Camera System") in `reco_category_groups` with `tenant_id = NULL`. These are offered as suggestions in the distributor's Settings — distributor can adopt and map to their own `tenant_categories`, or define their own from scratch.

---

## 7. Client-Side Performance

The root cause of the previous system's sluggishness was re-fetching recommendations on every user action. Fix:

### One call per page

Product detail page makes **one RPC call** on mount, requesting all carousels in a single request. The RPC returns a JSON object keyed by widget type. No per-carousel fetches, no sequential calls.

```ts
// Product detail — one call, all carousels
const { data: recos } = useQuery({
  queryKey: ['reco', productId, tenantId, buyerId],
  queryFn: () => supabase.schema('app').rpc('reco_get_product_page', {
    p_tenant_product_id: productId,
    p_buyer_id: buyerId ?? null,
    p_widget_types: ['co_order', 'co_buyer', 'same_category'],
    p_limit: 8
  }),
  staleTime: 10 * 60 * 1000,  // 10 minutes — never refetch mid-session
  gcTime:   30 * 60 * 1000,
})
```

### Cart gap is pure client-side

```ts
// App init: fetch bundle definitions + top products per category
// These are tiny payloads, cached for the session
const bundles = usePrefetchedBundles(tenantId)

// On cart change (debounced 300ms): pure JS
function getCartGap(cartProducts, bundles) {
  if (!bundles.length) return []  // no bundles defined — skip widget
  const bestBundle = findBestMatchingBundle(cartProducts, bundles)
  if (!bestBundle) return []
  const coveredCategoryIds = new Set(cartProducts.map(p => p.tenant_category_id))
  return bestBundle.slots
    .filter(slot => slot.is_required && !coveredCategoryIds.has(slot.tenant_category_id))
    .map(slot => ({ slot, topProduct: slot.top_product }))
}
```

Zero network calls when cart changes. No carousel reloads.

### React Query stale times

| Page | staleTime | Reasoning |
|---|---|---|
| Product detail recos | 10 min | Pre-computed weekly — data doesn't change mid-session |
| Home bestsellers | 5 min | Updated daily — no need to refresh intra-session |
| Buy Again | 1 session | Personal to buyer, fetched once |
| Bundle definitions (cart) | 30 min | Rarely changes, prefetch at app init |

---

## 8. Settings UI — Product Recommendations

Accessible in the distributor cockpit at Settings > Product Recommendations.

### Phase 1 settings
- **Min co-occurrence threshold** — default 3, configurable per tenant (stored in `app.tenants.settings.reco_min_support`)
- No other setup required

### Phase 2 settings
- **Category roles** — table view of `tenant_categories` showing each category's resolved role (`anchor` / `companion` / `exclude`). The auto-learned value is shown with a "Auto" badge. Distributor can override any row — the override is written to `tenant_categories.recommendation_role` and immediately wins over auto-classification. Overrides persist across batch job reruns (batch job never overwrites the manual column).
- **Bundle suggestions** — inbox of auto-suggested bundles from `reco_bundle_suggestions WHERE status = 'pending'`. Each card shows the category cluster and co-occurrence basis. Distributor clicks "Create Bundle" (auto-populates `reco_bundles` + `reco_bundle_slots`) or "Dismiss".
- **Bundle editor** — manual create/edit bundles. Add name, select which categories are slots, mark required/optional.

### Phase 3 settings
- **Category groups** — assign categories to named groups. Platform-suggested groups shown. Distributor can adopt, rename, or build from scratch.

---

## 9. PostHog Instrumentation

Track from Phase 1 day one. Minimal events:

```ts
// Widget rendered with results
posthog.capture('reco_widget_shown', {
  widget: 'co_order',       // or 'co_buyer', 'bestsellers', 'buy_again', etc.
  product_id: productId,
  result_count: results.length,
  tenant_id: tenantId,
})

// Buyer adds to cart from a recommendation
posthog.capture('reco_add_to_cart', {
  widget: 'co_order',
  source_product_id: productId,
  added_product_id: addedId,
  tenant_id: tenantId,
})

// Cart gap widget: buyer adds a suggested gap product
posthog.capture('reco_cart_gap_add', {
  bundle_name: bundleName,
  slot_category: categoryName,
  added_product_id: addedId,
  tenant_id: tenantId,
})
```

Primary metric: **recommendation attach rate** = `reco_add_to_cart` / product detail views. Target: >10% within 60 days of Phase 1 launch.

---

## 10. Build Sequence Summary

### Phase 1 — Ship in ~1 sprint, works on order data alone

- [ ] Create `app.reco_product_associations`
- [ ] Create `app.reco_product_popularity`
- [ ] Create `app.reco_buyer_profiles`
- [ ] RLS on all three tables (service_role write, JWT tenant read)
- [ ] `app.reco_compute_popularity(tenant_id)` function + daily pg_cron
- [ ] `app.reco_compute_associations(tenant_id, window)` function + weekly pg_cron
- [ ] `app.reco_refresh_buyer_profiles(tenant_id)` function + weekly pg_cron
- [ ] `app.reco_get_product_page()` RPC
- [ ] `app.reco_get_home()` RPC
- [ ] `app.reco_get_bestsellers()` RPC
- [ ] Buyer app: React Query setup + stale times
- [ ] Widgets: W1 Bestsellers, W2 FBT, W3 People Also Bought, W4 Buy Again, W5 More from Category
- [ ] PostHog events for all 5 widgets

**Value delivered: professional recommendation carousels, buy again for repeat buyers, frequently bought together on product detail — with zero tenant setup.**

---

### Phase 2 — Ship in 1–2 sprints, builds on Phase 1

- [ ] `app.reco_category_profiles` (auto-computed per tenant_category)
- [ ] `app.reco_compute_category_profiles(tenant_id)` batch function + weekly pg_cron (Sunday 1am)
- [ ] `ALTER TABLE app.tenant_categories ADD COLUMN recommendation_role` (distributor override)
- [ ] Settings UI: category roles table showing auto-learned role + distributor override toggle
- [ ] Update `reco_get_bestsellers` to filter by role
- [ ] `app.reco_category_associations` + weekly job
- [ ] `app.reco_bundles` + `app.reco_bundle_slots`
- [ ] `app.reco_bundle_suggestions` + `app.reco_suggest_bundles()` weekly job
- [ ] Settings UI: bundle suggestions inbox + bundle editor
- [ ] Buyer app: cart bundle prefetch + client-side gap computation
- [ ] Widget W6: Complete Your Cart (with graceful no-op if no bundles)
- [ ] PostHog event for cart gap adds

**Value delivered: cleaner bestsellers (no accessory pollution), cart gap widget for distributors who define bundles, auto-suggested bundles from order data.**

---

### Phase 3 — Ship when the above are stable (defer freely)

- [ ] `app.reco_category_groups` (platform defaults + tenant-specific)
- [ ] `ALTER TABLE app.tenant_categories ADD COLUMN category_group_id`
- [ ] Settings UI: category group assignment
- [ ] Widget W7: More from this Group (cross-category within semantic cluster)
- [ ] Update association computation to include group-level signal
- [ ] Platform defaults populated by Yukti super-admin for common industries

**Value delivered: cross-category discovery for industries where semantic grouping matters (CCTV, auto, electrical). No impact on tenants who don't configure groups.**

---

## 11. What to Defer Beyond Phase 3

| Feature | Why |
|---|---|
| Real-time ML / collaborative filtering | Pre-computed statistical lift covers B2B repeat-buyer patterns well. ML adds ops overhead without clear uplift at this stage. |
| Personalised ranking per buyer | Useful, but requires more data. Phase 1 Buy Again covers the high-ROI part of personalization. |
| Cross-tenant signal aggregation | Never. Strict tenant isolation is non-negotiable. |
| A/B testing widget placement | Requires PostHog experiments + sufficient traffic. Instrument events first (Phase 1), run experiments later. |
| Recommendation analytics dashboard | Build after 60 days of events accumulate in PostHog. |
