import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';

type OrderStatus = 'draft' | 'received' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled';
type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';

interface BuyerRow {
  id: string;
  business_name: string;
  geography: Record<string, unknown> | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  buyer_id: string;
  status: OrderStatus;
  total_amount: number;
  placed_at: string;
  created_at: string;
}

interface OrderItemRow {
  order_id: string;
}

const ORDERS_LANDING_CACHE_TTL_MS = 20_000;
const ordersLandingCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getHue(index: number): AvatarHue {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getIstBoundaries(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();
  const day = istNow.getDate();

  const mtdStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const prevMonthSameDayExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  return {
    mtdStartIso: mtdStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    prevMonthStartIso: prevMonthStart.toISOString(),
    prevMonthMtdEndIso: prevMonthSameDayExclusive.toISOString(),
  };
}

function statusMeta(status: OrderStatus): { label: string; tone: StatusTone; filterChip: string } {
  if (status === 'confirmed') return { label: 'Confirmed', tone: 'warning', filterChip: 'Confirmed' };
  if (status === 'dispatched' || status === 'partially_dispatched') {
    return { label: 'In transit', tone: 'neutral', filterChip: 'In transit' };
  }
  if (status === 'delivered') return { label: 'Delivered', tone: 'success', filterChip: 'Delivered' };
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'danger', filterChip: 'Cancelled' };
  if (status === 'received') return { label: 'On hold', tone: 'danger', filterChip: 'Hold' };
  return { label: 'Draft', tone: 'neutral', filterChip: 'All' };
}

function getCity(geography: Record<string, unknown> | null): string {
  if (!geography) return 'Unknown city';
  const city = geography.city;
  if (typeof city === 'string' && city.trim().length > 0) return city;
  return 'Unknown city';
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('orders_api'));
    return response;
  };
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const { mtdStartIso, nextMonthStartIso, prevMonthStartIso, prevMonthMtdEndIso } = getIstBoundaries();

    const db = supabaseAdmin;

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '200'), 500);
    const cacheKey = [
      tenantId,
      limit,
      mtdStartIso.slice(0, 10),
      nextMonthStartIso.slice(0, 10),
      prevMonthStartIso.slice(0, 10),
      prevMonthMtdEndIso.slice(0, 10),
    ].join(':');

    const cached = ordersLandingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return timedJson(cached.payload);
    }

    const [buyersRes, mtdOrdersRes, prevOrdersRes, kpiCurrentRes, kpiPrevRes] = await Promise.all([
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('orders')
        .select('id, order_number, buyer_id, status, total_amount, placed_at, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('placed_at', mtdStartIso)
        .lt('placed_at', nextMonthStartIso)
        .order('placed_at', { ascending: false })
        .limit(limit),
      db
        .schema('app')
        .from('orders')
        .select('id, total_amount')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('placed_at', prevMonthStartIso)
        .lt('placed_at', prevMonthMtdEndIso),
      db
        .schema('app')
        .from('kpi_tenant_daily')
        .select('orders_count, buyers_count, gmv')
        .eq('tenant_id', tenantId)
        .gte('day', mtdStartIso.slice(0, 10))
        .lt('day', nextMonthStartIso.slice(0, 10))
        .is('deleted_at', null),
      db
        .schema('app')
        .from('kpi_tenant_daily')
        .select('orders_count, gmv')
        .eq('tenant_id', tenantId)
        .gte('day', prevMonthStartIso.slice(0, 10))
        .lt('day', prevMonthMtdEndIso.slice(0, 10))
        .is('deleted_at', null),
    ]);

    if (buyersRes.error || mtdOrdersRes.error || prevOrdersRes.error) {
      console.error('[GET /api/tenant/orders] query error:', buyersRes.error || mtdOrdersRes.error || prevOrdersRes.error);
      return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const buyers = (buyersRes.data ?? []) as BuyerRow[];
    const mtdOrders = (mtdOrdersRes.data ?? []) as OrderRow[];
    const prevOrders = (prevOrdersRes.data ?? []) as Array<{ id: string; total_amount: number }>;

    const orderIds = mtdOrders.map((order) => order.id);
    let orderItems: OrderItemRow[] = [];

    if (orderIds.length > 0) {
      const orderItemsRes = await db
        .schema('app')
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds)
        .is('deleted_at', null);

      if (orderItemsRes.error) {
        console.error('[GET /api/tenant/orders] order_items error:', orderItemsRes.error);
        return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
      }

      orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
    }

    const buyerById = new Map<string, BuyerRow>();
    for (const buyer of buyers) {
      buyerById.set(buyer.id, buyer);
    }

    const itemsCountByOrder = new Map<string, number>();
    for (const item of orderItems) {
      itemsCountByOrder.set(item.order_id, (itemsCountByOrder.get(item.order_id) ?? 0) + 1);
    }

    const buyersMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.buyers_count ?? 0), 0)
      || new Set(mtdOrders.map((order) => order.buyer_id)).size;
    const ordersMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0)
      || mtdOrders.length;
    const ordersPrevMtd = (kpiPrevRes.data ?? []).reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0)
      || prevOrders.length;
    const gmvMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.gmv ?? 0), 0)
      || mtdOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const gmvPrevMtd = (kpiPrevRes.data ?? []).reduce((sum, row) => sum + Number(row.gmv ?? 0), 0)
      || prevOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const ordersGrowthPct = ordersPrevMtd > 0 ? Math.round(((ordersMtd - ordersPrevMtd) / ordersPrevMtd) * 100) : 0;
    const aov = gmvMtd / ordersMtd;

    const pendingDispatchCount = mtdOrders.filter((order) => order.status === 'confirmed').length;
    const onHoldCount = mtdOrders.filter((order) => order.status === 'received').length;
    const deliveredCount = mtdOrders.filter((order) => order.status === 'delivered').length;

    const rows = mtdOrders.map((order, index) => {
      const buyer = buyerById.get(order.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const city = getCity((buyer?.geography ?? null) as Record<string, unknown> | null);
      const meta = statusMeta(order.status);

      return {
        id: order.id,
        order_id: order.order_number,
        buyer_id: order.buyer_id,
        buyer_name: buyerName,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        delivery_city: city,
        delivery_label: city,
        items_count: itemsCountByOrder.get(order.id) ?? 0,
        gmv: Number(order.total_amount ?? 0),
        status: {
          value: order.status,
          label: meta.label,
          tone: meta.tone,
          filter_chip: meta.filterChip,
        },
        placed_at: order.placed_at,
      };
    });

    const needsAttention = rows.filter((row) => row.status.tone === 'warning' || row.status.tone === 'danger').slice(0, 3);
    const biggestTickets = [...rows].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
    const inMotion = rows.filter((row) => row.status.value === 'dispatched').slice(0, 2);

    const payload = {
      period: {
        timezone: 'Asia/Kolkata',
        current_month_start: formatDateKey(new Date(mtdStartIso)),
        current_month_end_exclusive: formatDateKey(new Date(nextMonthStartIso)),
        previous_mtd_start: formatDateKey(new Date(prevMonthStartIso)),
        previous_mtd_end_exclusive: formatDateKey(new Date(prevMonthMtdEndIso)),
      },
      kpis: {
        orders_mtd: ordersMtd,
        orders_prev_mtd: ordersPrevMtd,
        orders_growth_pct: ordersGrowthPct,
        gmv_mtd: gmvMtd,
        gmv_prev_mtd: gmvPrevMtd,
        aov,
        pending_dispatch_count: pendingDispatchCount,
        on_hold_count: onHoldCount,
        delivered_count: deliveredCount,
        buyers_mtd: buyersMtd,
      },
      todays_read: {
        needs_attention: needsAttention,
        biggest_tickets: biggestTickets,
        in_motion: inMotion,
      },
      orders: rows,
    };

    ordersLandingCache.set(cacheKey, {
      expiresAt: Date.now() + ORDERS_LANDING_CACHE_TTL_MS,
      payload,
    });

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/orders] unexpected error:', error);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}
