# Campaign DB Tracking — Implementation Plan (Compromise)

## Scope

Postgres owns seller campaign insights. PostHog remains available for behavioral analytics later.

### In scope

| Layer | What |
|-------|------|
| **Opens** | `app.campaign_views` — one row per buyer + campaign + UTC day (`view_date` unique) |
| **Attribution** | `orders.campaign_id`, `estimates.campaign_id` set at cart submit |
| **Seller KPIs** | Views → Conversions funnel (2-step); GMV and counts combine orders + estimates |
| **Dedup** | Estimates with `converted_to_order_id` are excluded from conversion count and GMV |

### Out of scope (this pass)

- `campaign_cart_events` / `campaign_cart_stats`
- PostHog capture changes for `catalog_viewed` / cart events
- Cart-middle funnel step in seller UI

## Data model

```sql
-- Renamed from catalog_views
app.campaign_views (
  tenant_id, buyer_id, campaign_id, viewed_at, view_date, source, ...
  UNIQUE (tenant_id, buyer_id, campaign_id, view_date)
)
```

## Recording opens

Server-side on authenticated catalog GET when:

- `offset === 0` and buyer has selected campaign (`buyer_app`), or
- share-token catalog GET with logged-in buyer (`guest_link`)

Helper: `recordCampaignView()` in `src/lib/server/campaign-engagement.ts`

## Conversion rules

```ts
// Orders: status !== 'cancelled'
// Estimates: status not in (pending, void) AND converted_to_order_id IS NULL
```

Pure helpers: `src/lib/server/campaign-performance.ts`

### Campaign inference (cart submit)

`inferCampaignIdForBuyerCart()` in `src/lib/server/campaign-attribution.ts`:

1. Use client `campaign_id` when provided (buyer was browsing a campaign).
2. Else match campaigns where **at least one** cart SKU appears in `campaign_items` (mixed carts allowed).
3. Restrict to buyer-visible campaigns.
4. If one match → use it. If multiple → pick campaign with **highest SKU overlap**; tie → `null`.

Header `campaign_id` marks buyer as **Converted** for that campaign. GMV does not use header `total_amount`.

### Attributed GMV (seller metrics)

GMV and conversion counts use **line items intersecting `campaign_items`** for the campaign:

- Mixed carts: only campaign SKUs count toward campaign GMV.
- Converted estimates: excluded; attributed GMV comes from the resulting order’s campaign line items only.
- Orders + open estimates are summed for conversion count (with dedup above).

Helpers: `computeCampaignAttributedMetrics()`, `buildCatalogAttributedMetrics()`.

### Tenant channel flags

Seller metrics respect `create_enquiries` / `create_sales_orders` from tenant settings:

- Estimates-only tenant: enquiry conversions/GMV only; UI labels say “enquiries”.
- Orders-only tenant: order conversions/GMV only.
- Both enabled: combined conversions with breakdown in performance tab.

## API changes

| Route | Change |
|-------|--------|
| `GET /api/buyer/catalog` | Record view |
| `GET /api/buyer/catalog/[share_token]` | Record view (auth buyers) |
| Buyer cart submit | Pass `campaign_id` on orders + estimates; infer when missing |
| `GET /api/tenant/catalogs` | Line-item attributed GMV + conversions per campaign |
| `GET /api/tenant/catalogs/[id]` | Attributed GMV; `performance.channels` flags |
| `GET /api/tenant/customers/[id]` | Query `campaign_views` |

## Seller UI

- Funnel: **Views → Conversions** (no cart tile)
- Buyer status: `Converted` | `Opened` | `Not yet` (was `Purchased`)
- Labels adapt to enabled channels: conversions / enquiries / orders
- Performance tab shows enquiry vs order breakdown when both channels are on

## Migration

`supabase/migrations/20260706105053_rename_catalog_views_to_campaign_views.sql`

## Verification

- `src/tests/lib/campaign-performance.test.ts` — attributed GMV, dedup, channel flags
- `src/tests/lib/campaign-attribution.test.ts` — partial overlap inference
- Customer detail mocks use `app.campaign_views`
- Manual: open campaign in buyer app → row in `campaign_views`; mixed-cart estimate → `campaign_id` set; seller GMV = campaign lines only
