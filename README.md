# yukti — Distributor Command Center

**Status:** Project scaffolding (Week 0)

yukti is a multibrand distributor's command center: manage catalogs from 5-15 brands, publish cohort-specific pricing to retailers, capture orders via a buyer PWA. Built for Indian SMB multibrand distributors.

## Tech Stack

- **Framework:** Next.js (App Router) + React + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Validation:** Zod (shared client + server)
- **Backend:** Supabase (Postgres + RLS + Auth)
- **Business Logic:** Postgres RPCs/functions
- **Search:** PostgreSQL full-text + pgvector
- **File Storage:** Cloudflare R2
- **Analytics:** PostHog (product analytics + feature flags)
- **Hosting:** Vercel

## Project Structure

```
yukti/
├── app/                          # Next.js App Router
├── src/
│   ├── components/              # Reusable UI components
│   ├── lib/                     # Utilities (Supabase, Zod schemas)
│   ├── hooks/                   # React hooks
│   ├── contexts/                # React contexts
│   ├── types/                   # TypeScript types
│   └── constants/               # Feature flags, roles, etc.
├── supabase/
│   ├── migrations/              # SQL migrations
│   └── functions/               # Edge functions
├── public/                      # Static assets
├── CLAUDE.md                    # Project guidelines & architecture
└── .env.example                 # Environment variables template
```

## Quick Start

### Prerequisites
- Node.js >= 18
- npm or bun

### Setup
```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Set up Supabase:
# 1. Create project at supabase.com
# 2. Add credentials to .env.local
# 3. Run migrations from supabase/migrations/

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Architecture

### Three Postgres Schemas

| Schema | Purpose |
|--------|---------|
| `auth` | Supabase-managed user identity |
| `catalog` | Master brands, products, categories (reusable across tenants) |
| `app` | Tenant business data (RLS-enforced per tenant) |

### Tenancy Model
- **Tenant = Distributor.** One business = one tenant (`{slug}.yukti.so`)
- **Buyers belong inside a tenant** — not tenants themselves
- One auth user can link to multiple buyers across multiple tenants

### RBAC: Four Roles
| Role | Type | Capabilities |
|------|------|--------------|
| `seller_admin` | Distributor | Full access (all operations) |
| `seller_assistant` | Distributor | Brands, products, customers, cohorts, catalogs, orders |
| `buyer_admin` | Buyer | Browse catalogs, place orders, manage own buyers |
| `buyer_assistant` | Buyer | Browse catalogs, place orders (submit for approval) |

### Feature Flags (PostHog)
Every major feature ships behind a feature flag (`df_<module>`). Default off until tenant pilot passes.

**Modules:** `tenant_onboarding`, `brand_product_master`, `customer_master`, `cohorts`, `pricing_engine`, `catalog_publishing`, `buyer_app`, `order_management`, `search`, `tally_export`, `zoho_integration`

## MVP Scope (12 weeks)

### Must Ship
1. Tenant onboarding + subdomain routing
2. Brand & Product master (CRUD + CSV import + R2 images)
3. Customer (Buyer) Master (CRUD + CSV import)
4. Cohort builder (rule-based + static lists + preview)
5. Custom pricing per cohort + `resolve_price()` RPC
6. Catalog publishing (draft → publish → share_token)
7. **Buyer PWA** (WhatsApp OTP, catalog browse, cart, order placement)
8. Distributor cockpit (orders, status workflow, invoice export)
9. Tally CSV export (Item Master, Sales Voucher, Ledger Master CSVs)
10. Zoho Books/Inventory integration (piloted on WineYard)
11. PostgreSQL full-text + pgvector search

### Defer (Phase 2+)
AI multimodal intake, replenishment forecasting, payment reconciliation, live Tally/Busy API, returns management, trade promotions, brand dashboards, Typesense, webhooks.

## Development Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
npm run type-check # TypeScript check
```

## Key Files

- **[CLAUDE.md](./CLAUDE.md)** — Architecture, workflow rules, build sequence
- **[.env.example](./.env.example)** — Required environment variables
- **[supabase/migrations/](./supabase/migrations/)** — Database schemas & functions
- **[src/constants/index.ts](./src/constants/index.ts)** — Roles, feature flags, enums
- **[src/lib/zod.ts](./src/lib/zod.ts)** — Shared Zod validation schemas

---

For full architecture & workflow rules, see [CLAUDE.md](./CLAUDE.md).
