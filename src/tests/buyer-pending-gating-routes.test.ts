import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const GUEST_PRICING = { mode: 'base_selling_rate', priceListId: null, excludedProductIds: [] };

const mocks = vi.hoisted(() => ({
  requireBuyerAccessProfile: vi.fn(),
  getVisibleBuyerCatalogs: vi.fn(),
  loadLivePublicCatalog: vi.fn(),
  resolveGuestPricingContext: vi.fn(),
  getCachedGuestPricingContext: vi.fn(),
  enrichBuyerProducts: vi.fn(),
  assemble: vi.fn(),
  resolveAllowedBrands: vi.fn(),
  recordCampaignView: vi.fn(),
  loadBuyerHomePromotions: vi.fn(),
  loadBuyerActivityFeed: vi.fn(),
  recordActivity: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: mocks.requireBuyerAccessProfile,
  getVisibleBuyerCatalogs: mocks.getVisibleBuyerCatalogs,
}));
vi.mock('@/lib/server/public-catalog', () => ({
  loadLivePublicCatalog: mocks.loadLivePublicCatalog,
  resolveGuestPricingContext: mocks.resolveGuestPricingContext,
  getCachedGuestPricingContext: mocks.getCachedGuestPricingContext,
}));
vi.mock('@/lib/server/buyer-product-data', () => ({ enrichBuyerProducts: mocks.enrichBuyerProducts }));
vi.mock('@/lib/server/buyer-assemble-catalog-items', () => ({ assembleBuyerCatalogItemsForProductIds: mocks.assemble }));
vi.mock('@/lib/server/buyer-brand-visibility', () => ({ resolveBuyerAllowedTenantBrandIds: mocks.resolveAllowedBrands }));
vi.mock('@/lib/server/campaign-engagement', () => ({ recordCampaignView: mocks.recordCampaignView }));
vi.mock('@/lib/server/buyer-home-promotions', () => ({ loadBuyerHomePromotions: mocks.loadBuyerHomePromotions }));
vi.mock('@/lib/server/buyer-activity', () => ({ loadBuyerActivityFeed: mocks.loadBuyerActivityFeed }));
vi.mock('@/lib/server/buyer-app-activity', () => ({ recordBuyerAppActivitySafe: mocks.recordActivity }));
vi.mock('@/lib/server/buyer-location-selection', () => ({ getSelectedBuyerDeliveryFromRequest: () => null }));
vi.mock('@/lib/server/buyer-routing', () => ({ resolveNearestBuyerLocation: async () => null }));
vi.mock('@/lib/server/buyer-home-metrics', () => ({ emptyBuyerHomeMetricsV4: () => ({ empty: true }) }));

// Chainable thenable query builder: every method returns the chain; awaiting / maybeSingle resolve `result`.
function chain(result: unknown): unknown {
  const c: any = new Proxy(() => undefined, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      if (prop === 'maybeSingle') return () => Promise.resolve(result);
      return () => c;
    },
  });
  return c;
}
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      rpc: mocks.rpc,
      from: (table: string) => chain(table === 'campaigns'
        ? { data: { id: 'camp-1', name: 'Diwali', message: null, tenant_id: 'tenant-1', status: 'published', valid_to: null, hero_image_url: null }, error: null }
        : { data: table === 'campaign_items' ? [{ tenant_product_id: 'p1', price_override: 5, display_order: 0, is_featured: false }] : [], error: null }),
    }),
  },
  supabase: null,
}));

import { GET as shareTokenGET } from '../../app/api/buyer/catalog/[share_token]/route';
import { GET as recoBrandGET } from '../../app/api/buyer/reco/brand/[id]/route';
import { GET as recoCategoryGET } from '../../app/api/buyer/reco/category/[id]/route';
import { GET as cartBundlesGET } from '../../app/api/buyer/reco/cart-bundles/route';
import { GET as catalogsGET } from '../../app/api/buyer/catalogs/route';
import { GET as promotionsGET } from '../../app/api/buyer/home/promotions/route';
import { GET as searchGET } from '../../app/api/buyer/search/route';
import { GET as metricsGET } from '../../app/api/buyer/home/metrics/route';
import { GET as activityGET } from '../../app/api/buyer/activity/route';

const req = (path: string) => new NextRequest(`http://localhost${path}`);
const idParams = { params: Promise.resolve({ id: 'x1' }) };

type Caller = 'pending_public' | 'pending_approved_only' | 'disabled_admin' | 'approved';

function profileFor(caller: Caller) {
  const base = {
    context: { tenant_id: 'tenant-1', buyer_id: 'buyer-1', mode: 'buyer', role: 'buyer_admin' },
    buyer: { id: 'buyer-1', buyer_app_enabled: true },
  };
  if (caller === 'approved') return base;
  if (caller === 'disabled_admin') return { ...base, buyer: { id: 'buyer-1', buyer_app_enabled: false } };
  return { context: { ...base.context, role: 'buyer_pending' }, buyer: { id: 'buyer-1', buyer_app_enabled: false } };
}

interface RouteCase {
  name: string;
  call: () => Promise<Response>;
  /** What a pending caller gets when public browsing is NOT allowed. */
  blocked: 'forbidden' | 'empty';
  /** Pending caller on public_link: no buyer-scoped path used. */
  assertGuestOnly: () => void;
  /** Approved control: buyer-scoped path used. */
  assertBuyerScoped: () => void;
  /** Blocked pending caller: no buyer data was even loaded. */
  assertNoBuyerData: () => void;
}

const lastArg = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

const CASES: RouteCase[] = [
  {
    name: 'catalog/[share_token]',
    call: () => shareTokenGET(req('/api/buyer/catalog/tok'), { params: Promise.resolve({ share_token: 'tok' }) }) as any,
    blocked: 'forbidden',
    assertGuestOnly: () => {
      expect(mocks.enrichBuyerProducts.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: null, guestPricing: GUEST_PRICING });
      expect(mocks.recordCampaignView).not.toHaveBeenCalled();
    },
    assertBuyerScoped: () => {
      expect(mocks.enrichBuyerProducts.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: 'buyer-1' });
      expect(mocks.recordCampaignView).toHaveBeenCalled();
    },
    assertNoBuyerData: () => {
      expect(mocks.enrichBuyerProducts).not.toHaveBeenCalled();
      expect(mocks.recordCampaignView).not.toHaveBeenCalled();
    },
  },
  {
    name: 'reco/brand/[id]',
    call: () => recoBrandGET(req('/api/buyer/reco/brand/x1'), idParams) as any,
    blocked: 'forbidden',
    assertGuestOnly: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: null, guestPricing: GUEST_PRICING }),
    assertBuyerScoped: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: 'buyer-1' }),
    assertNoBuyerData: () => expect(mocks.assemble).not.toHaveBeenCalled(),
  },
  {
    name: 'reco/category/[id]',
    call: () => recoCategoryGET(req('/api/buyer/reco/category/x1'), idParams) as any,
    blocked: 'forbidden',
    assertGuestOnly: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: null, guestPricing: GUEST_PRICING }),
    assertBuyerScoped: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: 'buyer-1' }),
    assertNoBuyerData: () => expect(mocks.assemble).not.toHaveBeenCalled(),
  },
  {
    name: 'reco/cart-bundles',
    call: () => cartBundlesGET(req('/api/buyer/reco/cart-bundles')) as any,
    blocked: 'forbidden',
    assertGuestOnly: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: null, guestPricing: GUEST_PRICING }),
    assertBuyerScoped: () => expect(mocks.assemble.mock.calls.at(-1)?.[1]).toMatchObject({ buyerId: 'buyer-1' }),
    assertNoBuyerData: () => expect(mocks.assemble).not.toHaveBeenCalled(),
  },
  {
    name: 'catalogs',
    call: () => catalogsGET(req('/api/buyer/catalogs')) as any,
    blocked: 'empty',
    // Pending sessions never get the buyer-scoped list, even when public browsing is allowed.
    assertGuestOnly: () => expect(mocks.getVisibleBuyerCatalogs).not.toHaveBeenCalled(),
    assertBuyerScoped: () => expect(mocks.getVisibleBuyerCatalogs).toHaveBeenCalledWith('tenant-1', 'buyer-1'),
    assertNoBuyerData: () => expect(mocks.getVisibleBuyerCatalogs).not.toHaveBeenCalled(),
  },
  {
    name: 'home/promotions',
    call: () => promotionsGET(req('/api/buyer/home/promotions')) as any,
    blocked: 'empty',
    assertGuestOnly: () => expect(mocks.loadBuyerHomePromotions).not.toHaveBeenCalled(),
    assertBuyerScoped: () => expect(mocks.loadBuyerHomePromotions).toHaveBeenCalled(),
    assertNoBuyerData: () => expect(mocks.loadBuyerHomePromotions).not.toHaveBeenCalled(),
  },
  {
    name: 'search (catalog scope)',
    call: () => searchGET(req('/api/buyer/search?q=cam')) as any,
    blocked: 'forbidden',
    assertGuestOnly: () => expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_buyer_id: null }),
    assertBuyerScoped: () => expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_buyer_id: 'buyer-1' }),
    assertNoBuyerData: () => expect(mocks.rpc).not.toHaveBeenCalled(),
  },
  {
    name: 'home/metrics',
    call: () => metricsGET(req('/api/buyer/home/metrics')) as any,
    blocked: 'empty',
    assertGuestOnly: () => expect(mocks.rpc).not.toHaveBeenCalled(),
    assertBuyerScoped: () => expect(mocks.rpc).toHaveBeenCalledWith('get_buyer_home_metrics_v4', expect.objectContaining({ p_buyer_id: 'buyer-1' })),
    assertNoBuyerData: () => expect(mocks.rpc).not.toHaveBeenCalled(),
  },
  {
    name: 'activity',
    call: () => activityGET(req('/api/buyer/activity')) as any,
    blocked: 'empty',
    assertGuestOnly: () => expect(mocks.loadBuyerActivityFeed).not.toHaveBeenCalled(),
    assertBuyerScoped: () => expect(mocks.loadBuyerActivityFeed).toHaveBeenCalled(),
    assertNoBuyerData: () => expect(mocks.loadBuyerActivityFeed).not.toHaveBeenCalled(),
  },
];

describe.each(CASES)('pending buyer gating: $name', (route) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveGuestPricingContext.mockResolvedValue(GUEST_PRICING);
    mocks.getCachedGuestPricingContext.mockResolvedValue(GUEST_PRICING);
    mocks.resolveAllowedBrands.mockResolvedValue(null);
    mocks.enrichBuyerProducts.mockResolvedValue(new Map());
    mocks.assemble.mockResolvedValue(new Map());
    mocks.getVisibleBuyerCatalogs.mockResolvedValue([]);
    mocks.loadBuyerHomePromotions.mockResolvedValue({ latest_promotions_preview: [{ id: 'c' }] });
    mocks.loadBuyerActivityFeed.mockResolvedValue({ items: [{ id: 'a' }], next_cursor: null });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'reco_get_cart_bundles') {
        return { data: { bundles: [{ id: 'b', name: 'B', slots: [{ tenant_category_id: 'c', top_product_ids: ['p1'] }] }] }, error: null };
      }
      if (name.startsWith('reco_get_')) return { data: [{ tenant_product_id: 'p1' }], error: null };
      return { data: [], error: null };
    });
  });

  it('approved buyer (control) keeps buyer-scoped data', async () => {
    mocks.requireBuyerAccessProfile.mockResolvedValue(profileFor('approved'));
    mocks.loadLivePublicCatalog.mockResolvedValue({ accessMode: 'approved_buyers_only' });
    const res = await route.call();
    expect(res.status).toBe(200);
    route.assertBuyerScoped();
  });

  it.each(['pending_approved_only', 'disabled_admin'] as const)(
    '%s never reaches buyer-scoped data when public browsing is off',
    async (caller) => {
      mocks.requireBuyerAccessProfile.mockResolvedValue(profileFor(caller));
      mocks.loadLivePublicCatalog.mockResolvedValue({ accessMode: 'approved_buyers_only' });
      const res = await route.call();
      if (route.blocked === 'forbidden') {
        expect(res.status).toBe(403);
        expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await res.json()).toEqual({ error: 'Approval required' });
      } else {
        expect(res.status).toBe(200);
        const body = JSON.stringify(await res.json());
        expect(body).not.toContain('"id":"c"');
        expect(body).not.toContain('"id":"a"');
      }
      route.assertNoBuyerData();
    },
  );

  it.each(['pending_public', 'disabled_admin'] as const)('%s on public_link gets guest-only data', async (caller) => {
    mocks.requireBuyerAccessProfile.mockResolvedValue(profileFor(caller));
    mocks.loadLivePublicCatalog.mockResolvedValue({ accessMode: 'public_link' });
    const res = await route.call();
    expect(res.status).toBe(200);
    route.assertGuestOnly();
  });
});

describe('catalog/[share_token] tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveGuestPricingContext.mockResolvedValue(GUEST_PRICING);
    mocks.getCachedGuestPricingContext.mockResolvedValue(GUEST_PRICING);
    mocks.enrichBuyerProducts.mockResolvedValue(new Map());
    mocks.loadLivePublicCatalog.mockResolvedValue({ accessMode: 'public_link' });
  });

  it('approved buyer of another tenant gets 404 and no pricing is resolved', async () => {
    const other = profileFor('approved') as any;
    other.context = { ...other.context, tenant_id: 'tenant-other' };
    mocks.requireBuyerAccessProfile.mockResolvedValue(other);
    const res = await shareTokenGET(req('/api/buyer/catalog/tok'), { params: Promise.resolve({ share_token: 'tok' }) }) as any;
    expect(res.status).toBe(404);
    expect(mocks.enrichBuyerProducts).not.toHaveBeenCalled();
    expect(mocks.recordCampaignView).not.toHaveBeenCalled();
  });

  it('approved buyer of the same tenant is unaffected', async () => {
    mocks.requireBuyerAccessProfile.mockResolvedValue(profileFor('approved'));
    const res = await shareTokenGET(req('/api/buyer/catalog/tok'), { params: Promise.resolve({ share_token: 'tok' }) }) as any;
    expect(res.status).toBe(200);
  });
});
