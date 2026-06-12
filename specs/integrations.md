# Integrations Architecture

## Overview

The integrations system enables tenants to connect DealFlow to external tools (Zoho Books, Zoho Inventory, Tally Prime, Busy) for bidirectional data exchange. It has three layers:

1. **Credential management** — secure, per-tenant API token storage
2. **Sync engine** — phased initial import + ongoing incremental sync
3. **Frontend** — setup wizard, progress tracking, data flow configuration

---

## 1. Database Schema

### 1.1 Credential Storage — Supabase Vault

API tokens are **never stored in plain text**. Use `vault.secrets` (Supabase's built-in `pgsodium`-backed secret store). The application stores only the `secret_id` UUID in `app.tenant_integrations`, and retrieves the actual credential inside a `SECURITY DEFINER` function that never surfaces it to the client.

```sql
-- Storing credentials (called from a SECURITY DEFINER RPC only)
SELECT vault.create_secret(
  $1::text,               -- JSON blob: {"client_id":"...", "client_secret":"..."}
  'zoho_' || tenant_id    -- secret name for lookup
) INTO v_secret_id;
```

### 1.2 `catalog.integration_types` — Seed Data (Static Lookup)

Defines available integration types. Adding a new integration is a row insert + a new Edge Function handler — no core code changes.

```sql
CREATE TABLE catalog.integration_types (
  id                text PRIMARY KEY,
  display_name      text NOT NULL,  -- 'zoho_books', 'zoho_inventory', 'tally_prime', 'busy'
  description       text,
  logo_url          text,
  -- Describes what credential fields to collect in the UI wizard
  auth_schema       jsonb NOT NULL,
  -- What this integration can do
  capabilities      jsonb NOT NULL,
  -- 'cloud' or 'local' — local integrations need a bridge agent (Tally, Busy)
  connectivity_mode text NOT NULL DEFAULT 'cloud',
  is_active         boolean NOT NULL DEFAULT true
);
```

**`auth_schema` example for Zoho:**
```json
{
  "oauth": false,
  "fields": [
    { "key": "client_id",     "label": "Client ID",      "type": "text",     "required": true,  "help": "From Zoho API Console → Self Client" },
    { "key": "client_secret", "label": "Client Secret",  "type": "password", "required": true  },
    { "key": "refresh_token", "label": "Refresh Token",  "type": "password", "required": true,  "help": "Generate via Zoho OAuth Playground" },
    { "key": "org_id",        "label": "Organization ID","type": "text",     "required": true,  "help": "Zoho Books → Settings → Organization Profile" }
  ]
}
```

**`capabilities` example:**
```json
{
  "inbound_reference":     ["brands", "products", "customers"],
  "inbound_transactional": ["orders", "invoices"],
  "outbound_reference":    ["products", "customers"],
  "outbound_transactional":["orders"],
  "webhooks":              true
}
```

**Seeded integration types:**
| id | display_name | connectivity_mode |
|---|---|---|
| `zoho_books` | Zoho Books | cloud |
| `zoho_inventory` | Zoho Inventory | cloud |
| `tally_prime` | Tally Prime | local (bridge required) |
| `busy` | Busy Accounting | local (bridge required) |

### 1.3 `app.tenant_integrations` — Per-Tenant Integration Config

```sql
CREATE TABLE app.tenant_integrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  integration_type_id   text NOT NULL REFERENCES catalog.integration_types(id),
  status                text NOT NULL DEFAULT 'pending_setup',
  -- Constraint: status IN ('pending_setup','connected','syncing','sync_failed','disconnected')

  -- Vault reference — the only credential data stored here
  vault_secret_id       uuid,

  -- Non-sensitive config: org_id, base_url, timezone, sync_start_date
  config                jsonb NOT NULL DEFAULT '{}',

  -- When we last verified credentials were valid
  last_health_check_at  timestamptz,
  health_status         text,  -- 'ok' | 'expired' | 'invalid'

  connected_at          timestamptz,
  connected_by          uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id),
  updated_by            uuid REFERENCES auth.users(id),
  deleted_at            timestamptz,
  external_ref          text,

  UNIQUE (tenant_id, integration_type_id)  -- one integration of each type per tenant
);
```

### 1.4 `app.integration_sync_jobs` — Sync Run Tracking

Every import/sync run creates a row here. The frontend polls this to show progress.

```sql
CREATE TABLE app.integration_sync_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES app.tenants(id),
  tenant_integration_id   uuid NOT NULL REFERENCES app.tenant_integrations(id),

  job_type    text NOT NULL,
  -- 'initial_reference'     → Phase 1: brands, products, customers
  -- 'initial_transactional' → Phase 2: past 90 days of orders/invoices
  -- 'incremental'           → scheduled ongoing sync
  -- 'manual'                → user-triggered refresh

  status      text NOT NULL DEFAULT 'queued',
  -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

  -- Granular progress for the progress bar
  progress    jsonb NOT NULL DEFAULT '{}',
  -- {
  --   "phase": "brands",
  --   "phase_label": "Importing brands...",
  --   "phases_total": 5,
  --   "phase_current": 2,
  --   "items_total": 1240,
  --   "items_processed": 318,
  --   "items_failed": 2
  -- }

  error_log   jsonb,  -- array of {timestamp, entity_type, external_id, error}
  summary     jsonb,  -- written on completion: {brands: 42, products: 1200, customers: 87, ...}

  started_at    timestamptz,
  completed_at  timestamptz,
  triggered_by  uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 1.5 `app.integration_entity_map` — External ↔ Internal ID Registry

Maps every synced entity to its DealFlow internal ID. Essential for deduplication and for pushing updates back out.

```sql
CREATE TABLE app.integration_entity_map (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id),

  entity_type   text NOT NULL,  -- 'brand' | 'product' | 'customer' | 'order' | 'invoice'
  external_id   text NOT NULL,  -- ID from the external system
  internal_id   uuid NOT NULL,  -- DealFlow record UUID

  last_synced_at   timestamptz,
  sync_status      text,  -- 'synced' | 'pending_push' | 'conflict' | 'error'
  external_hash    text,  -- hash of the external record for change detection

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, tenant_integration_id, entity_type, external_id)
);

CREATE INDEX ON app.integration_entity_map (tenant_id, entity_type, internal_id);
```

### 1.6 `app.integration_data_flows` — Ongoing Sync Rules

After initial import, tenants configure which data flows in which direction.

```sql
CREATE TABLE app.integration_data_flows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id),

  entity_type   text NOT NULL,  -- 'products' | 'customers' | 'orders' | 'invoices'
  direction     text NOT NULL,  -- 'inbound' | 'outbound' | 'bidirectional'

  trigger_type  text NOT NULL,  -- 'webhook' | 'scheduled' | 'event'
  -- For 'scheduled': cron expression
  schedule      text,
  -- For 'webhook': registered webhook endpoint token
  webhook_id    uuid REFERENCES app.integration_webhooks(id),

  -- Field-level mapping overrides (optional, advanced)
  field_mappings  jsonb DEFAULT '{}',
  -- Filters applied before sync (e.g., only orders in delivered status)
  filters         jsonb DEFAULT '{}',

  is_active     boolean NOT NULL DEFAULT true,
  last_run_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id)
);
```

### 1.7 `app.integration_webhooks` — Inbound Webhook Endpoints

```sql
CREATE TABLE app.integration_webhooks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id),

  -- Webhook URL: /api/webhooks/{endpoint_token}
  endpoint_token  uuid NOT NULL DEFAULT gen_random_uuid(),
  event_types     text[] NOT NULL,

  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

---

## 2. Backend Architecture

### 2.1 Edge Functions

```
supabase/functions/
├── integrations-connect/        # Validate + store credentials
├── integrations-test/           # Verify connectivity without saving
├── integrations-sync/           # Enqueue or run a sync job
├── integrations-sync-worker/    # Job runner (called by pg_cron)
├── integrations-webhook/        # Receive inbound webhook events
└── adapters/
    ├── zoho-books.ts
    ├── zoho-inventory.ts
    ├── tally-prime.ts           # Proxies to local Tally bridge
    └── busy.ts                  # Proxies to local Busy bridge
```

### 2.2 Sync Job Lifecycle

```
User clicks "Start Import"
    │
    ▼
integrations-sync (Edge Fn)
  → Creates integration_sync_jobs row (status: queued)
  → Returns job_id to frontend immediately
    │
    ▼
pg_cron picks up queued jobs every 60s
  → Calls integrations-sync-worker
    │
    ▼
integrations-sync-worker
  Phase 1 — Reference Data
    → Adapter.fetchBrands()    → upsert catalog/tenant_brands
    → Adapter.fetchProducts()  → upsert tenant_products
    → Adapter.fetchCustomers() → upsert buyers
    → Update progress JSONB after each batch (for real-time UI polling)

  Phase 2 — Transactional Data (last 90 days)
    → Adapter.fetchOrders(since: now()-90d)  → upsert orders + order_items
    → Adapter.fetchInvoices(since: now()-90d)
    → Update progress JSONB after each page

  On completion → update status: 'completed', write summary JSONB
  On error      → update status: 'failed', append to error_log
```

**Edge Function timeout constraint:** Supabase Edge Functions have a 150s wall-clock limit. For large datasets, use cursor-based pagination — each invocation processes one page and re-enqueues itself via `pg_cron` or a recursive pg_net call. Store the cursor position in `progress.cursor`.

### 2.3 `integrations-connect` Function

```typescript
// Pseudocode — actual implementation in adapter
export default async (req) => {
  const { tenant_id, integration_type_id, credentials } = await req.json();

  // 1. Test connectivity with provided credentials
  const adapter = getAdapter(integration_type_id);
  const testResult = await adapter.testConnection(credentials);
  if (!testResult.ok) return error(400, testResult.error);

  // 2. Store credentials in Vault (service role only)
  const secret_id = await storeInVault(
    JSON.stringify(credentials),
    `${integration_type_id}_${tenant_id}`
  );

  // 3. Upsert tenant_integrations record
  await supabase.schema('app')
    .from('tenant_integrations')
    .upsert({
      tenant_id, integration_type_id,
      vault_secret_id: secret_id,
      status: 'connected',
      connected_at: new Date().toISOString(),
      config: testResult.meta  // org_name, etc. from test call
    });

  return { ok: true };
}
```

### 2.4 Adapter Interface

Every integration adapter implements the same interface. Adding Busy or any future ERP is just implementing this contract:

```typescript
interface IntegrationAdapter {
  // Validate credentials
  testConnection(credentials: Record<string, string>): Promise<{ ok: boolean; meta?: object; error?: string }>;

  // Reference data
  fetchBrands(cursor?: string): Promise<PagedResult<Brand>>;
  fetchProducts(cursor?: string): Promise<PagedResult<Product>>;
  fetchCustomers(cursor?: string): Promise<PagedResult<Customer>>;

  // Transactional data
  fetchOrders(since: Date, cursor?: string): Promise<PagedResult<Order>>;
  fetchInvoices(since: Date, cursor?: string): Promise<PagedResult<Invoice>>;

  // Outbound push
  pushOrder(order: Order): Promise<{ external_id: string }>;
  pushCustomer(customer: Customer): Promise<{ external_id: string }>;

  // Webhook registration (if supported)
  registerWebhook?(url: string, events: string[]): Promise<{ id: string }>;
}
```

### 2.5 Local Integration Constraint (Tally, Busy)

Tally and Busy run **on-premise** and expose an XML/HTTP API on `localhost:9000` (Tally) or similar. They are **not cloud-reachable** by default.

Two options:
1. **DealFlow Bridge Agent** — a lightweight desktop app (Electron or Go binary) installed on the customer's machine that authenticates to DealFlow and forwards data. This is the recommended path for SMB customers.
2. **Ngrok/Cloudflare Tunnel** — power users expose their local instance. Not recommended for production.

Flag `connectivity_mode: 'local'` in `integration_types` drives the UI to show a "Download Bridge Agent" step in the setup wizard for these integrations. The bridge agent handles auth with DealFlow via a tenant-scoped API token, not raw Supabase credentials.

---

## 3. Frontend Architecture

### 3.1 Route

```
/settings/integrations            ← Integration catalog (list of available types)
/settings/integrations/[id]       ← Detail panel for a connected integration
```

### 3.2 Settings > Integrations — Catalog View

```
┌─────────────────────────────────────────────────────────────────┐
│  Integrations                                                    │
│  Connect your accounting and ERP tools                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Zoho Books   │  │ Zoho Inventory│  │ Tally Prime  │          │
│  │              │  │              │  │              │          │
│  │ ● Connected  │  │  Not set up  │  │  Not set up  │          │
│  │ Last sync 2h │  │              │  │  Needs Bridge│          │
│  │ [Manage]     │  │ [Connect]    │  │ [Connect]    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Setup Wizard (Dialog — 4 steps)

**Step 1: What you'll get**
- List of data that will be imported (brands, products, customers, 90-day orders)
- Estimated time to complete initial sync

**Step 2: Connect**
- Dynamic form rendered from `auth_schema.fields`
- Password fields masked, help text from schema
- "Where do I find this?" expandable for each field
- For `connectivity_mode: 'local'`: replace with "Download Bridge Agent" button

**Step 3: Test Connection**
- Calls `integrations-test` Edge Function
- Shows success (org name, item counts from external system) or specific error

**Step 4: Start Import**
- Shows what will be synced and in what order
- Date picker: "Import orders since [date, default 90 days ago]"
- "Start Import" button → triggers sync job → closes wizard, opens detail panel

### 3.4 Integration Detail Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Integrations   Zoho Books                             ● Connected     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  INITIAL IMPORT                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ ████████████████████████░░░░░░░░  64%  Importing products...    │    │
│  │ Phase 2 of 2 · 812 of 1,240 items · 2 errors                    │    │
│  │ [View errors]                                              [Cancel]│  │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  SYNC SUMMARY (after completion)                                         │
│  42 brands · 1,240 products · 89 customers · 318 orders                 │
│                                                                          │
│  DATA FLOWS                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Entity       Direction      Trigger          Status              │    │
│  │ Products     ← Inbound      Daily at 2am     Active ●            │    │
│  │ Customers    ← Inbound      Daily at 2am     Active ●            │    │
│  │ Orders       → Outbound     On status change Active ●            │    │
│  │ Invoices     ← Inbound      Webhook          Active ●            │    │
│  │                                              [+ Add flow]        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  SYNC HISTORY                                                            │
│  ● Today 14:22   Incremental   Completed   128 records                  │
│  ● Today 08:00   Incremental   Completed   34 records                   │
│  ● Yesterday     Initial       Completed   1,691 records                │
│                                                                          │
│  [Trigger Manual Sync]   [Reconnect]   [Disconnect]                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Real-time Progress Polling

The frontend polls `app.integration_sync_jobs` every 3 seconds while a job is `running`. Use a React Query polling query:

```typescript
const { data: job } = useQuery({
  queryKey: ['sync-job', jobId],
  queryFn: () => supabase.schema('app').from('integration_sync_jobs')
    .select('status, progress, error_log')
    .eq('id', jobId)
    .single(),
  refetchInterval: (data) =>
    ['queued', 'running'].includes(data?.status) ? 3000 : false,
});
```

The progress bar is driven by `progress.items_processed / progress.items_total`. Phase label comes from `progress.phase_label`.

### 3.6 Data Flow Configuration (Add Flow Dialog)

Users configure ongoing data sync after the initial import is done. Each flow is a row in `integration_data_flows`.

```
┌─────────────────────────────────────────────────────────────────┐
│ Configure Data Flow                                              │
│                                                                  │
│  What data?         [Orders ▾]                                  │
│  Direction?         (●) Push orders to Zoho                     │
│                     ( ) Pull orders from Zoho                   │
│  When?              (●) On status change in DealFlow            │
│                     ( ) Daily schedule  [2:00 AM ▾]             │
│                     ( ) On webhook from Zoho                    │
│  Which statuses?    [✓] Confirmed  [✓] Dispatched  [ ] Draft    │
│                                                                  │
│  [Cancel]                                    [Save Flow]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Feature Flag Gating

The integrations module is already scoped under `df_zoho_integration` in the feature flag list. Extend it:

| Flag | Scope |
|---|---|
| `df_zoho_integration` | Zoho Books + Inventory — WineYard pilot first |
| `df_tally_integration` | Tally Prime — gated until bridge agent is ready |
| `df_busy_integration` | Busy — gated |

Gate both the Settings sidebar nav item and the individual integration type cards. The UI shows "Coming soon" cards for ungated types so tenants know what's on the roadmap.

---

## 5. Security Rules

- **RLS on all `app.integration_*` tables**: `tenant_id = (jwt->>'tenant_id')::uuid`
- **Vault access only via SECURITY DEFINER RPCs**: no client can read `vault_secret_id` contents directly
- **Credentials never logged**: Edge Functions must scrub credential fields before any logging
- **Webhook endpoint tokens are opaque UUIDs**: not derivable from tenant or integration IDs
- **Health checks on every sync**: if the Vault secret retrieval fails (e.g., token revoked), set `health_status = 'expired'` and surface a re-auth prompt in the UI

---

## 6. Build Sequence

| Week | Work |
|---|---|
| Wk 9 (current) | Schema migrations, RLS, Vault integration, `integration_types` seed |
| Wk 10 | `integrations-connect` + `integrations-test` Edge Functions, Zoho adapter |
| Wk 10 | Settings > Integrations UI — catalog + setup wizard |
| Wk 11 | Sync worker + pg_cron, progress tracking, initial import flow |
| Wk 11 | Integration detail panel + sync history |
| Wk 12 | Data flow configuration UI, outbound push (orders to Zoho) |
| Post-MVP | Bridge agent for Tally/Busy, webhook inbound, field-level mapping UI |
