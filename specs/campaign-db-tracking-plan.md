# Campaign DB Tracking — Implementation Plan (Compromise)

## Scope

Postgres owns seller campaign insights. PostHog remains available for behavioral analytics later.

### In scope

| Layer | What |
|-------|------|
| **Opens** | `app.campaign_views` — one row per buyer + campaign + UTC day (`view_date` unique) |
| **Attribution** | `orders.campaign_id`, `estimates.campaign_id` set at cart submit |
| **Seller KPIs** | Views → Conversions funnel (2-step); GMV and counts combine orders + estimates |
| **Dedup** | Estimates with `converted_to_order_id` are excluded from conversion count |

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

## API changes

| Route | Change |
|-------|--------|
| `GET /api/buyer/catalog` | Record view |
| `GET /api/buyer/catalog/[share_token]` | Record view (auth buyers) |
| Buyer cart submit | Pass `campaign_id` on orders + estimates |
| `GET /api/tenant/catalogs` | Real views + combined conversions/GMV |
| `GET /api/tenant/catalogs/[id]` | Remove PostHog HogQL; Postgres-only metrics |
| `GET /api/tenant/customers/[id]` | Query `campaign_views` |

## Seller UI

- Funnel: **Views → Conversions** (no cart tile)
- Buyer status: `Converted` | `Opened` | `Not yet` (was `Purchased`)
- Labels: "conversions" not orders-only where combined metric is shown

## Migration

`supabase/migrations/20260706105053_rename_catalog_views_to_campaign_views.sql`

## Verification

- `src/tests/lib/campaign-performance.test.ts` — dedup + rollup unit tests
- Customer detail mocks use `app.campaign_views`
- Manual: open campaign in buyer app → row in `campaign_views`; place order/estimate → attributed GMV on seller detail
