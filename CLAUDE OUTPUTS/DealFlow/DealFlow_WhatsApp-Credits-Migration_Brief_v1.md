# Claude Code prompt — WhatsApp credits & plan-allowance schema

Paste this into Claude Code in the `dealflow` repo. It describes the final expected state, not a step-by-step migration script — identify the minimal diff against what already exists in `supabase/migrations/` and generate only the migration(s) needed to reach this state.

---

## Context

None of the tables/columns below exist yet in any migration — confirmed by grep against `supabase/migrations/`. This is new schema, not an edit to something live. Build via `supabase migration new <name>` per this repo's CLAUDE.md convention (never hand-name migration files), and qualify every table with the `app.` schema explicitly.

Reference spec: `CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md`, §4.6 and §11.

## Final expected state

### `app.tenants` — new columns

```sql
whatsapp_plan_allowance_balance numeric(12,2) NOT NULL DEFAULT 0
whatsapp_plan_allowance_reset_at timestamptz NULL
whatsapp_purchased_credits_balance numeric(12,2) NOT NULL DEFAULT 0
whatsapp_credits_purchased numeric(12,2) NOT NULL DEFAULT 0
```

- `whatsapp_plan_allowance_balance`: current billing cycle's free credits remaining. Reset (hard-set, not additive) to the tenant's plan-tier `monthly_credit_allowance` on each billing-cycle anniversary. Never rolls over.
- `whatsapp_plan_allowance_reset_at`: timestamp of the last reset for this tenant. Drives the reset job's idempotency (a tenant is due for reset once `now() - whatsapp_plan_allowance_reset_at >= interval '1 month'`, anchored to their actual billing cycle date, not calendar month).
- `whatsapp_purchased_credits_balance`: spendable balance from top-ups and manually-granted credits (e.g. referral bonuses, granted via direct DB update by ops — no UI for this in MVP). Never expires, never reset.
- `whatsapp_credits_purchased`: lifetime total ever topped up, for reporting/LTV. Never decremented.

### `app.whatsapp_plan_credit_tiers` — new table

```sql
CREATE TABLE app.whatsapp_plan_credit_tiers (
  plan_tier text PRIMARY KEY CHECK (plan_tier IN ('lite','starter','growth','scale')),
  monthly_credit_allowance numeric(10,2) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
```

Seed data:

| plan_tier | monthly_credit_allowance |
|---|---|
| lite | 1000 |
| starter | 2000 |
| growth | 4000 |
| scale | 7500 |

### `app.whatsapp_credit_pricing` — new table

```sql
CREATE TABLE app.whatsapp_credit_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_price_inr numeric(6,4) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
```

Seed one row: `credit_price_inr = 0.20`.

### `app.whatsapp_rate_card` — new table

```sql
CREATE TABLE app.whatsapp_rate_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_category text UNIQUE NOT NULL CHECK (meta_category IN ('marketing','utility','authentication')),
  meta_cost_inr numeric(10,4) NOT NULL,
  credits_per_message numeric(5,2) NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
```

Seed data:

| meta_category | meta_cost_inr | credits_per_message |
|---|---|---|
| marketing | 0.8631 | 6 |
| utility | 0.1150 | 1 |
| authentication | 0.1150 | 1 |

### `app.whatsapp_credit_transactions` — new table

```sql
CREATE TABLE app.whatsapp_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('topup','debit','refund','adjustment','plan_allowance_reset')),
  credits numeric(12,2) NOT NULL,
  balance_source text NOT NULL CHECK (balance_source IN ('plan_allowance','purchased')),
  inr_amount numeric(12,2),
  balance_after numeric(12,2) NOT NULL,
  related_message_id uuid NULL REFERENCES app.whatsapp_messages(id) ON DELETE RESTRICT,
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX idx_whatsapp_credit_transactions_tenant_id ON app.whatsapp_credit_transactions(tenant_id);
CREATE INDEX idx_whatsapp_credit_transactions_related_message_id ON app.whatsapp_credit_transactions(related_message_id);
```

Note: `related_message_id` references `app.whatsapp_messages(id)`, which must already exist per §4 of the spec (built earlier in this feature's implementation sequence). If it doesn't exist yet in this codebase, create this FK as deferred/nullable-only until that table lands, or sequence this migration after it — don't stub a fake table.

### `app.debit_whatsapp_credits` — new `SECURITY DEFINER` RPC

Behavior (not exact SQL — implement per this repo's existing RPC patterns, e.g. `app.resolve_price`):

1. Given a `whatsapp_message_id`, look up its Meta category and resolve `credits_per_message` from `app.whatsapp_rate_card`.
2. Debit that many credits from the tenant's `whatsapp_plan_allowance_balance` first.
3. If the allowance balance is insufficient, spill the remainder into `whatsapp_purchased_credits_balance`.
4. Write one `app.whatsapp_credit_transactions` row per balance touched (i.e. up to two rows if the debit spans both buckets), each tagged with the correct `balance_source`, `credits` (negative), `inr_amount` (computed from `app.whatsapp_credit_pricing.credit_price_inr`), and `balance_after` (post-debit snapshot of that specific bucket).
5. Stamp `billed_amount` and any transaction-reference column on the `app.whatsapp_messages` row.
6. All of the above in one transaction, called at message dispatch time (not on delivery webhook) — same transaction as the send-queue pop, per §4.6/§5 of the spec.
7. Pre-flight balance check (used before this RPC runs, at broadcast composition time): `whatsapp_plan_allowance_balance + whatsapp_purchased_credits_balance >= estimated_credit_cost`.

### `app.reset_whatsapp_plan_allowances` — new scheduled function

- Runs daily via `pg_cron` (per this repo's existing background-job pattern).
- Finds tenants where `now() - whatsapp_plan_allowance_reset_at >= interval '1 month'` (or `whatsapp_plan_allowance_reset_at IS NULL`, for first-ever reset).
- For each: hard-sets `whatsapp_plan_allowance_balance` to that tenant's `app.whatsapp_plan_credit_tiers.monthly_credit_allowance` (looked up via the tenant's current plan tier — do not add to the existing balance, overwrite it; unused prior-cycle allowance is forfeited).
- Logs one `app.whatsapp_credit_transactions` row per tenant reset, `transaction_type = 'plan_allowance_reset'`, `balance_source = 'plan_allowance'`, `inr_amount = NULL`.
- Updates `whatsapp_plan_allowance_reset_at = now()`.

## Explicitly out of scope for this migration

- No referral-bonus schema, ledger entry type, or UI. Referral credit grants are a manual `UPDATE app.tenants SET whatsapp_purchased_credits_balance = ...` by ops, logged as an `adjustment` transaction if you want an audit trail, but no dedicated feature.
- No tenant-facing UI for any of this in this task — schema and RPC only. UI work (balance display, low-balance warnings, top-up flow) is separate.
- No changes to `app.whatsapp_messages`, `app.whatsapp_broadcasts`, or `app.whatsapp_templates` beyond whatever FK/column this migration requires to reference them — those tables are scoped in earlier phases of the spec (§4.1-4.5) and may or may not already exist in this codebase; check before assuming.

## Verification

After migration:
1. `supabase migration list` shows the new migration applied.
2. Seed data present: 4 rows in `whatsapp_plan_credit_tiers`, 1 row in `whatsapp_credit_pricing` (0.20), 3 rows in `whatsapp_rate_card` (marketing/utility/authentication with the values above).
3. Cross-tenant isolation test: confirm RLS prevents tenant A's session from reading/writing tenant B's `whatsapp_plan_allowance_balance` or `whatsapp_purchased_credits_balance` via `app.tenants`.
4. `app.debit_whatsapp_credits` is `SECURITY DEFINER`, and role is double-checked inside the function body per this repo's RBAC convention (§ RBAC in CLAUDE.md), not left to RLS alone.
