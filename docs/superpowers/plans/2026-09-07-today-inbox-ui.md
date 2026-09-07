# Today (Inbox) UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the seller-side "Today" screen (split-pane inbox: date-grouped, customer-grouped entries with filters, expandable detail cards, history, confirmations) against the entries backend that already exists on this branch.

**Architecture:** Reuse the existing `EntitySplitShell` list/detail split pattern (same as `/customers`). List data comes from the real `GET /api/tenant/entries` endpoint; generic lifecycle actions (`remind_later`, `add_note`, `dismiss`, `reopen`) POST to the existing `/api/tenant/entries/[id]/actions` endpoint; type-specific business actions (approve, accept order, send reminder, etc.) are simulated in local React state only, since the backend doesn't implement them yet. One new backend surface is added: a history endpoint reading `app.entry_events` for a buyer.

**Tech Stack:** Next.js App Router, TanStack Query, Zod, Tailwind, shadcn/ui primitives (`sheet`, `alert-dialog`, `accordion`, `badge`), Supabase (Postgres RPC + RLS), Vitest + Testing Library.

## Global Constraints

- Schema-qualify every SQL statement and Supabase client call (`.schema('app')`) — see root `CLAUDE.md`.
- Migration files only via `supabase migration new <name>` (never hand-name the file) — see project `.claude/CLAUDE.md`.
- Every buyer-facing API GET route sets `Cache-Control: private` via `src/lib/server/buyer-cache-headers.ts` / the existing `SELLER_CACHE_PERSONAL` header helper — never `public`/`s-maxage`.
- TanStack Query: use the tiers in `src/lib/query-navigation.ts` (never a raw hardcoded ms value); every filtered/paginated hook sets `placeholderData: keepPreviousData`.
- Never trust client-supplied `tenant_id`/`location_id` — every route re-derives from verified JWT claims (`getVerifiedClaims`) and re-checks location scope server-side.
- Forms/dialogs use `header`/`body`/`footer` spacing per project `CLAUDE.md` — use the shared dialog primitives, not hand-rolled spacing.
- SPA navigation only (`next/link`, `router.push`) — no raw `<a href>` for in-app routes.
- Copy follows product spec §4: calm, factual, no guilt/urgency language, no streaks.
- Images (if any) use `next/image` — not applicable to this plan (no new images).
- No new PostHog flag this pass (explicit scope decision, see design doc §11).

---

## File Structure

**Backend (new):**
- `supabase/migrations/<generated>_inbox_entry_events_history.sql` — `app.list_entry_events_for_buyer` RPC
- `app/api/tenant/entries/buyer/[buyerId]/events/route.ts` — GET history for a buyer
- `app/api/tenant/entries/count/route.ts` — GET active-entry count for the nav badge

**Shared logic (new):**
- `src/lib/today/today-types.ts` — `TodayEntry`, `TodayEntryAction`, `TodayGroupedBuyer`, etc.
- `src/lib/today/today-grouping.ts` — pure grouping/pin/date-bucket-placement functions
- `src/lib/today/today-local-actions.ts` — `useLocalEntryActions` hook (client-only action simulation + local event log)
- `src/lib/today/today-confirm-prefs.ts` — `localStorage` "don't ask again" helper

**Data hooks (new):**
- `src/hooks/useTodayEntries.ts` — `useTodayEntries`, `useApplyGenericEntryAction`, `useEntryHistory`, `useTodayActiveCount`

**Nav (modify):**
- `src/components/layout/SellerSidebar.tsx` — add "Today" nav item + badge

**Routes (new):**
- `app/(seller)/today/layout.tsx`
- `app/(seller)/today/page.tsx`
- `app/(seller)/today/loading.tsx`
- `app/(seller)/today/[buyerId]/page.tsx`
- `app/(seller)/today/[buyerId]/loading.tsx`

**UI components (new), under `src/components/seller/today/`:**
- `TodayListClient.tsx` — list pane: tabs (Needs attention / Resolved), filter chips, date sections, rows
- `TodayEntryRow.tsx` — single list row
- `TodayEmptyState.tsx`
- `TodayDetailClient.tsx` — detail pane container (desktop card stack + mobile accordion), header (name, Show history, View record, prev/next)
- `TodayEntryCard.tsx` — one entry's collapsed/expanded body, per entry-type copy
- `TodayActionBar.tsx` — renders allowed actions, dispatches generic vs. local actions, wraps confirm dialog
- `TodayConfirmDialog.tsx` — `AlertDialog` wrapper with "Don't ask me again"
- `TodayHistorySheet.tsx`
- `TodayRecordSheet.tsx`

**Tests (new), under `src/tests/`:**
- `today-grouping.test.ts`
- `today-local-actions.test.ts`
- `today-confirm-prefs.test.ts`
- `today-entries-hook.test.tsx`
- `today-list-client.test.tsx`
- `today-action-bar.test.tsx`
- `today-history-sheet.test.tsx`

---

## Task 1: Backend — history endpoint

**Files:**
- Create: `supabase/migrations/<generated>_inbox_entry_events_history.sql`
- Create: `app/api/tenant/entries/buyer/[buyerId]/events/route.ts`
- Test: `src/tests/entries-buyer-events-api.test.ts`

**Interfaces:**
- Produces: `GET /api/tenant/entries/buyer/:buyerId/events` → `{ events: EntryHistoryEvent[] }` where
  ```ts
  interface EntryHistoryEvent {
    id: string;
    entry_id: string;
    entry_type: string;
    action: string;
    from_status: string | null;
    to_status: string | null;
    note: string | null;
    actor_id: string | null;
    created_at: string;
  }
  ```

- [ ] **Step 1: Create the migration file via CLI**

```bash
supabase migration new inbox_entry_events_history
```

- [ ] **Step 2: Write the RPC into the generated file**

Append to the generated `supabase/migrations/<timestamp>_inbox_entry_events_history.sql`:

```sql
-- Yukti Inbox: merged event history for a buyer, across all their entries.
CREATE OR REPLACE FUNCTION app.list_entry_events_for_buyer(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_limit integer DEFAULT 200
) RETURNS TABLE (
  id uuid,
  entry_id uuid,
  entry_type text,
  action text,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    ee.id,
    ee.entry_id,
    e.entry_type,
    ee.action,
    ee.from_status,
    ee.to_status,
    ee.note,
    ee.actor_user_id AS actor_id,
    ee.created_at
  FROM app.entry_events ee
  JOIN app.entries e ON e.id = ee.entry_id
  WHERE e.tenant_id = p_tenant_id
    AND e.buyer_id = p_buyer_id
    AND e.deleted_at IS NULL
    AND ee.deleted_at IS NULL
  ORDER BY ee.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;
```

- [ ] **Step 3: Write the failing API route test**

Create `src/tests/entries-buyer-events-api.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
  },
}));
vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));

import { GET } from '../../app/api/tenant/entries/buyer/[buyerId]/events/route';

describe('GET /api/tenant/entries/buyer/[buyerId]/events', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: null, sub: null });
    const req = new NextRequest('http://localhost/api/tenant/entries/buyer/b1/events');
    const res = await GET(req, { params: Promise.resolve({ buyerId: 'b1' }) });
    expect(res.status).toBe(401);
  });

  it('returns events for the authenticated seller tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_admin' });
    rpcMock.mockResolvedValue({ data: [{ id: 'e1', entry_id: 'en1', entry_type: 'invoice_overdue', action: 'send_reminder', from_status: 'new', to_status: 'opened', note: null, actor_id: 'u1', created_at: '2026-08-01T00:00:00Z' }], error: null });
    const req = new NextRequest('http://localhost/api/tenant/entries/buyer/b1/events');
    const res = await GET(req, { params: Promise.resolve({ buyerId: 'b1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe('send_reminder');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/entries-buyer-events-api.test.ts`
Expected: FAIL — cannot find module `../../app/api/tenant/entries/buyer/[buyerId]/events/route`

- [ ] **Step 5: Implement the route**

Create `app/api/tenant/entries/buyer/[buyerId]/events/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buyerId: string }> },
) {
  const { buyerId } = await params;
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const parsed = QuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('list_entry_events_for_buyer', {
        p_tenant_id: claims.tenant_id,
        p_buyer_id: buyerId,
        p_limit: parsed.data.limit,
      });

    if (error) {
      console.error('[GET /api/tenant/entries/buyer/[buyerId]/events]', error);
      return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/entries/buyer/[buyerId]/events]', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
```

Note: location scoping is intentionally not enforced here beyond tenant match — history is a read of a buyer's own event trail and a `seller_assistant` who can see an entry for that buyer via the list endpoint should be able to see its history too; the RPC already scopes by `tenant_id` + `buyer_id` so cross-tenant leakage is impossible.

- [ ] **Step 6: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/entries-buyer-events-api.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Apply the migration locally and commit**

```bash
supabase db push
supabase migration list
git add supabase/migrations app/api/tenant/entries/buyer src/tests/entries-buyer-events-api.test.ts
git commit -m "feat(inbox): add buyer entry-history RPC and API route"
```

---

## Task 2: Backend — active-count endpoint for the nav badge

**Files:**
- Create: `app/api/tenant/entries/count/route.ts`
- Test: `src/tests/entries-count-api.test.ts`

**Interfaces:**
- Produces: `GET /api/tenant/entries/count` → `{ count: number }` (count of active, i.e. non-resolved, entries visible to the caller's location scope)

- [ ] **Step 1: Write the failing test**

Create `src/tests/entries-count-api.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();
const getSellerLocationScopeMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
  },
}));
vi.mock('@/lib/server/seller-location-access', () => ({
  getSellerLocationScope: (...args: unknown[]) => getSellerLocationScopeMock(...args),
}));

import { GET } from '../../app/api/tenant/entries/count/route';

describe('GET /api/tenant/entries/count', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
    getSellerLocationScopeMock.mockReset();
  });

  it('returns 0 when the caller has no location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_assistant' });
    getSellerLocationScopeMock.mockReturnValue({ mode: 'none', locationIds: [] });
    const res = await GET(new NextRequest('http://localhost/api/tenant/entries/count'));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);
  });

  it('returns the row count from list_entries', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_admin' });
    getSellerLocationScopeMock.mockReturnValue({ mode: 'all', locationIds: null });
    rpcMock.mockResolvedValue({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null });
    const res = await GET(new NextRequest('http://localhost/api/tenant/entries/count'));
    const body = await res.json();
    expect(body.count).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/entries-count-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

Create `app/api/tenant/entries/count/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const locationScope = getSellerLocationScope(claims);
    if (locationScope.mode === 'none') {
      return NextResponse.json({ count: 0 }, { headers: SELLER_CACHE_PERSONAL });
    }

    const { data, error } = await (supabaseAdmin as any)
      .schema('app')
      .rpc('list_entries', {
        p_tenant_id: claims.tenant_id,
        p_location_ids: locationScope.mode === 'subset' ? locationScope.locationIds : null,
        p_status_scope: 'active',
        p_entry_types: null,
        p_search: null,
        p_limit: 100,
        p_cursor_priority_at: null,
        p_cursor_id: null,
      });

    if (error) {
      console.error('[GET /api/tenant/entries/count]', error);
      return NextResponse.json({ error: 'Failed to load count' }, { status: 500 });
    }

    return NextResponse.json({ count: (data ?? []).length }, { headers: SELLER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/tenant/entries/count]', error);
    return NextResponse.json({ error: 'Failed to load count' }, { status: 500 });
  }
}
```

Note: capped at 100 (the RPC's own max `p_limit`) — the nav badge shows "99+" beyond that rather than an exact count; see Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/entries-count-api.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/tenant/entries/count src/tests/entries-count-api.test.ts
git commit -m "feat(inbox): add active-entry count endpoint for nav badge"
```

---

## Task 3: Shared types + grouping/pin logic

**Files:**
- Create: `src/lib/today/today-types.ts`
- Create: `src/lib/today/today-grouping.ts`
- Test: `src/tests/today-grouping.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // today-types.ts
  export type TodayEntryType =
    | 'business_approval' | 'new_user_login' | 'new_enquiry' | 'new_order_confirmation'
    | 'order_dispatch_needed' | 'invoice_due' | 'invoice_overdue' | 'credit_limit_breach';
  export type TodayEntryStatus = 'new' | 'opened' | 'in_progress' | 'waiting' | 'resolved';
  export type TodayTimeBucket = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_quarter' | 'previous';

  export interface TodayEntry {
    id: string;
    entry_number: number;
    tenant_id: string;
    buyer_id: string | null;
    buyer_name: string;
    buyer_phone: string | null;
    location_id: string | null;
    entry_type: TodayEntryType;
    status: TodayEntryStatus;
    source_channel: string;
    source_entity_type: string;
    source_entity_id: string;
    title: string;
    summary: string;
    amount: number | null;
    currency: string | null;
    priority_at: string;
    remind_at: string | null;
    created_at: string;
    last_actor_id: string | null;
    last_action: string | null;
    last_action_at: string | null;
    external_sync_status: string;
    metadata: Record<string, unknown>;
    allowed_actions: string[];
    time_bucket: TodayTimeBucket;
    customer_entry_count: number;
  }

  export interface TodayGroupedBuyer {
    buyerKey: string; // buyer_id, or entry id for buyer-less entries
    buyerId: string | null;
    buyerName: string;
    timeBucket: TodayTimeBucket;
    entries: TodayEntry[]; // ordered: pinned first, then newest priority_at first
    totalCount: number;
  }

  export const TIME_BUCKET_ORDER: TodayTimeBucket[] = ['today', 'yesterday', 'this_week', 'this_month', 'this_quarter', 'previous'];
  export const TIME_BUCKET_LABEL: Record<TodayTimeBucket, string> = {
    today: 'Today', yesterday: 'Yesterday', this_week: 'This Week',
    this_month: 'This Month', this_quarter: 'This Quarter', previous: 'Previous',
  };
  ```
  ```ts
  // today-grouping.ts
  export function isPinnedEntry(entry: TodayEntry): boolean;
  export function groupEntriesByDateAndCustomer(entries: TodayEntry[]): Array<{ bucket: TodayTimeBucket; buyers: TodayGroupedBuyer[] }>;
  export function sortEntriesForStack(entries: TodayEntry[]): TodayEntry[];
  ```

- [ ] **Step 1: Write `today-types.ts`**

Create `src/lib/today/today-types.ts` with the exact content shown in Interfaces above.

- [ ] **Step 2: Write the failing grouping tests**

Create `src/tests/today-grouping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupEntriesByDateAndCustomer, isPinnedEntry, sortEntriesForStack } from '@/lib/today/today-grouping';
import type { TodayEntry } from '@/lib/today/today-types';

function makeEntry(overrides: Partial<TodayEntry>): TodayEntry {
  return {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
    buyer_phone: null, location_id: null, entry_type: 'invoice_overdue', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Ramesh Traders', summary: 'overdue', amount: 22000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-08-22T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'today', customer_entry_count: 1,
    ...overrides,
  };
}

describe('isPinnedEntry', () => {
  it('pins credit_limit_breach', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'credit_limit_breach' }))).toBe(true);
  });
  it('pins invoice_overdue at 16-30d and 30d+', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '16-30d' } }))).toBe(true);
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '30d+' } }))).toBe(true);
  });
  it('does not pin invoice_overdue under 16 days', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'invoice_overdue', metadata: { aging_tier: '1-7d' } }))).toBe(false);
  });
  it('does not pin unrelated types', () => {
    expect(isPinnedEntry(makeEntry({ entry_type: 'new_enquiry' }))).toBe(false);
  });
});

describe('sortEntriesForStack', () => {
  it('puts pinned entries above newer, lower-stakes entries', () => {
    const newEnquiry = makeEntry({ id: 'a', entry_type: 'new_enquiry', priority_at: '2026-09-07T12:00:00Z' });
    const overdue30 = makeEntry({ id: 'b', entry_type: 'invoice_overdue', metadata: { aging_tier: '30d+' }, priority_at: '2026-09-01T00:00:00Z' });
    const sorted = sortEntriesForStack([newEnquiry, overdue30]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });
  it('orders unpinned entries newest first', () => {
    const older = makeEntry({ id: 'a', priority_at: '2026-09-01T00:00:00Z', entry_type: 'new_enquiry' });
    const newer = makeEntry({ id: 'b', priority_at: '2026-09-07T00:00:00Z', entry_type: 'new_enquiry' });
    expect(sortEntriesForStack([older, newer]).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('groupEntriesByDateAndCustomer', () => {
  it('places a customer under the bucket of their freshest entry, count is the true total', () => {
    const oldInvoice = makeEntry({ id: 'inv', time_bucket: 'yesterday', priority_at: '2026-09-06T09:00:00Z', customer_entry_count: 2 });
    const newEnquiry = makeEntry({ id: 'enq', entry_type: 'new_enquiry', time_bucket: 'today', priority_at: '2026-09-07T09:00:00Z', customer_entry_count: 2 });
    const grouped = groupEntriesByDateAndCustomer([oldInvoice, newEnquiry]);
    const todaySection = grouped.find((g) => g.bucket === 'today');
    expect(todaySection?.buyers).toHaveLength(1);
    expect(todaySection?.buyers[0].totalCount).toBe(2);
    expect(todaySection?.buyers[0].entries.map((e) => e.id).sort()).toEqual(['enq', 'inv']);
    expect(grouped.find((g) => g.bucket === 'yesterday')).toBeUndefined();
  });

  it('groups buyer-less entries by their own entry id', () => {
    const visitor = makeEntry({ id: 'v1', buyer_id: null, entry_type: 'new_user_login', buyer_name: 'Unknown visitor', customer_entry_count: 1 });
    const grouped = groupEntriesByDateAndCustomer([visitor]);
    expect(grouped[0].buyers[0].buyerKey).toBe('v1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node scripts/run-vitest.mjs run src/tests/today-grouping.test.ts`
Expected: FAIL — cannot find module `@/lib/today/today-grouping`

- [ ] **Step 4: Implement `today-grouping.ts`**

Create `src/lib/today/today-grouping.ts`:

```ts
import { TIME_BUCKET_ORDER, type TodayEntry, type TodayGroupedBuyer, type TodayTimeBucket } from './today-types';

export function isPinnedEntry(entry: TodayEntry): boolean {
  if (entry.entry_type === 'credit_limit_breach') return true;
  if (entry.entry_type === 'invoice_overdue') {
    const tier = entry.metadata?.aging_tier;
    return tier === '16-30d' || tier === '30d+';
  }
  return false;
}

export function sortEntriesForStack(entries: TodayEntry[]): TodayEntry[] {
  return [...entries].sort((a, b) => {
    const pinnedA = isPinnedEntry(a);
    const pinnedB = isPinnedEntry(b);
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
    return new Date(b.priority_at).getTime() - new Date(a.priority_at).getTime();
  });
}

const BUCKET_RANK: Record<TodayTimeBucket, number> = Object.fromEntries(
  TIME_BUCKET_ORDER.map((bucket, index) => [bucket, index]),
) as Record<TodayTimeBucket, number>;

/** Earlier in TIME_BUCKET_ORDER = more recent/urgent. */
function freshestBucket(a: TodayTimeBucket, b: TodayTimeBucket): TodayTimeBucket {
  return BUCKET_RANK[a] <= BUCKET_RANK[b] ? a : b;
}

export function groupEntriesByDateAndCustomer(
  entries: TodayEntry[],
): Array<{ bucket: TodayTimeBucket; buyers: TodayGroupedBuyer[] }> {
  const byBuyerKey = new Map<string, TodayEntry[]>();
  for (const entry of entries) {
    const key = entry.buyer_id ?? entry.id;
    const list = byBuyerKey.get(key) ?? [];
    list.push(entry);
    byBuyerKey.set(key, list);
  }

  const buyerGroups: TodayGroupedBuyer[] = [];
  for (const [buyerKey, buyerEntries] of byBuyerKey) {
    const bucket = buyerEntries.reduce<TodayTimeBucket>(
      (acc, e) => freshestBucket(acc, e.time_bucket),
      buyerEntries[0].time_bucket,
    );
    buyerGroups.push({
      buyerKey,
      buyerId: buyerEntries[0].buyer_id,
      buyerName: buyerEntries[0].buyer_name,
      timeBucket: bucket,
      entries: sortEntriesForStack(buyerEntries),
      totalCount: buyerEntries[0].customer_entry_count,
    });
  }

  const byBucket = new Map<TodayTimeBucket, TodayGroupedBuyer[]>();
  for (const group of buyerGroups) {
    const list = byBucket.get(group.timeBucket) ?? [];
    list.push(group);
    byBucket.set(group.timeBucket, list);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => {
      const aLatest = Math.max(...a.entries.map((e) => new Date(e.priority_at).getTime()));
      const bLatest = Math.max(...b.entries.map((e) => new Date(e.priority_at).getTime()));
      return bLatest - aLatest;
    });
  }

  return TIME_BUCKET_ORDER
    .filter((bucket) => byBucket.has(bucket))
    .map((bucket) => ({ bucket, buyers: byBucket.get(bucket)! }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node scripts/run-vitest.mjs run src/tests/today-grouping.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/today/today-types.ts src/lib/today/today-grouping.ts src/tests/today-grouping.test.ts
git commit -m "feat(inbox): add Today entry types and date/customer grouping logic"
```

---

## Task 4: Local-action simulation store + confirm-prefs

**Files:**
- Create: `src/lib/today/today-local-actions.ts`
- Create: `src/lib/today/today-confirm-prefs.ts`
- Test: `src/tests/today-local-actions.test.ts`
- Test: `src/tests/today-confirm-prefs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // today-local-actions.ts
  export interface LocalEntryEvent {
    id: string; entry_id: string; entry_type: string; action: string;
    from_status: string; to_status: string; note: string | null;
    created_at: string; synced: false;
  }
  export interface LocalEntryOverride {
    status?: TodayEntryStatus;
    summary?: string;
    allowed_actions?: string[];
  }
  export function useLocalEntryActions(): {
    overrides: Record<string, LocalEntryOverride>;
    localEvents: LocalEntryEvent[];
    applyLocalAction: (entry: TodayEntry, action: string, opts?: { note?: string; nextStatus?: TodayEntryStatus; nextSummary?: string }) => void;
    getLocalEventsForEntry: (entryId: string) => LocalEntryEvent[];
  };
  ```
  ```ts
  // today-confirm-prefs.ts
  export function shouldSkipConfirm(tenantId: string, action: string): boolean;
  export function setSkipConfirm(tenantId: string, action: string): void;
  ```

- [ ] **Step 1: Write failing tests for local actions**

Create `src/tests/today-local-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalEntryActions } from '@/lib/today/today-local-actions';
import type { TodayEntry } from '@/lib/today/today-types';

const entry: TodayEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
  buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
  source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
  title: 'Ramesh Traders', summary: 'New order', amount: 58000, currency: 'INR',
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 1,
};

describe('useLocalEntryActions', () => {
  it('records an override and a local event for the entry', () => {
    const { result } = renderHook(() => useLocalEntryActions());
    act(() => {
      result.current.applyLocalAction(entry, 'accept_order', { nextStatus: 'resolved', nextSummary: 'Order accepted' });
    });
    expect(result.current.overrides['e1']).toEqual({ status: 'resolved', summary: 'Order accepted', allowed_actions: undefined });
    const events = result.current.getLocalEventsForEntry('e1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entry_id: 'e1', action: 'accept_order', from_status: 'new', to_status: 'resolved', synced: false });
  });

  it('accumulates multiple local events across actions', () => {
    const { result } = renderHook(() => useLocalEntryActions());
    act(() => {
      result.current.applyLocalAction(entry, 'contact_buyer', { note: 'called, no answer' });
    });
    act(() => {
      result.current.applyLocalAction({ ...entry, status: 'in_progress' }, 'accept_order', { nextStatus: 'resolved' });
    });
    expect(result.current.localEvents).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Write failing tests for confirm-prefs**

Create `src/tests/today-confirm-prefs.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { shouldSkipConfirm, setSkipConfirm } from '@/lib/today/today-confirm-prefs';

describe('today-confirm-prefs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to not skipping', () => {
    expect(shouldSkipConfirm('t1', 'decline')).toBe(false);
  });

  it('remembers a skip choice per tenant + action', () => {
    setSkipConfirm('t1', 'decline');
    expect(shouldSkipConfirm('t1', 'decline')).toBe(true);
    expect(shouldSkipConfirm('t1', 'reject')).toBe(false);
    expect(shouldSkipConfirm('t2', 'decline')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node scripts/run-vitest.mjs run src/tests/today-local-actions.test.ts src/tests/today-confirm-prefs.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement `today-local-actions.ts`**

Create `src/lib/today/today-local-actions.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';
import type { TodayEntry, TodayEntryStatus } from './today-types';

export interface LocalEntryEvent {
  id: string;
  entry_id: string;
  entry_type: string;
  action: string;
  from_status: string;
  to_status: string;
  note: string | null;
  created_at: string;
  synced: false;
}

export interface LocalEntryOverride {
  status?: TodayEntryStatus;
  summary?: string;
  allowed_actions?: string[];
}

let localEventCounter = 0;

export function useLocalEntryActions() {
  const [overrides, setOverrides] = useState<Record<string, LocalEntryOverride>>({});
  const [localEvents, setLocalEvents] = useState<LocalEntryEvent[]>([]);

  const applyLocalAction = useCallback(
    (
      entry: TodayEntry,
      action: string,
      opts?: { note?: string; nextStatus?: TodayEntryStatus; nextSummary?: string; nextAllowedActions?: string[] },
    ) => {
      const toStatus = opts?.nextStatus ?? entry.status;
      setOverrides((prev) => ({
        ...prev,
        [entry.id]: {
          status: toStatus,
          summary: opts?.nextSummary ?? prev[entry.id]?.summary,
          allowed_actions: opts?.nextAllowedActions ?? prev[entry.id]?.allowed_actions,
        },
      }));
      localEventCounter += 1;
      const event: LocalEntryEvent = {
        id: `local-${localEventCounter}`,
        entry_id: entry.id,
        entry_type: entry.entry_type,
        action,
        from_status: entry.status,
        to_status: toStatus,
        note: opts?.note ?? null,
        created_at: new Date().toISOString(),
        synced: false,
      };
      setLocalEvents((prev) => [...prev, event]);
    },
    [],
  );

  const getLocalEventsForEntry = useCallback(
    (entryId: string) => localEvents.filter((e) => e.entry_id === entryId),
    [localEvents],
  );

  return { overrides, localEvents, applyLocalAction, getLocalEventsForEntry };
}
```

- [ ] **Step 5: Implement `today-confirm-prefs.ts`**

Create `src/lib/today/today-confirm-prefs.ts`:

```ts
function storageKey(tenantId: string, action: string): string {
  return `today-skip-confirm:${tenantId}:${action}`;
}

export function shouldSkipConfirm(tenantId: string, action: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(tenantId, action)) === '1';
  } catch {
    return false;
  }
}

export function setSkipConfirm(tenantId: string, action: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantId, action), '1');
  } catch {
    // Storage unavailable (private browsing, quota) — confirmation just keeps showing.
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node scripts/run-vitest.mjs run src/tests/today-local-actions.test.ts src/tests/today-confirm-prefs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/today/today-local-actions.ts src/lib/today/today-confirm-prefs.ts src/tests/today-local-actions.test.ts src/tests/today-confirm-prefs.test.ts
git commit -m "feat(inbox): add local action simulation store and confirm-skip prefs"
```

---

## Task 5: Data hooks (list, generic action mutation, history, count)

**Files:**
- Create: `src/hooks/useTodayEntries.ts`
- Test: `src/tests/today-entries-hook.test.tsx`

**Interfaces:**
- Consumes: `TodayEntry` from `@/lib/today/today-types`; `apiFetch`, `apiPost` from `@/lib/api-fetch`; `NAVIGATION_QUERY_STALE_TIME`, `NAVIGATION_QUERY_GC_TIME` from `@/lib/query-navigation`.
- Produces:
  ```ts
  export function useTodayEntries(status: 'active' | 'resolved', entryTypes?: string[]): UseQueryResult<{ entries: TodayEntry[]; nextCursor: string | null }>;
  export function useApplyGenericEntryAction(): UseMutationResult<TodayEntry, Error, { entryId: string; action: 'remind_later' | 'add_note' | 'dismiss' | 'reopen'; note?: string; remind_at?: string }>;
  export function useEntryHistory(buyerId: string | null): UseQueryResult<{ events: EntryHistoryEvent[] }>;
  export function useTodayActiveCount(): UseQueryResult<{ count: number }>;
  ```

- [ ] **Step 1: Write the failing hook test**

Create `src/tests/today-entries-hook.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const apiFetchMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

import { useTodayEntries, useApplyGenericEntryAction, useTodayActiveCount } from '@/hooks/useTodayEntries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTodayEntries', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiPostMock.mockReset();
  });

  it('fetches active entries', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ entries: [{ id: 'e1' }], nextCursor: null }) });
    const { result } = renderHook(() => useTodayEntries('active'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('status=active'), expect.anything());
    expect(result.current.data?.entries).toHaveLength(1);
  });

  it('posts a generic action', async () => {
    apiPostMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'e1', status: 'waiting' } }) });
    const { result } = renderHook(() => useApplyGenericEntryAction(), { wrapper });
    await result.current.mutateAsync({ entryId: 'e1', action: 'remind_later', remind_at: '2026-09-08T00:00:00Z' });
    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/tenant/entries/e1/actions',
      { action: 'remind_later', remind_at: '2026-09-08T00:00:00Z' },
    );
  });

  it('fetches the active count', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 11 }) });
    const { result } = renderHook(() => useTodayActiveCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(11);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-entries-hook.test.tsx`
Expected: FAIL — cannot find module `@/hooks/useTodayEntries`

- [ ] **Step 3: Implement the hooks**

Create `src/hooks/useTodayEntries.ts`:

```ts
'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_STALE_TIME, NAVIGATION_QUERY_GC_TIME } from '@/lib/query-navigation';
import type { TodayEntry } from '@/lib/today/today-types';

export interface EntryHistoryEvent {
  id: string;
  entry_id: string;
  entry_type: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export function todayEntriesQueryKey(status: 'active' | 'resolved', entryTypes?: string[]) {
  return ['today-entries', status, (entryTypes ?? []).join(',')] as const;
}

export function useTodayEntries(status: 'active' | 'resolved', entryTypes?: string[]) {
  return useQuery({
    queryKey: todayEntriesQueryKey(status, entryTypes),
    queryFn: async () => {
      const params = new URLSearchParams({ status });
      if (entryTypes && entryTypes.length > 0) params.set('type', entryTypes.join(','));
      const res = await apiFetch(`/api/tenant/entries?${params.toString()}`, { fresh: true });
      if (!res.ok) throw new Error('Failed to load Today entries');
      return (await res.json()) as { entries: TodayEntry[]; nextCursor: string | null };
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

interface GenericActionInput {
  entryId: string;
  action: 'remind_later' | 'add_note' | 'dismiss' | 'reopen';
  note?: string;
  remind_at?: string;
}

export function useApplyGenericEntryAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, ...body }: GenericActionInput) => {
      const res = await apiPost(`/api/tenant/entries/${entryId}/actions`, body);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to update entry');
      }
      const payload = (await res.json()) as { data: TodayEntry };
      return payload.data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today-entries'] });
      queryClient.invalidateQueries({ queryKey: ['today-entry-history'] });
    },
  });
}

export function useEntryHistory(buyerId: string | null) {
  return useQuery({
    queryKey: ['today-entry-history', buyerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/entries/buyer/${buyerId}/events`, { fresh: true });
      if (!res.ok) throw new Error('Failed to load history');
      return (await res.json()) as { events: EntryHistoryEvent[] };
    },
    enabled: buyerId != null,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useTodayActiveCount() {
  return useQuery({
    queryKey: ['today-active-count'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/entries/count');
      if (!res.ok) throw new Error('Failed to load count');
      return (await res.json()) as { count: number };
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-entries-hook.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTodayEntries.ts src/tests/today-entries-hook.test.tsx
git commit -m "feat(inbox): add Today data hooks (list, generic action, history, count)"
```

---

## Task 6: Nav — "Today" item + badge

**Files:**
- Modify: `src/components/layout/SellerSidebar.tsx:14-118` (add nav item, icon, assistant order)
- Modify: `src/components/layout/SellerSidebar.tsx:198-223` (render badge on the nav item)
- Test: `src/tests/seller-sidebar-today-nav.test.tsx`

**Interfaces:**
- Consumes: `useTodayActiveCount` from `@/hooks/useTodayEntries`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/seller-sidebar-today-nav.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { collectPrefetchHrefs, navGroups } from '@/components/layout/SellerSidebar';
import { ROLES } from '@/constants';

describe('SellerSidebar Today nav item', () => {
  it('lists Today as the first OPERATIONS item, above Dashboard', () => {
    const operations = navGroups.find((g) => g.label === 'OPERATIONS')!;
    expect(operations.items[0].href).toBe('/today');
    expect(operations.items[1].href).toBe('/dashboard');
  });

  it('is prefetchable for both seller roles', () => {
    const hrefs = collectPrefetchHrefs(navGroups, { role: ROLES.SELLER_ADMIN, getFlag: () => true });
    expect(hrefs).toContain('/today');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/seller-sidebar-today-nav.test.tsx`
Expected: FAIL — `/today` not found at index 0

- [ ] **Step 3: Add the nav item and icon**

In `src/components/layout/SellerSidebar.tsx`, add to `navGroups` OPERATIONS (before Dashboard):

```ts
export const navGroups: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Today', href: '/today', icon: TodayIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT] },
      { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon, roles: [ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT] },
      // ...unchanged
```

Add `/today` to the front of `ASSISTANT_NAV_ORDER`:

```ts
const ASSISTANT_NAV_ORDER = [
  '/today',
  '/dashboard',
  '/estimates',
  '/sales-orders',
  '/invoices',
  '/customers',
  '/products',
] as const;
```

Add the icon function near the other icon functions:

```ts
function TodayIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/seller-sidebar-today-nav.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire the badge into `renderNavItem`**

In `SellerSidebar.tsx`, import the count hook and render a badge next to the Today label:

```ts
import { useTodayActiveCount } from '@/hooks/useTodayEntries';
```

Inside `SellerSidebar(...)`, alongside the other hooks:

```ts
  const { data: todayCount } = useTodayActiveCount();
```

In `renderNavItem`, after `{showExpandedContent && item.label}`:

```tsx
        <item.icon size={17} className={active ? 'text-ember-500' : 'text-[#3D3630]'} />
        {showExpandedContent && item.label}
        {item.href === '/today' && todayCount && todayCount.count > 0 ? (
          <span
            className={[
              'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ember-500 px-1.5 text-[11px] font-semibold text-white',
              showExpandedContent ? '' : 'absolute right-1 top-1 h-4 min-w-4 text-[9px]',
            ].join(' ')}
          >
            {todayCount.count > 99 ? '99+' : todayCount.count}
          </span>
        ) : null}
```

Note: the collapsed-rail badge needs `renderNavItem`'s `<Link>` wrapper to be `relative` when collapsed — add `showExpandedContent ? '' : 'relative'` to that `Link`'s className list (alongside the existing conditional classes).

- [ ] **Step 6: Run the full sidebar test file (existing + new) to confirm no regressions**

Run: `node scripts/run-vitest.mjs run src/tests/seller-sidebar-today-nav.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/SellerSidebar.tsx src/tests/seller-sidebar-today-nav.test.tsx
git commit -m "feat(inbox): add Today nav item with active-count badge"
```

---

## Task 7: Route scaffolding

**Files:**
- Create: `app/(seller)/today/layout.tsx`
- Create: `app/(seller)/today/page.tsx`
- Create: `app/(seller)/today/loading.tsx`
- Create: `app/(seller)/today/[buyerId]/page.tsx`
- Create: `app/(seller)/today/[buyerId]/loading.tsx`
- Modify: `src/lib/page-titles.ts` (add `today` entry to `SELLER_PAGE_TITLES`)

**Interfaces:**
- Consumes: `EntitySplitShell` from `@/components/seller/layout`; `TodayListClient` from `@/components/seller/today/TodayListClient` (Task 8); `TodayDetailClient` from `@/components/seller/today/TodayDetailClient` (Task 10, stubbed minimally here and filled in later — this task only needs it to exist and accept `buyerId`).

- [ ] **Step 1: Add the page title**

In `src/lib/page-titles.ts`, add to `SELLER_PAGE_TITLES`:

```ts
  today: 'Today',
```

(Match the exact object/key style already used for `customers` in that file.)

- [ ] **Step 2: Create the layout**

Create `app/(seller)/today/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';
import { EntitySplitShell } from '@/components/seller/layout';
import { TodayListClient } from '@/components/seller/today/TodayListClient';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.today);

export default async function TodayLayout({ children }: { children: ReactNode }) {
  await requireSellerServerTenantId();

  return (
    <EntitySplitShell basePath="/today" listSlot={<TodayListClient />}>
      {children}
    </EntitySplitShell>
  );
}
```

- [ ] **Step 3: Create the base page (list-only route)**

Create `app/(seller)/today/page.tsx`:

```tsx
// List rendering lives in ./layout.tsx (EntitySplitShell) so it stays
// mounted across /today <-> /today/[buyerId]. This page only exists so
// `/today` itself is a routable segment.
export default function TodayPage() {
  return null;
}
```

- [ ] **Step 4: Create the list loading skeleton**

Create `app/(seller)/today/loading.tsx`:

```tsx
export default function TodayLoading() {
  return (
    <div className="flex h-full flex-col gap-3 p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[12px] bg-cream-100" />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create the detail page**

Create `app/(seller)/today/[buyerId]/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { TodayDetailClient } from '@/components/seller/today/TodayDetailClient';

export default function TodayBuyerDetailPage({ params }: { params: Promise<{ buyerId: string }> }) {
  const { buyerId } = use(params);
  return <TodayDetailClient buyerId={buyerId} />;
}
```

- [ ] **Step 6: Create the detail loading skeleton**

Create `app/(seller)/today/[buyerId]/loading.tsx`:

```tsx
export default function TodayDetailLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-6" aria-hidden>
      <div className="h-7 w-48 animate-pulse rounded bg-cream-100" />
      <div className="h-40 animate-pulse rounded-[16px] bg-cream-100" />
    </div>
  );
}
```

- [ ] **Step 7: Verify the app builds with a stub `TodayDetailClient`**

`TodayListClient` (Task 8) and `TodayDetailClient` (Task 10) don't exist yet. To keep this task's deliverable independently buildable, create minimal stub files now — they'll be replaced (not just extended) in their own tasks:

Create `src/components/seller/today/TodayListClient.tsx`:

```tsx
'use client';

export function TodayListClient() {
  return <div className="p-4 text-sm text-cream-600">Today list — coming in Task 8.</div>;
}
```

Create `src/components/seller/today/TodayDetailClient.tsx`:

```tsx
'use client';

export function TodayDetailClient({ buyerId }: { buyerId: string }) {
  return <div className="p-6 text-sm text-cream-600">Today detail for {buyerId} — coming in Task 10.</div>;
}
```

- [ ] **Step 8: Run typecheck and lint**

Run: `npm run lint`
Expected: no errors in the new files

- [ ] **Step 9: Manually verify the route mounts**

Start the dev server (`npm run dev`), sign in as a seller, navigate to `/today`. Expected: sidebar highlights "Today", list pane shows the stub text, split-pane matches `/customers` sizing (list ~30%, no detail pane open).

- [ ] **Step 10: Commit**

```bash
git add app/\(seller\)/today src/lib/page-titles.ts src/components/seller/today/TodayListClient.tsx src/components/seller/today/TodayDetailClient.tsx
git commit -m "feat(inbox): scaffold /today route with EntitySplitShell"
```

---

## Task 8: List pane — `TodayListClient` + `TodayEntryRow` + `TodayEmptyState`

**Files:**
- Modify (replace stub): `src/components/seller/today/TodayListClient.tsx`
- Create: `src/components/seller/today/TodayEntryRow.tsx`
- Create: `src/components/seller/today/TodayEmptyState.tsx`
- Test: `src/tests/today-list-client.test.tsx`

**Interfaces:**
- Consumes: `useTodayEntries` (Task 5), `groupEntriesByDateAndCustomer`, `TIME_BUCKET_LABEL` (Task 3), `TodayEntry`/`TodayGroupedBuyer` types (Task 3), `useRouter`/`useParams` (`next/navigation`), `Tabs`/`TabsList`/`TabsTrigger` from `@/components/ui/tabs`.
- Produces: `TodayListClient` (default export target for `layout.tsx`'s `listSlot`), `TodayEntryRow({ buyer, onSelect, isActive }: { buyer: TodayGroupedBuyer; onSelect: () => void; isActive: boolean })`, `TodayEmptyState({ tab }: { tab: 'active' | 'resolved' })`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/today-list-client.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useTodayEntriesMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/hooks/useTodayEntries', () => ({
  useTodayEntries: (...args: unknown[]) => useTodayEntriesMock(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({}),
}));

import { TodayListClient } from '@/components/seller/today/TodayListClient';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Ramesh Traders',
    buyer_phone: null, location_id: null, entry_type: 'invoice_overdue', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Ramesh Traders', summary: '₹22,000 · 16 days overdue', amount: 22000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-08-22T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: { aging_tier: '16-30d' }, allowed_actions: ['send_reminder'], time_bucket: 'today', customer_entry_count: 1,
  },
];

describe('TodayListClient', () => {
  beforeEach(() => {
    useTodayEntriesMock.mockReset();
    pushMock.mockReset();
  });

  it('renders date sections with customer rows', () => {
    useTodayEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<TodayListClient />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText(/16 days overdue/)).toBeInTheDocument();
  });

  it('navigates to the buyer detail route on row click', () => {
    useTodayEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<TodayListClient />);
    fireEvent.click(screen.getByText('Ramesh Traders'));
    expect(pushMock).toHaveBeenCalledWith('/today/b1');
  });

  it('shows the empty state when there are no active entries', () => {
    useTodayEntriesMock.mockReturnValue({ data: { entries: [], nextCursor: null }, isLoading: false, isError: false });
    renderWithClient(<TodayListClient />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-list-client.test.tsx`
Expected: FAIL — stub component doesn't render date sections/rows

- [ ] **Step 3: Implement `TodayEmptyState`**

Create `src/components/seller/today/TodayEmptyState.tsx`:

```tsx
import { CheckCircle2 } from 'lucide-react';

export function TodayEmptyState({ tab }: { tab: 'active' | 'resolved' }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <CheckCircle2 className="h-8 w-8 text-cream-400" aria-hidden />
      <p className="text-base font-medium text-cream-800">
        {tab === 'active' ? "You're all caught up" : 'Nothing resolved yet'}
      </p>
      <p className="max-w-xs text-sm text-cream-500">
        {tab === 'active'
          ? 'New activity from your buyers will show up here as it happens.'
          : 'Items you resolve or that resolve on their own will collect here.'}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `TodayEntryRow`**

Create `src/components/seller/today/TodayEntryRow.tsx`:

```tsx
import type { TodayGroupedBuyer } from '@/lib/today/today-types';

export function TodayEntryRow({
  buyer,
  onSelect,
  isActive,
}: {
  buyer: TodayGroupedBuyer;
  onSelect: () => void;
  isActive: boolean;
}) {
  const primary = buyer.entries[0];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-start justify-between gap-3 rounded-[12px] px-3 py-3 text-left transition-colors',
        isActive ? 'bg-[rgba(181,100,47,0.10)]' : 'hover:bg-[var(--yk-hover-tint)]',
      ].join(' ')}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-cream-900">{buyer.buyerName}</p>
        <p className="mt-0.5 truncate text-sm text-cream-500">{primary.summary}</p>
      </div>
      {buyer.totalCount > 1 ? (
        <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cream-200 px-1.5 text-xs font-semibold text-cream-700">
          {buyer.totalCount}
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 5: Implement `TodayListClient`**

Replace `src/components/seller/today/TodayListClient.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTodayEntries } from '@/hooks/useTodayEntries';
import { groupEntriesByDateAndCustomer } from '@/lib/today/today-grouping';
import { TIME_BUCKET_LABEL, type TodayEntryType } from '@/lib/today/today-types';
import { TodayEntryRow } from './TodayEntryRow';
import { TodayEmptyState } from './TodayEmptyState';

const FILTER_CHIPS: Array<{ label: string; types: TodayEntryType[] }> = [
  { label: 'Approvals', types: ['business_approval', 'new_user_login'] },
  { label: 'Enquiries', types: ['new_enquiry'] },
  { label: 'Orders', types: ['new_order_confirmation', 'order_dispatch_needed'] },
  { label: 'Collections', types: ['invoice_due', 'invoice_overdue', 'credit_limit_breach'] },
];

export function TodayListClient() {
  const router = useRouter();
  const params = useParams<{ buyerId?: string }>();
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const chipTypes = activeChip ? FILTER_CHIPS.find((c) => c.label === activeChip)?.types : undefined;
  const { data, isLoading } = useTodayEntries(tab, chipTypes);

  const sections = useMemo(
    () => groupEntriesByDateAndCustomer(data?.entries ?? []),
    [data?.entries],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-cream-200 px-4 pt-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'resolved')}>
          <TabsList>
            <TabsTrigger value="active">Needs attention</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 py-3">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setActiveChip((prev) => (prev === chip.label ? null : chip.label))}
              className={[
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                activeChip === chip.label
                  ? 'border-ember-300 bg-ember-50 text-ember-700'
                  : 'border-cream-300 text-cream-700 hover:bg-cream-100',
              ].join(' ')}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? null : sections.length === 0 ? (
          <TodayEmptyState tab={tab} />
        ) : (
          sections.map(({ bucket, buyers }) => (
            <div key={bucket} className="px-2 pt-5">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-500">
                {TIME_BUCKET_LABEL[bucket]}
              </p>
              <div className="space-y-1">
                {buyers.map((buyer) => (
                  <TodayEntryRow
                    key={buyer.buyerKey}
                    buyer={buyer}
                    isActive={params.buyerId === buyer.buyerId}
                    onSelect={() => router.push(`/today/${buyer.buyerId ?? buyer.buyerKey}`)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-list-client.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/seller/today/TodayListClient.tsx src/components/seller/today/TodayEntryRow.tsx src/components/seller/today/TodayEmptyState.tsx src/tests/today-list-client.test.tsx
git commit -m "feat(inbox): implement Today list pane with date sections and filter chips"
```

---

## Task 9: `TodayConfirmDialog`

**Files:**
- Create: `src/components/seller/today/TodayConfirmDialog.tsx`
- Test: `src/tests/today-confirm-dialog.test.tsx`

**Interfaces:**
- Consumes: `AlertDialog*` from `@/components/ui/alert-dialog`, `Checkbox` from `@/components/ui/checkbox` (verify this primitive exists before use — if it doesn't, use a plain `<input type="checkbox">` styled to match), `setSkipConfirm` from `@/lib/today/today-confirm-prefs`.
- Produces:
  ```ts
  export function TodayConfirmDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    tenantId: string;
    actionKey: string;
    onConfirm: () => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Confirm the checkbox primitive exists**

Run: `ls src/components/ui | grep -i checkbox`
If it exists, use `Checkbox` from `@/components/ui/checkbox` in Step 3 below. If it does not exist, use a plain styled `<input type="checkbox">` instead (shown as the fallback in Step 3's code comment) — do not add a new shadcn primitive for this alone.

- [ ] **Step 2: Write the failing test**

Create `src/tests/today-confirm-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodayConfirmDialog } from '@/components/seller/today/TodayConfirmDialog';
import * as confirmPrefs from '@/lib/today/today-confirm-prefs';

describe('TodayConfirmDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <TodayConfirmDialog
        open
        onOpenChange={() => {}}
        title="Decline this account?"
        description="Ramesh Traders will be notified they were not approved."
        confirmLabel="Decline"
        tenantId="t1"
        actionKey="decline"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('persists the skip preference when the checkbox is checked before confirming', () => {
    const setSkipSpy = vi.spyOn(confirmPrefs, 'setSkipConfirm');
    render(
      <TodayConfirmDialog
        open
        onOpenChange={() => {}}
        title="Reject this order?"
        description="Buyer will be notified."
        confirmLabel="Reject"
        tenantId="t1"
        actionKey="reject"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/don't ask me again/i));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(setSkipSpy).toHaveBeenCalledWith('t1', 'reject');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-confirm-dialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the component**

Create `src/components/seller/today/TodayConfirmDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { setSkipConfirm } from '@/lib/today/today-confirm-prefs';

interface TodayConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tenantId: string;
  actionKey: string;
  onConfirm: () => void;
}

export function TodayConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tenantId,
  actionKey,
  onConfirm,
}: TodayConfirmDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 px-1 py-2">
          <input
            id={`today-skip-confirm-${actionKey}`}
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="h-4 w-4 rounded border-cream-300 text-ember-600 focus:ring-ember-500"
          />
          <label htmlFor={`today-skip-confirm-${actionKey}`} className="text-sm text-cream-700">
            Don&apos;t ask me again on this device
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (dontAskAgain) setSkipConfirm(tenantId, actionKey);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-confirm-dialog.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/seller/today/TodayConfirmDialog.tsx src/tests/today-confirm-dialog.test.tsx
git commit -m "feat(inbox): add confirm dialog with don't-ask-again for destructive actions"
```

---

## Task 10: `TodayActionBar`

**Files:**
- Create: `src/components/seller/today/TodayActionBar.tsx`
- Test: `src/tests/today-action-bar.test.tsx`

**Interfaces:**
- Consumes: `TodayEntry` (Task 3), `useApplyGenericEntryAction` (Task 5), `useLocalEntryActions` return shape (Task 4), `TodayConfirmDialog` (Task 9).
- Produces:
  ```ts
  export const GENERIC_ACTIONS = new Set(['remind_later', 'add_note', 'dismiss', 'reopen']);
  export const DESTRUCTIVE_ACTIONS: Record<string, { title: string; description: (entry: TodayEntry) => string; confirmLabel: string }>;
  export const ACTION_LABELS: Record<string, string>;

  export function TodayActionBar(props: {
    entry: TodayEntry;
    tenantId: string;
    applyLocalAction: (entry: TodayEntry, action: string, opts?: { note?: string; nextStatus?: TodayEntryStatus; nextSummary?: string }) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/tests/today-action-bar.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsyncMock = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useTodayEntries', () => ({
  useApplyGenericEntryAction: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

import { TodayActionBar } from '@/components/seller/today/TodayActionBar';
import type { TodayEntry } from '@/lib/today/today-types';

const baseEntry: TodayEntry = {
  id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
  buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
  source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
  title: 'Sri Krishna Enterprises', summary: 'New order', amount: 58000, currency: 'INR',
  priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
  last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
  metadata: {}, allowed_actions: ['accept_order', 'contact_buyer', 'reject'], time_bucket: 'today', customer_entry_count: 1,
};

function renderBar(entry: TodayEntry, applyLocalAction = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TodayActionBar entry={entry} tenantId="t1" applyLocalAction={applyLocalAction} />
    </QueryClientProvider>,
  );
  return { applyLocalAction };
}

describe('TodayActionBar', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    window.localStorage.clear();
  });

  it('renders a button per allowed action', () => {
    renderBar(baseEntry);
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact buyer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('applies a non-destructive local action immediately without a confirm dialog', () => {
    const { applyLocalAction } = renderBar(baseEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Accept order' }));
    expect(applyLocalAction).toHaveBeenCalledWith(baseEntry, 'accept_order', expect.any(Object));
  });

  it('shows a confirm dialog before a destructive action, and applies only after confirming', () => {
    const { applyLocalAction } = renderBar(baseEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(applyLocalAction).not.toHaveBeenCalled();
    expect(screen.getByText(/reject this order/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[1]);
    expect(applyLocalAction).toHaveBeenCalledWith(baseEntry, 'reject', expect.any(Object));
  });

  it('calls the real mutation for a generic action', async () => {
    renderBar({ ...baseEntry, allowed_actions: ['remind_later'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remind later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-action-bar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/seller/today/TodayActionBar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useApplyGenericEntryAction } from '@/hooks/useTodayEntries';
import { shouldSkipConfirm } from '@/lib/today/today-confirm-prefs';
import { TodayConfirmDialog } from './TodayConfirmDialog';
import type { TodayEntry, TodayEntryStatus } from '@/lib/today/today-types';

export const GENERIC_ACTIONS = new Set(['remind_later', 'add_note', 'dismiss', 'reopen']);

export const ACTION_LABELS: Record<string, string> = {
  approve: 'Approve',
  request_more_info: 'Request more info',
  decline: 'Decline',
  view_details: 'View details',
  view_buyer: 'View buyer',
  add_note: 'Add note',
  view_activity: 'View activity',
  ignore: 'Ignore',
  reply_quote: 'Reply / Quote',
  send: 'Send',
  convert: 'Convert',
  contact_buyer: 'Contact buyer',
  view_enquiry: 'View enquiry',
  view_buyer_history: 'View buyer history',
  mark_converted_manually: 'Mark as converted',
  remind_later: 'Remind later',
  accept_order: 'Accept order',
  reject: 'Reject',
  view_order: 'View order',
  mark_dispatched: 'Mark dispatched',
  send_reminder: 'Send reminder',
  view_invoice: 'View invoice',
  log_call: 'Log a call',
  hold_new_orders: 'Hold new orders',
  adjust_limit: 'Adjust limit',
  view_account: 'View account',
  reopen: 'Reopen',
};

const DESTRUCTIVE_ACTIONS: Record<string, { title: string; description: (entry: TodayEntry) => string; confirmLabel: string }> = {
  decline: {
    title: 'Decline this account?',
    description: (entry) => `${entry.buyer_name} will not be approved. You can reconsider later from Resolved.`,
    confirmLabel: 'Decline',
  },
  reject: {
    title: 'Reject this order?',
    description: (entry) => `${entry.buyer_name}'s order will be rejected and they'll be notified.`,
    confirmLabel: 'Reject',
  },
};

const REMIND_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

interface TodayActionBarProps {
  entry: TodayEntry;
  tenantId: string;
  applyLocalAction: (
    entry: TodayEntry,
    action: string,
    opts?: { note?: string; nextStatus?: TodayEntryStatus; nextSummary?: string },
  ) => void;
}

export function TodayActionBar({ entry, tenantId, applyLocalAction }: TodayActionBarProps) {
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [remindPickerOpen, setRemindPickerOpen] = useState(false);
  const applyGenericAction = useApplyGenericEntryAction();

  function runLocalAction(action: string) {
    applyLocalAction(entry, action, { nextStatus: 'resolved', nextSummary: `${ACTION_LABELS[action] ?? action} done` });
  }

  async function runGenericAction(action: string, remindAt?: string) {
    try {
      await applyGenericAction.mutateAsync({ entryId: entry.id, action: action as 'remind_later' | 'dismiss' | 'reopen' | 'add_note', remind_at: remindAt });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this item');
    }
  }

  function handleActionClick(action: string) {
    if (action === 'remind_later') {
      setRemindPickerOpen(true);
      return;
    }
    if (GENERIC_ACTIONS.has(action)) {
      void runGenericAction(action);
      return;
    }
    if (DESTRUCTIVE_ACTIONS[action] && !shouldSkipConfirm(tenantId, action)) {
      setPendingConfirm(action);
      return;
    }
    runLocalAction(action);
  }

  const destructiveMeta = pendingConfirm ? DESTRUCTIVE_ACTIONS[pendingConfirm] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      {entry.allowed_actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === entry.allowed_actions[0] ? 'default' : 'outline'}
          onClick={() => handleActionClick(action)}
        >
          {ACTION_LABELS[action] ?? action}
        </Button>
      ))}

      {remindPickerOpen ? (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          {REMIND_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const remindAt = new Date(Date.now() + opt.days * 24 * 60 * 60 * 1000).toISOString();
                setRemindPickerOpen(false);
                void runGenericAction('remind_later', remindAt);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ) : null}

      {destructiveMeta ? (
        <TodayConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingConfirm(null)}
          title={destructiveMeta.title}
          description={destructiveMeta.description(entry)}
          confirmLabel={destructiveMeta.confirmLabel}
          tenantId={tenantId}
          actionKey={pendingConfirm!}
          onConfirm={() => {
            runLocalAction(pendingConfirm!);
            setPendingConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-action-bar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/seller/today/TodayActionBar.tsx src/tests/today-action-bar.test.tsx
git commit -m "feat(inbox): add Today action bar (generic + local + confirm-gated actions)"
```

---

## Task 11: `TodayHistorySheet`

**Files:**
- Create: `src/components/seller/today/TodayHistorySheet.tsx`
- Test: `src/tests/today-history-sheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`; `useEntryHistory` (Task 5); `EntryHistoryEvent` type (Task 5); `LocalEntryEvent` (Task 4); `ACTION_LABELS` from `TodayActionBar` (Task 10).
- Produces: `TodayHistorySheet({ open, onOpenChange, buyerId, buyerName, localEvents }: { open: boolean; onOpenChange: (open: boolean) => void; buyerId: string; buyerName: string; localEvents: LocalEntryEvent[] })`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/today-history-sheet.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useEntryHistoryMock = vi.fn();
vi.mock('@/hooks/useTodayEntries', () => ({
  useEntryHistory: (...args: unknown[]) => useEntryHistoryMock(...args),
}));

import { TodayHistorySheet } from '@/components/seller/today/TodayHistorySheet';

function renderSheet(props: Partial<React.ComponentProps<typeof TodayHistorySheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodayHistorySheet
        open
        onOpenChange={() => {}}
        buyerId="b1"
        buyerName="Ramesh Traders"
        localEvents={[]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('TodayHistorySheet', () => {
  beforeEach(() => useEntryHistoryMock.mockReset());

  it('renders real events merged newest-first with local ones', () => {
    useEntryHistoryMock.mockReturnValue({
      data: { events: [{ id: 'ev1', entry_id: 'e1', entry_type: 'invoice_overdue', action: 'send_reminder', from_status: 'new', to_status: 'opened', note: null, actor_id: 'u1', created_at: '2026-09-01T00:00:00Z' }] },
      isLoading: false,
    });
    renderSheet({
      localEvents: [{ id: 'local-1', entry_id: 'e2', entry_type: 'new_order_confirmation', action: 'accept_order', from_status: 'new', to_status: 'resolved', note: null, created_at: '2026-09-07T00:00:00Z', synced: false }],
    });
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText(/send reminder/i)).toBeInTheDocument();
    expect(screen.getByText(/accept order/i)).toBeInTheDocument();
    expect(screen.getByText(/not yet synced/i)).toBeInTheDocument();
  });

  it('shows an empty message when there is no history', () => {
    useEntryHistoryMock.mockReturnValue({ data: { events: [] }, isLoading: false });
    renderSheet();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-history-sheet.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/seller/today/TodayHistorySheet.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEntryHistory, type EntryHistoryEvent } from '@/hooks/useTodayEntries';
import type { LocalEntryEvent } from '@/lib/today/today-local-actions';
import { ACTION_LABELS } from './TodayActionBar';

interface TodayHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  localEvents: LocalEntryEvent[];
}

type MergedEvent = (EntryHistoryEvent & { synced: true }) | LocalEntryEvent;

export function TodayHistorySheet({ open, onOpenChange, buyerId, buyerName, localEvents }: TodayHistorySheetProps) {
  const { data, isLoading } = useEntryHistory(open ? buyerId : null);

  const merged = useMemo<MergedEvent[]>(() => {
    const real: MergedEvent[] = (data?.events ?? []).map((e) => ({ ...e, synced: true as const }));
    const relevantLocal = localEvents.filter((e) => real.every((r) => r.entry_id !== e.entry_id || r.action !== e.action));
    return [...real, ...relevantLocal].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data?.events, localEvents]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader className="border-b border-cream-200 px-6 py-5">
          <SheetTitle>{buyerName}</SheetTitle>
          <p className="text-sm text-cream-500">Activity across every item for this customer</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <p className="text-sm text-cream-500">Loading…</p>
          ) : merged.length === 0 ? (
            <p className="text-sm text-cream-500">No activity yet.</p>
          ) : (
            <ol className="space-y-4">
              {merged.map((event) => (
                <li key={event.id} className="border-l-2 border-cream-200 pl-4">
                  <p className="text-sm font-medium text-cream-800">
                    {ACTION_LABELS[event.action] ?? event.action}
                    {!event.synced ? <span className="ml-2 text-xs font-normal text-warning-700">not yet synced</span> : null}
                  </p>
                  {event.note ? <p className="mt-0.5 text-sm text-cream-600">{event.note}</p> : null}
                  <p className="mt-0.5 text-xs text-cream-400">{new Date(event.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-history-sheet.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/seller/today/TodayHistorySheet.tsx src/tests/today-history-sheet.test.tsx
git commit -m "feat(inbox): add merged real+local History sheet"
```

---

## Task 12: `TodayRecordSheet` ("View {name}")

**Files:**
- Create: `src/components/seller/today/TodayRecordSheet.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`; `TodayEntry` (Task 3, for the fields it already carries: `buyer_name`, `buyer_phone`, `amount`, `currency`).
- Produces: `TodayRecordSheet({ open, onOpenChange, buyerId, buyerName, buyerPhone }: { open: boolean; onOpenChange: (open: boolean) => void; buyerId: string; buyerName: string; buyerPhone: string | null })`.

This sheet intentionally shows only the fields already available from the entries list response (name, phone) plus a link to the full record — it does not fetch the full customer detail payload (that's the existing `/customers/[id]` page, which stays the source of truth for the full tabbed view). Fetching richer account fields (GSTIN, credit limit, outstanding) for this preview is a follow-up once product confirms which fields the preview needs — this task ships the structural piece (side-overlay instead of navigation) called out in your feedback.

- [ ] **Step 1: Implement the component (no new test — thin presentational wrapper covered by the Task 13 integration test)**

Create `src/components/seller/today/TodayRecordSheet.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface TodayRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  buyerPhone: string | null;
}

export function TodayRecordSheet({ open, onOpenChange, buyerId, buyerName, buyerPhone }: TodayRecordSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader className="border-b border-cream-200 px-6 py-5">
          <SheetTitle>{buyerName}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-500">Phone</p>
            <p className="mt-1 text-sm text-cream-800">{buyerPhone ?? 'Not on file'}</p>
          </div>
          <Link
            href={`/customers/${buyerId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ember-700 hover:text-ember-800"
          >
            Open full customer record
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/seller/today/TodayRecordSheet.tsx
git commit -m "feat(inbox): add View-record side overlay"
```

---

## Task 13: `TodayEntryCard` + desktop `TodayDetailClient`

**Files:**
- Create: `src/components/seller/today/TodayEntryCard.tsx`
- Modify (replace stub): `src/components/seller/today/TodayDetailClient.tsx`
- Test: `src/tests/today-detail-client.test.tsx`

**Interfaces:**
- Consumes: `TodayEntry` (Task 3), `sortEntriesForStack`, `isPinnedEntry` (Task 3), `useTodayEntries` (Task 5), `useLocalEntryActions` (Task 4), `TodayActionBar` (Task 10), `TodayHistorySheet` (Task 11), `TodayRecordSheet` (Task 12), `useRouter`/`useParams` for prev/next, `useRole` (for `tenantId` — check its return shape before use; if it doesn't expose `tenant_id`, source it from the entry itself, since every `TodayEntry` already carries `tenant_id`).
- Produces: `TodayEntryCard({ entry, expanded, onToggle, tenantId, applyLocalAction }: { entry: TodayEntry; expanded: boolean; onToggle: () => void; tenantId: string; applyLocalAction: TodayActionBarProps['applyLocalAction'] })`, `TodayDetailClient({ buyerId }: { buyerId: string })`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/today-detail-client.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useTodayEntriesMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/hooks/useTodayEntries', () => ({
  useTodayEntries: (...args: unknown[]) => useTodayEntriesMock(...args),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ buyerId: 'b1' }),
}));

import { TodayDetailClient } from '@/components/seller/today/TodayDetailClient';

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: '9990001111', location_id: null, entry_type: 'new_order_confirmation', status: 'new',
    source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
    title: 'Sri Krishna Enterprises', summary: '₹58,000 · 14 items', amount: 58000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 2,
  },
  {
    id: 'e2', entry_number: 2, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: '9990001111', location_id: null, entry_type: 'invoice_due', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Sri Krishna Enterprises', summary: '₹18,400 due in 4 days', amount: 18400, currency: 'INR',
    priority_at: '2026-09-05T10:00:00Z', remind_at: null, created_at: '2026-09-05T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'this_week', customer_entry_count: 2,
  },
];

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodayDetailClient buyerId="b1" />
    </QueryClientProvider>,
  );
}

describe('TodayDetailClient', () => {
  beforeEach(() => {
    useTodayEntriesMock.mockReset();
    useTodayEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false });
  });

  it('renders a card stack for a customer with multiple open items, all collapsed by default', () => {
    renderDetail();
    expect(screen.getByText('Sri Krishna Enterprises')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
  });

  it('expands one card at a time', () => {
    renderDetail();
    fireEvent.click(screen.getByText(/58,000/));
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeInTheDocument();
    fireEvent.click(screen.getByText(/18,400/));
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-detail-client.test.tsx`
Expected: FAIL — stub renders placeholder text only

- [ ] **Step 3: Implement `TodayEntryCard`**

Create `src/components/seller/today/TodayEntryCard.tsx`:

```tsx
import { StatusPill } from '@/components/ui/status-pill';
import { TodayActionBar } from './TodayActionBar';
import { isPinnedEntry } from '@/lib/today/today-grouping';
import type { TodayEntry, TodayEntryStatus } from '@/lib/today/today-types';

const AGING_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  due_soon: 'neutral',
  '1-7d': 'warning',
  '8-15d': 'warning',
  '16-30d': 'danger',
  '30d+': 'danger',
};

interface TodayEntryCardProps {
  entry: TodayEntry;
  expanded: boolean;
  onToggle: () => void;
  tenantId: string;
  applyLocalAction: (
    entry: TodayEntry,
    action: string,
    opts?: { note?: string; nextStatus?: TodayEntryStatus; nextSummary?: string },
  ) => void;
}

export function TodayEntryCard({ entry, expanded, onToggle, tenantId, applyLocalAction }: TodayEntryCardProps) {
  const agingTier = typeof entry.metadata.aging_tier === 'string' ? entry.metadata.aging_tier : null;

  return (
    <div className="relative rounded-[16px] border border-cream-200 bg-white px-5 py-4">
      {isPinnedEntry(entry) ? (
        <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-ember-400" aria-label="Pinned — needs attention first" />
      ) : null}
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="text-base font-medium text-cream-900">{entry.summary}</p>
          {agingTier ? <StatusPill label={agingTier} tone={AGING_TONE[agingTier] ?? 'neutral'} className="mt-2" /> : null}
        </div>
      </button>
      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-cream-100 pt-4">
          {entry.metadata.last_reminder_at ? (
            <p className="text-sm leading-relaxed text-cream-600">
              Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
            </p>
          ) : null}
          <TodayActionBar entry={entry} tenantId={tenantId} applyLocalAction={applyLocalAction} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement `TodayDetailClient` (desktop card stack; mobile accordion added in Task 14)**

Replace `src/components/seller/today/TodayDetailClient.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTodayEntries } from '@/hooks/useTodayEntries';
import { sortEntriesForStack, groupEntriesByDateAndCustomer } from '@/lib/today/today-grouping';
import { useLocalEntryActions } from '@/lib/today/today-local-actions';
import { TodayEntryCard } from './TodayEntryCard';
import { TodayHistorySheet } from './TodayHistorySheet';
import { TodayRecordSheet } from './TodayRecordSheet';

export function TodayDetailClient({ buyerId }: { buyerId: string }) {
  const router = useRouter();
  const { data } = useTodayEntries('active');
  const { overrides, localEvents, applyLocalAction } = useLocalEntryActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const allEntries = data?.entries ?? [];
  const buyerEntries = useMemo(
    () =>
      sortEntriesForStack(
        allEntries
          .filter((e) => e.buyer_id === buyerId)
          .map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e)),
      ),
    [allEntries, buyerId, overrides],
  );

  const orderedBuyerKeys = useMemo(
    () => groupEntriesByDateAndCustomer(allEntries).flatMap((section) => section.buyers.map((b) => b.buyerKey)),
    [allEntries],
  );
  const currentIndex = orderedBuyerKeys.indexOf(buyerId);
  const prevBuyerKey = currentIndex > 0 ? orderedBuyerKeys[currentIndex - 1] : null;
  const nextBuyerKey = currentIndex >= 0 && currentIndex < orderedBuyerKeys.length - 1 ? orderedBuyerKeys[currentIndex + 1] : null;

  if (buyerEntries.length === 0) {
    return <div className="p-6 text-sm text-cream-500">This item is no longer in your active list.</div>;
  }

  const buyerName = buyerEntries[0].buyer_name;
  const buyerPhone = buyerEntries[0].buyer_phone;
  const tenantId = buyerEntries[0].tenant_id;
  const singleItem = buyerEntries.length === 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-cream-200 px-6 py-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-cream-950">{buyerName}</h1>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-cream-500 hover:text-cream-700"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Show history
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-sm font-medium text-cream-700 hover:bg-cream-100"
          >
            View {buyerName}
          </button>
          <div className="flex items-center overflow-hidden rounded-full border border-cream-300">
            <button
              type="button"
              disabled={!prevBuyerKey}
              onClick={() => prevBuyerKey && router.push(`/today/${prevBuyerKey}`)}
              className="p-2 text-cream-600 hover:bg-cream-100 disabled:opacity-30"
              aria-label="Previous customer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!nextBuyerKey}
              onClick={() => nextBuyerKey && router.push(`/today/${nextBuyerKey}`)}
              className="p-2 text-cream-600 hover:bg-cream-100 disabled:opacity-30"
              aria-label="Next customer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {buyerEntries.map((entry) => (
          <TodayEntryCard
            key={entry.id}
            entry={entry}
            expanded={singleItem || expandedId === entry.id}
            onToggle={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
            tenantId={tenantId}
            applyLocalAction={applyLocalAction}
          />
        ))}
      </div>

      <TodayHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        buyerId={buyerId}
        buyerName={buyerName}
        localEvents={localEvents}
      />
      <TodayRecordSheet
        open={recordOpen}
        onOpenChange={setRecordOpen}
        buyerId={buyerId}
        buyerName={buyerName}
        buyerPhone={buyerPhone}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-detail-client.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/seller/today/TodayEntryCard.tsx src/components/seller/today/TodayDetailClient.tsx src/tests/today-detail-client.test.tsx
git commit -m "feat(inbox): implement desktop detail pane (card stack, history/record overlays, prev/next)"
```

---

## Task 14: Mobile accordion variant

**Files:**
- Modify: `src/components/seller/today/TodayDetailClient.tsx` (add a `useIsDesktop`-gated accordion branch for the multi-item body)
- Test: `src/tests/today-detail-client-mobile.test.tsx`

**Interfaces:**
- Consumes: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion`. Breakpoint check mirrors `EntitySplitShell`'s own `matchMedia('(min-width: 768px)')` pattern — duplicate that same check locally in this file (it's a 6-line effect, not worth extracting given it's the only other user of this exact pattern today).

- [ ] **Step 1: Write the failing test**

Create `src/tests/today-detail-client-mobile.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useTodayEntriesMock = vi.fn();

vi.mock('@/hooks/useTodayEntries', () => ({
  useTodayEntries: (...args: unknown[]) => useTodayEntriesMock(...args),
  useApplyGenericEntryAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ buyerId: 'b1' }),
}));

import { TodayDetailClient } from '@/components/seller/today/TodayDetailClient';

const ENTRIES = [
  {
    id: 'e1', entry_number: 1, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: null, location_id: null, entry_type: 'new_order_confirmation', status: 'new',
    source_channel: 'storefront', source_entity_type: 'order', source_entity_id: 'o1',
    title: 'Sri Krishna Enterprises', summary: '₹58,000 · 14 items', amount: 58000, currency: 'INR',
    priority_at: '2026-09-07T10:00:00Z', remind_at: null, created_at: '2026-09-07T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['accept_order', 'reject'], time_bucket: 'today', customer_entry_count: 2,
  },
  {
    id: 'e2', entry_number: 2, tenant_id: 't1', buyer_id: 'b1', buyer_name: 'Sri Krishna Enterprises',
    buyer_phone: null, location_id: null, entry_type: 'invoice_due', status: 'new',
    source_channel: 'backend', source_entity_type: 'invoice', source_entity_id: 'inv1',
    title: 'Sri Krishna Enterprises', summary: '₹18,400 due in 4 days', amount: 18400, currency: 'INR',
    priority_at: '2026-09-05T10:00:00Z', remind_at: null, created_at: '2026-09-05T10:00:00Z',
    last_actor_id: null, last_action: null, last_action_at: null, external_sync_status: 'not_required',
    metadata: {}, allowed_actions: ['send_reminder'], time_bucket: 'this_week', customer_entry_count: 2,
  },
];

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: width >= 768,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodayDetailClient buyerId="b1" />
    </QueryClientProvider>,
  );
}

describe('TodayDetailClient on mobile', () => {
  beforeEach(() => {
    useTodayEntriesMock.mockReset();
    useTodayEntriesMock.mockReturnValue({ data: { entries: ENTRIES, nextCursor: null }, isLoading: false });
    setViewportWidth(375);
  });

  it('renders items as accordion rows with per-item action CTAs when expanded', () => {
    renderDetail();
    expect(screen.getByRole('button', { name: /58,000/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /58,000/ }));
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/run-vitest.mjs run src/tests/today-detail-client-mobile.test.tsx`
Expected: FAIL — no `role="button"` accordion trigger rendered by name match (current desktop-only markup uses a plain `<button>` with no accessible name matching a regex on amount text reliably as an accordion trigger — the assertion targets accordion semantics that don't exist yet)

- [ ] **Step 3: Add the mobile branch to `TodayDetailClient`**

In `src/components/seller/today/TodayDetailClient.tsx`, add the desktop-breakpoint state (same pattern as `EntitySplitShell`) and branch the multi-item body:

```tsx
import { useEffect } from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
```

Add inside the component, alongside the other `useState` calls:

```tsx
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    setIsDesktop(query.matches);
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
```

Replace the body's rendering block (`<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6">...</div>`) with a branch:

```tsx
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {singleItem || !isDesktop === false ? null : null}
        {singleItem ? (
          <TodayEntryCard
            entry={buyerEntries[0]}
            expanded
            onToggle={() => {}}
            tenantId={tenantId}
            applyLocalAction={applyLocalAction}
          />
        ) : isDesktop ? (
          <div className="space-y-4">
            {buyerEntries.map((entry) => (
              <TodayEntryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                tenantId={tenantId}
                applyLocalAction={applyLocalAction}
              />
            ))}
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={expandedId ?? undefined}
            onValueChange={(value) => setExpandedId(value || null)}
          >
            {buyerEntries.map((entry) => (
              <AccordionItem key={entry.id} value={entry.id}>
                <AccordionTrigger aria-label={entry.summary}>{entry.summary}</AccordionTrigger>
                <AccordionContent>
                  <TodayActionBar entry={entry} tenantId={tenantId} applyLocalAction={applyLocalAction} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
```

Remove the now-redundant `{singleItem || !isDesktop === false ? null : null}` placeholder line — it was left in the diff above only to mark where the old unconditional `.map` block was; delete it, the three real branches (`singleItem` / `isDesktop` / mobile accordion) are what ships.

Add the `TodayActionBar` import (already imported by `TodayEntryCard` internally, but the accordion branch calls it directly, so import it here too):

```tsx
import { TodayActionBar } from './TodayActionBar';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/run-vitest.mjs run src/tests/today-detail-client-mobile.test.tsx src/tests/today-detail-client.test.tsx`
Expected: PASS (3 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/components/seller/today/TodayDetailClient.tsx src/tests/today-detail-client-mobile.test.tsx
git commit -m "feat(inbox): render mobile detail pane as accordion with per-item CTAs"
```

---

## Task 15: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Run the full new test suite**

Run: `node scripts/run-vitest.mjs run src/tests/today-grouping.test.ts src/tests/today-local-actions.test.ts src/tests/today-confirm-prefs.test.ts src/tests/today-entries-hook.test.tsx src/tests/seller-sidebar-today-nav.test.tsx src/tests/today-list-client.test.tsx src/tests/today-confirm-dialog.test.tsx src/tests/today-action-bar.test.tsx src/tests/today-history-sheet.test.tsx src/tests/today-detail-client.test.tsx src/tests/today-detail-client-mobile.test.tsx src/tests/entries-buyer-events-api.test.ts src/tests/entries-count-api.test.ts`
Expected: all PASS

- [ ] **Step 2: Run lint across the changed files**

Run: `npm run lint`
Expected: no new errors

- [ ] **Step 3: Start the dev server and open `/today`**

Start the dev server, sign in as a seller (or seller assistant) on a tenant with some `app.entries` rows (real invoices/orders/approvals that the sync triggers have already generated, or seed a few rows directly via the `app.upsert_entry` RPC for a test tenant). Navigate to `/today`.

Verify against the mockups and design doc:
- List pane ~30% width, date sections (Today/Yesterday/This Week/...), customer rows with count bubbles only when >1.
- Filter chips (Approvals/Enquiries/Orders/Collections) narrow the list without dropping the date-section structure.
- Selecting a single-item customer shows that item directly, already expanded.
- Selecting a multi-item customer shows a collapsed card stack; clicking one expands it and collapses any other.
- Pinned (severity-tier) cards for `credit_limit_breach`/high-tier `invoice_overdue` show the small corner marker and sort above newer cards.
- "Show history" is a subtle text link (not a bordered button); opens the History sheet with a merged, newest-first timeline.
- "View {name}" opens a right-side Sheet, not a page navigation.
- Prev/Next buttons are visually prominent and move between customers.
- Taking a type-specific action (e.g. Accept order) updates the UI immediately with no network tab activity to `/actions`; taking Remind Later does hit the network.
- Declining/Rejecting shows the confirm dialog; checking "Don't ask me again" and confirming once suppresses the dialog on a second attempt in the same browser.
- Resize below 768px (or use browser device emulation): layout collapses to full-screen list ↔ detail; a multi-item customer renders as an accordion with inline per-item action buttons.
- Needs-attention tab with zero entries (filter to a type with none, or a fully-resolved test tenant) shows the calm empty state, not a blank screen.

- [ ] **Step 4: Take a screenshot of the desktop split-pane view and the mobile accordion view for the record**

Use the project's browser tooling to capture both states (desktop `/today/[buyerId]` with an expanded card, and a ~390px-wide view of the same route with the accordion open) and share them.

---

## Self-Review Notes

- **Spec coverage:** date grouping/placement (§11, §11.4) → Task 3; pin/severity (§5.3, §11, open question §17.6) → Task 3 + Task 13; filter chips keep date grouping (§18.9 open question, resolved per your answer) → Task 8; card stack single-expansion (§5.3) → Task 13/14; History merged timeline (§5.3, §13) → Task 11; destructive-action confirm (§17.8, resolved per your answer) → Task 9/10; remind-later (§12) → Task 10; empty state (§15) → Task 8; nav badge (§6) → Task 2/6; mobile stacked/accordion behavior (your feedback) → Task 14; desktop header controls relabeled/repositioned (your feedback) → Task 13; roomy detail-pane spacing (your feedback) → Task 13 (`px-5 py-4`/`px-6 py-6`, larger than the reference mock's tighter spacing, consistent with existing `rounded-[16px]`/`rounded-[12px]` card conventions already in the app).
- **Placeholder scan:** none found — every step has real, complete code.
- **Type consistency:** `TodayEntry`/`TodayEntryStatus`/`TodayGroupedBuyer` (Task 3) are the single source of truth referenced identically by Tasks 5, 8, 10, 11, 13, 14. `applyLocalAction`'s signature is identical everywhere it's threaded through (Task 4 defines it, Tasks 10/13/14 consume it unchanged). `ACTION_LABELS` is defined once in Task 10 and imported (not redefined) by Task 11.
