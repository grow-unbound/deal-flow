# DealFlow (Yukti) — WhatsApp Broadcast Capability — Spec v3

**Module:** Multi-tenant WhatsApp Broadcast + Consumption Metering + Markup Billing
**Date:** 2026-07-02 | **For:** Phani | **Audience:** Solo-founder build plan, extends `DealFlow_Product-Spec_v1.md` and `DealFlow_Settings-Spec_v3.md`

**v2 changelog (from customer-validated scope cut):** dropped AR/ledger and beat-route tables entirely for MVP — geography filtering on existing `app.buyers.geography` covers targeting; overdue-payment reminder use case deferred (no data source yet, not simulated); wallet billing simplified to synchronous deduct-on-send with hard block-on-empty, no async Meta-webhook cost reconciliation dependency; markup reframed as the price of *targeting convenience*, not the broadcast infrastructure itself; added implied opt-in-at-first-login consent mechanism; broadcast repositioned as an early acquisition/stickiness feature, not a deferred post-MVP add-on — this is now informed by direct customer pull ("even with 100 features, this is what we'd use daily"), not a hypothesis.

**v3 changelog (implementation-detail corrections from you):** shared number confirmed as the model, per-tenant "WhatsApp Business Number" field repurposed as a buyer-facing callback/contact number, not a WABA (§3.1a); provider is direct Meta Cloud API, no BSP, `AISEMSY_AUTH_TOKEN` is dead weight to remove (§3.2); payment-reminder (use case #1) is **back in scope** — `app.invoices` already exists with real AR data (§3.3, §4.4); templates are entirely platform-managed by you, no tenant self-serve template submission for MVP (§4.1); broadcast job table renamed `app.whatsapp_broadcasts` to avoid clashing with "Campaigns" terminology, `linked_campaign_id` replaces `linked_catalog_id` (§4.2); wallet fields fold into `app.tenants` directly rather than a separate wallet table (§4.6); opt-outs now surfaced proactively in the Customers UI, not just filtered silently at send time, and the 1-marketing-message/buyer/day cap is a hard rule, not a recommendation (§7.2); added tenant-facing quality-rating communication design (§7.3); resolved UI placement — Customers-page CTA over a dedicated nav route for MVP (§9); consent design finalized — explicit checkbox for buyers, implicit for seller users (§4.8). **Two factual flags from checking the actual codebase, not assumed** — see the callouts in §3.3 and §4.6.

---

## 0. Answering the group-messaging question first

You asked: *can generic marketing messages go to a distributor's existing WhatsApp group instead of individual buyers, if they add Yukti's number to that group?*

**No — not at any usable scale.** I checked Meta's current developer documentation directly (not memory). Meta does have a "Groups API" on the WhatsApp Business Platform now, but it is not what it sounds like:

- It requires an **Official Business Account (OBA)** — a higher verification bar than standard Business verification.
- Groups **must be created by your business through the API** — you cannot join or message into a group a distributor already built manually on their own WhatsApp Business App. The invite-link flow is one-way: you create the group, you invite people in.
- **Max 8 participants per group.** A distributor's route or city WhatsApp group is typically 50–300 retailers. This limit alone kills the use case.
- Groups are **not available at all** on WhatsApp Business App numbers or numbers onboarded via Multi-solution Conversations — i.e. exactly the kind of shared number Yukti is planning to run.
- Template messages sent in groups don't get performance metrics, and you're pushed to build separate templates for group use.

So: the distributor's existing WhatsApp groups are a dead end for programmatic broadcast — Meta does not let a Business Platform number "sit inside" a consumer-created group and blast to it, at any tier. **Individual (1:1) template broadcast to each buyer's phone number is the only compliant path**, and it's what the rest of this spec is built around. This is worth saying plainly to distributors when you sell this: "we message each retailer directly, not the group," which is actually a *feature* — it's trackable, it's opt-in-able, and it doesn't get lost in group noise.

Sources: [Groups API overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups), [Group messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging), [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).

---

## 1. Product thesis

This isn't a hypothesis anymore — early customers told you directly that buyer engagement/communication is what they'd use daily, ahead of catalogs, cohorts, or pricing, even though those are the deeper value proposition. That reframes the feature's job: **it's the low-friction front door, not a side revenue line.** Distributors already have WhatsApp groups for beat-route reminders and stock alerts — informal, unstructured, no read receipts, no targeting, no record. DealFlow's edge isn't "we also send WhatsApp messages" — it's **structured, targeted, trackable broadcast built on the business context DealFlow already has** (who's in which geography, who owns which cohort, what's overdue on their credit). A distributor doesn't need to understand cohort catalogs or the buyer app to get value from this on day one; they just need to click "message everyone in Nashik." That's what makes it an acquisition and retention lever at once — easy enough for an unsophisticated distributor to adopt immediately, and it pulls them one click deeper into the platform (targeting) every time they use it.

Markup here is charged for **targeting convenience** — the ability to filter and segment against real business data before sending — not for the raw act of relaying a WhatsApp message. Every competing WhatsApp tool (AiSensy, Wati, Gupshup, DoubleTick) already passes Meta's cost plus its own markup to distributors, so a markup on top of Meta's rate is not a new or unfamiliar ask; distributors are conditioned to it. What they can't get from those tools is "who's in Nashik and hasn't ordered in 30 days" computed automatically from data they already entered into DealFlow.

---

## 2. Confirmed decisions from this session

| Decision | Answer |
|---|---|
| Broadcast to WhatsApp groups | **Not viable** — ruled out (§0). Individual template sends only. |
| Daily send cap scope | **Per tenant.** Each tenant gets its own daily broadcast allowance (plan-tier based, ~100/day to start), not a shared pool they compete for. A platform-wide pacing layer still governs the shared Yukti number underneath (§7). Cap exists purely to protect the shared number from Meta blocking/quality-rating damage — it is not a monetization lever. |
| Billing model | **Prepaid wallet**, extending the "WhatsApp credit balance + Top up" UI already speced in `DealFlow_Settings-Spec_v3.md` §Billing & Plan. Every broadcast **synchronously deducts credits on send**; new broadcasts are **blocked** once the wallet is empty, with a "buy more credits" CTA in Settings. No AR/ledger table, no async Meta-cost reconciliation dependency — see §4.4 (revised). |
| Markup structure | **Per-category markup** — marketing, utility, and authentication each carry their own markup %, set as a platform-level configurable setting (not hardcoded). Markup is priced for the targeting/segmentation value, not the message relay itself (§1). |
| MVP targeting scope | **Cohort, manual selection, "all buyers," geography filter, dormant filter, and dues filter** (the last using existing `app.invoices` — see §3.3/§4.4). No route/beat table, no new AR ledger table, for MVP. |
| Consent | **Explicit checkbox** for buyers at first login (required to proceed), **implicit** for seller users at their first login — see §4.8 (revised). |
| Provider | **Direct Meta Cloud API, no BSP.** `.env` BSP credentials are stale and should be removed. |
| Templates | **Platform-managed only** — you register and get every template approved directly with Meta; no tenant-facing template drafting/submission UI for MVP — see §4.1 (revised). |

---

## 3. Architecture overview

### 3.1 One number, many tenants

```
                         Meta WhatsApp Business Platform (Cloud API)
                                        │
                         Single Business Portfolio, single number
                                  (Yukti's WABA)
                                        │
                                 WhatsAppClient
                          (direct Meta Cloud API — no BSP)
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
             app.whatsapp_send_queue (platform-wide, tenant-tagged)
                    │                   │                   │
            Tenant A (WineYard)   Tenant B            Tenant C  ...
         (broadcasts, txn msgs)  (broadcasts, txn msgs)
```

Every message DealFlow sends — OTP, order confirmation, dispatch notice, or a marketing broadcast — funnels through **one send pipeline** tagged with `tenant_id` and `message_category`. This is the only way to (a) enforce Meta's number-level rate limits and quality rating protection centrally, and (b) meter and bill consumption per tenant transparently. Do not let any code path call the WhatsApp provider directly outside this pipeline — including the existing OTP and order-notification sends in `whatsapp_notification_templates.md`. **Those need to be retrofitted through the same `app.whatsapp_messages` ledger** (§5.4) so utility/auth consumption is tracked identically to broadcast consumption — you explicitly asked for this.

### 3.1a Resolved — shared number for sending, per-tenant field repurposed as a callback number

Confirmed: **one shared Yukti WABA sends everything, for every tenant.** The existing "WhatsApp Business Number" field in `DealFlow_Settings-Spec_v3.md` (§Feature Modules > Buyer App, line ~203) is **not** a second sending number — repurpose it as a **buyer-facing callback/contact number**: the number a buyer would call or WhatsApp directly to reach *their* distributor, shown in the buyer app profile / message footer, independent of which number actually sent the broadcast or OTP. That resolves the conflict cleanly: Yukti's shared WABA is the only thing that ever calls the Meta API; the tenant's own number is just contact information displayed to their buyers, same category of data as a business address or support email.

Practically: rename the field's purpose in `DealFlow_Settings-Spec_v3.md` from "WhatsApp Business Number (for OTP delivery)" to something like "Contact number (shown to buyers)" — still tenant-editable text, still optional, but decoupled entirely from message delivery. This is a copy/label change to that spec, not a schema change — worth doing so a future reader doesn't assume it's wired to actual sending.

### 3.2 Provider: direct Meta Cloud API, no BSP

Confirmed: you're integrating directly against Meta's Graph/Cloud API — no AiSensy, no Interakt, no BSP layer at all. `AISEMSY_AUTH_TOKEN` in `.env.example`/`.env.local` is stale from an earlier plan and should be removed once this ships, so it doesn't mislead the next person (or future-you) reading the env file.

This simplifies the architecture in this spec's favor — no BSP markup sitting between Meta's rate and yours, no second vendor's dashboard to reconcile against. Still worth a thin `WhatsAppClient` wrapper around the actual Graph API calls (send message, fetch template status, fetch quality rating, register webhook) rather than scattering `fetch()` calls through business logic — not for provider-swapping flexibility (that's no longer the point), but so the send pipeline, campaign builder, and billing ledger don't need to know about Meta's request/response shapes directly, and so you have one place to handle Meta's auth token refresh and API version bumps. You'll need a registered **WhatsApp Business Account (WABA)** and **Meta Business verification** regardless of provider — that's a Meta requirement, not a BSP one, and it's the actual precondition for this whole feature, so get that verification moving early if it isn't already, since verification review time is often the longest pole in the tent.

### 3.3 Message taxonomy — mapping your 6 use cases (revised, MVP-scoped)

| # | Use case | MVP status | Meta template category | Targeting mechanism |
|---|---|---|---|---|
| 1 | Payment reminder (overdue / nearing payment terms) | **Back in scope** — `app.invoices` already exists with real AR data, see flag below and §4.4 | **Utility** if the template references the specific invoice; Meta will likely push generic dunning language to **Marketing** — validate per template, don't assume | `dues_filter` (new — queries `app.invoices` + `app.buyers`) |
| 2 | New stock / campaign marketing (New in Stock, Latest Arrivals, Flash Sale, Discount, Clearance) | **In scope** | **Marketing** | `campaign` (linked to `app.published_catalogs`, i.e. "Campaigns" post-rename) or `cohort` |
| 3 | Preset cohorts or ad-hoc individual selection | **In scope** | n/a (targeting mode) | `cohort` \| `manual_selection` \| `geography_filter` \| `all_buyers` |
| 4 | Beat-route arrival ("agent visiting soon, be ready") | **In scope, simplified** — no route/beat table; seller filters by existing `app.buyers.geography` (city/pincode/zone) instead of an ordered route. Coarser than "Tuesday's exact route" but ships with zero new schema. | **Utility** (operationally triggered) | `geography_filter` |
| 5 | Buyer-app onboarding / self-service nudge | **In scope** | **Marketing** or **Utility** depending on wording — Meta is strict here (see §7.4) | `geography_filter` \| `all_buyers` |
| 6 | Dormant customer re-engagement | **In scope** | **Marketing** | `dormant_filter` on `orders.placed_at` staleness — this is a computed query, not a new table, so it stays in scope |

**Factual flag — checked the actual codebase, not memory:** `app.invoices` exists in a live migration (`20260529082022_add_invoices_and_invoice_items_for_customers_landing.sql`) with columns `total_amount`, `outstanding_balance`, and `status` (`draft`/`issued`/`partially_paid`/`paid`/`void`) — no `amount_paid` column, and no `due_date` column. So the exact fields you named (`total_amount`, `amount_paid`, `outstanding_balance`) are half-right against what's actually migrated: `total_amount` and `outstanding_balance` exist, `amount_paid` doesn't — a payment simply reduces `outstanding_balance` directly (matches your "simple for now, not a ledger" instruction). "Dues" for targeting purposes = `outstanding_balance > 0`. There's also no stored due date; a separate spec (`DealFlow_User-Stories_v2.md` §EP-17, further along than what's actually migrated) anticipates a richer `due_date`/`amount_outstanding`/`overdue`-status version of this same table — worth knowing these two specs currently disagree with each other and with what's live, so **treat the migrated columns above as ground truth for this feature**, and confirm before building whether that richer version has landed or is still aspirational.

Also checked: you referred to `app.buyers.net_payment_days` — the actual migrated column is **`app.buyers.payment_terms_days`** (`app.buyers` in `20260522130318_init_schemas.sql`). I'll use `payment_terms_days` throughout; flag if you actually meant a different, newer field I haven't found.

Given the above, "nearing/overdue payment" for MVP is computed, not stored: an invoice counts as overdue once `invoice_date + payment_terms_days` (from the buyer) has passed and `outstanding_balance > 0` — no `due_date` column needed, this is derived at query time in the `dues_filter` targeting logic (§4.4).

**On category classification** — Meta enforces this, not you, but per your note, template setup (and therefore category assignment) is entirely yours to do for MVP — tenants never touch Meta template submission (§4.1 revised). That removes the "don't trust tenant self-classification" risk that existed when templates were tenant-authored; you're the only one deciding what a template's category is, so just get the category right when you register it with Meta and the rest of the system trusts `app.whatsapp_templates.meta_category` as ground truth.

---

## 4. Database schema (all in `app` schema, per existing conventions)

Every table below carries the mandatory audit columns (`created_at`, `updated_at`, `created_by`, `updated_by`), `deleted_at` soft-delete, and is `tenant_id`-scoped with RLS — same pattern as every other `app.*` table in `DealFlow_Product-Spec_v1.md` §5.2. Schema qualification is explicit everywhere (`app.whatsapp_templates`, never bare `whatsapp_templates`), per your non-negotiable rule.

### 4.1 `app.whatsapp_templates` — Meta template registry, platform-managed only for MVP

```sql
app.whatsapp_templates
  id uuid PK
  tenant_id uuid NULL REFERENCES app.tenants(id)   -- NULL for MVP always (see below); reserved for future per-tenant templates
  meta_template_name text NOT NULL                 -- exact name registered with Meta
  meta_template_id text                             -- Meta's template ID once approved
  meta_category text NOT NULL CHECK (meta_category IN ('marketing','utility','authentication'))
  use_case text NOT NULL                            -- 'payment_reminder','new_stock','beat_route','buyer_app_nudge','dormant_reengagement','order_notification','otp', etc.
  locale text DEFAULT 'en'
  body text NOT NULL                                -- template body with {{n}} placeholders, mirrors whatsapp_notification_templates.md format
  variables jsonb NOT NULL DEFAULT '[]'              -- [{key, description, source_field}]
  button_config jsonb                                -- CTA URL template, if any
  approval_status text NOT NULL DEFAULT 'pending'    -- 'pending','approved','rejected','disabled'
  is_platform_managed boolean DEFAULT true           -- true for every row in MVP — see below
  + audit cols
  UNIQUE(tenant_id, meta_template_name)
```

**Simpler than v2 assumed, per your correction**: you're setting up every template yourself for MVP, so `is_platform_managed = true` and `tenant_id = NULL` for the entire registry — there is no tenant-facing "draft a template and submit to Meta" flow to build. Tenants pick from a menu of templates you've already created and had approved (mirroring the pattern already established by `whatsapp_notification_templates.md` for OTP/order notifications), select which ones are active for their tenant, and fill in targeting — they never see or touch template body, category, or Meta submission. This removes an entire slice of build work (template composer UI, Meta submission API integration, tenant-facing approval-status tracking) from the MVP campaign builder — keep the `tenant_id`/`is_platform_managed` columns as-is so this can open up later without a schema change, but don't build the tenant-authoring UI now.

### 4.2 `app.whatsapp_broadcasts` — a broadcast send job

Named `whatsapp_broadcasts`, not `broadcast_campaigns` — "Campaign" is already a taken term in this product (the rename from `published_catalogs` → "Campaigns," per `Yukti_NewPages-Spec_v1.md`), and reusing it here for a different entity would be confusing in both code and UI copy.

```sql
app.whatsapp_broadcasts
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text NOT NULL                                -- distributor-facing label
  whatsapp_template_id uuid REFERENCES app.whatsapp_templates(id)
  use_case text NOT NULL                            -- same enum as §4.1
  target_type text NOT NULL CHECK (target_type IN ('cohort','buyer_selection','geography_filter','dormant_filter','dues_filter','all_buyers'))
  target_cohort_id uuid NULL REFERENCES app.cohorts(id)
  target_filter jsonb NULL                          -- e.g. {"city":"Nashik"} (geography_filter) or {"dormant_days_gt": 45} (dormant_filter) or {"overdue": true} (dues_filter, §4.4)
  target_buyer_ids uuid[] NULL                       -- for manual (buyer_selection)
  linked_campaign_id uuid NULL REFERENCES app.published_catalogs(id)  -- for "new stock" broadcasts tied to a live Campaign
  variable_bindings jsonb NOT NULL DEFAULT '{}'      -- maps template {{n}} to buyer/order/invoice fields
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','scheduled','sending','completed','partially_failed','cancelled'))
  scheduled_for timestamptz NULL
  estimated_recipient_count integer                 -- computed at build time, shown before send
  actual_recipient_count integer                    -- final resolved count at send time
  daily_cap_at_creation integer                      -- snapshot of tenant's plan-tier cap when created, for audit
  created_by uuid
  + audit cols
```

Note the `pending_review` status: given the blocking/quality-rating stakes of a shared number, you (platform admin) should manually approve the **first few broadcasts per tenant** before auto-approval kicks in — cheap insurance against a distributor sending a spammy message that tanks your shared number's quality rating for everyone. This can be a feature-flag-gated review queue (`df_broadcast_review_required`), defaulted on, turned off per-tenant once they've proven good hygiene. It's also reused as the quality-rating circuit breaker's parked state — see §7.3.

### 4.3 `app.whatsapp_messages` — the single source of truth for every message sent

This is the ledger both billing and consumption-transparency are built on. **Every** WhatsApp send — OTP, order notification, dispatch alert, or broadcast — writes exactly one row here.

```sql
app.whatsapp_messages
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  buyer_id uuid NULL REFERENCES app.buyers(id)
  recipient_phone text NOT NULL
  whatsapp_template_id uuid REFERENCES app.whatsapp_templates(id)
  meta_category text NOT NULL CHECK (meta_category IN ('marketing','utility','authentication','service'))
  whatsapp_broadcast_id uuid NULL REFERENCES app.whatsapp_broadcasts(id)   -- NULL for transactional sends
  trigger_source text NOT NULL                       -- 'broadcast','order_placed','otp_login','dispatch_notice', etc.
  provider_message_id text                           -- Meta's wamid, for webhook correlation
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','read','failed','blocked_by_recipient','opted_out'))
  failure_reason text
  rate_card_cost numeric(10,4)                        -- platform rate-card cost for this category at send time (snapshot, not Meta's live invoice figure)
  markup_pct numeric(5,2)                              -- markup % applied at send time, snapshot (not looked up later)
  billed_amount numeric(10,4)                          -- rate_card_cost * (1 + markup_pct/100), what the wallet was debited synchronously on send
  wallet_transaction_id uuid NULL REFERENCES app.whatsapp_credit_transactions(id)
  sent_at timestamptz
  delivered_at timestamptz
  read_at timestamptz
  + audit cols
```

Index on `(tenant_id, meta_category, sent_at)` and `(tenant_id, whatsapp_broadcast_id)` — these two power every usage/billing query you'll run.

### 4.4 AR targeting via `app.invoices` (revised — payment reminder back in scope), route/beat tables still not built

No AR ledger table needed — `app.invoices` already carries what's required. The `dues_filter` target type resolves an audience like this:

```sql
-- illustrative, not final RPC code
SELECT DISTINCT b.id AS buyer_id
FROM app.buyers b
JOIN app.invoices i ON i.buyer_id = b.id AND i.tenant_id = b.tenant_id
WHERE b.tenant_id = :tenant_id
  AND i.status IN ('issued', 'partially_paid')
  AND i.outstanding_balance > 0
  AND i.invoice_date + (b.payment_terms_days || ' days')::interval < now()   -- "overdue" computed, no due_date column exists
  AND b.deleted_at IS NULL
```

This is a live query, not a new table — `target_filter` on the broadcast row can carry a threshold (e.g. `{"overdue_days_gt": 15}` computed from the same expression) if you want finer segmentation than a flat overdue/not-overdue split. Variable binding for the template pulls `outstanding_balance` and computed days-overdue straight from the query result into `{{n}}` placeholders (e.g. *"You have ₹{{1}} outstanding, due {{2}} days ago"*).

Beat-route arrival (use case #4) still ships against **existing** `app.buyers.geography` (`city`/`state`/`pincode`/`zone`) rather than a new route/beat table — coarser ("everyone in this pincode") than "exactly who's on Tuesday's route," but real distributor value with zero new schema. No change from v2 on this one; revisit only if distributor demand justifies a purpose-built route builder.

### 4.5 Geography-based targeting (uses existing data, no new tables)

`app.buyers.geography` already stores `{city, state, pincode, zone}` — the broadcast composer's `geography_filter` target type queries directly against this jsonb column (e.g. `geography->>'city' = 'Nashik'`). No schema change needed here; this is the targeting mechanism for use cases #3, #4, and #5.

### 4.6 Wallet & billing — folded into `app.tenants`, no separate wallet table

**Factual flag, checked not assumed:** I could not find `whatsapp_credits_balance` or `whatsapp_credits_purchased` anywhere in the actual migrations or in `DealFlow_Settings-Spec_v3.md`'s field listing (I greped both) — only a generic mention that WhatsApp is "credits-based" and billing UI is "spec'd separately." So these two columns don't exist yet; treat this section as **defining them for the first time**, not integrating with something already live. If they do exist somewhere I didn't check (a branch, a newer migration), tell me the exact table/columns and I'll re-point this section — otherwise this is what gets built.

```sql
-- additions to app.tenants
  whatsapp_credits_balance numeric(12,2) NOT NULL DEFAULT 0     -- INR, current spendable balance, debited synchronously on every send
  whatsapp_credits_purchased numeric(12,2) NOT NULL DEFAULT 0   -- lifetime total ever topped up, for reporting/LTV — never decremented
```

No separate `app.whatsapp_wallets` table — with one wallet per tenant and `app.tenants` already being the natural tenant-scoped row, a side table would just be a 1:1 join for no benefit. The transaction ledger still gets its own table, since that's genuinely one-to-many and you need the audit trail:

```sql
app.whatsapp_credit_transactions
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  transaction_type text CHECK (transaction_type IN ('topup','debit','refund','adjustment'))
  amount numeric(12,2) NOT NULL                       -- positive for topup/refund, negative for debit
  balance_after numeric(12,2) NOT NULL                -- snapshot of app.tenants.whatsapp_credits_balance after this transaction
  related_message_id uuid NULL REFERENCES app.whatsapp_messages(id)
  payment_reference text                              -- Razorpay/Stripe txn ID for topups
  notes text
  + audit cols

app.whatsapp_rate_card                                -- platform-level, not per-tenant (unless you want tenant-specific pricing later)
  id uuid PK
  meta_category text UNIQUE CHECK (meta_category IN ('marketing','utility','authentication'))
  base_cost numeric(10,4) NOT NULL                    -- Meta's published per-message rate for this category, kept current by you manually (§11)
  markup_pct numeric(5,2) NOT NULL                    -- set manually by you (§11), not computed
  effective_from timestamptz NOT NULL DEFAULT now()
  + audit cols
```

If you later want tenant-specific negotiated rates (e.g. WineYard gets a lower rate as an anchor customer), add an optional `app.tenant_markup_overrides (tenant_id, meta_category, markup_pct)` that takes priority over the global config — same override pattern as `app.price_list_assignments`.

**Debit flow — synchronous, no reconciliation dependency:** at the moment a message is dispatched to Meta (not on a later delivery webhook), a `SECURITY DEFINER` RPC (`app.debit_whatsapp_credits`) atomically: reads `base_cost` + `markup_pct` for the message's category from `app.whatsapp_rate_card` (or a tenant override), computes `billed_amount`, decrements `app.tenants.whatsapp_credits_balance` directly, writes the `app.whatsapp_credit_transactions` row, and stamps `billed_amount`/`wallet_transaction_id` onto the message row — all in the same transaction as the queue pop, so a send can never leave the balance undebited. Pre-flight (§7.2) checks the balance covers the broadcast's full estimated cost before any send starts; if it hits zero mid-broadcast anyway (e.g. a concurrent broadcast drained it), the remaining queued sends are auto-cancelled and the seller sees exactly how many went out before credits ran dry. Since `base_cost` is Meta's actual published rate (not an estimate with headroom — per your direction, you'll keep this current manually), there's no gap to reconcile against a later invoice in the normal case.

### 4.7 Rate/pacing tables

```sql
app.tenant_broadcast_limits
  tenant_id uuid PK REFERENCES app.tenants(id)
  daily_broadcast_cap integer NOT NULL DEFAULT 100    -- plan-tier default, overridable
  plan_tier_source text                               -- 'starter'|'growth'|'scale'|'custom'
  + audit cols

app.whatsapp_send_queue
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  whatsapp_message_id uuid REFERENCES app.whatsapp_messages(id)
  priority integer NOT NULL DEFAULT 5                 -- 1 = OTP/transactional (highest), 5 = broadcast (lowest)
  scheduled_send_at timestamptz NOT NULL
  attempt_count integer DEFAULT 0
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled'))
  + audit cols
```

`priority` is the mechanism that guarantees OTP and order notifications never queue behind a broadcast — see §7.1.

### 4.8 Consent — explicit checkbox for buyers, implicit for seller users

Revised per your decision: buyers get an **explicit checkbox** at first OTP login (not just a passive notice), seller-side users get **implicit consent** at their first login (no checkbox — they're the tenant's own staff receiving operational notifications, a materially different consent bar than a third-party retailer receiving marketing). This is a stronger position than v2's implied-notice-only design, and it directly addresses the caveat I raised there about Meta's marketing-template review wanting clear proof of opt-in — good call tightening it now rather than waiting for a rejection to force the issue.

```sql
-- additions to app.buyers
  whatsapp_consent_at timestamptz NULL              -- set once, at first login, when checkbox is confirmed; never overwritten
  whatsapp_consent_method text DEFAULT 'explicit_checkbox_first_login'
  whatsapp_opt_out_at timestamptz NULL              -- set when buyer replies STOP or uses an opt-out link/setting; NULL = still opted in

-- additions to app.tenant_users (seller-side, mirrors the buyer pattern at the implicit tier)
  whatsapp_consent_at timestamptz NULL              -- set silently on first successful login, no UI shown
  whatsapp_consent_method text DEFAULT 'implicit_first_login'
```

**Buyer mechanics**: the first-login OTP screen shows a required checkbox — *"I agree to receive WhatsApp communication from \{\{seller_name\}\}, including order updates and marketing messages"* — that must be checked to proceed. This is a one-time gate, not a repeated prompt; `whatsapp_consent_at`/`whatsapp_consent_method` stamp the moment it's confirmed. Every broadcast pre-flight check (§7.2) excludes any buyer with `whatsapp_opt_out_at IS NOT NULL`, and an inbound-message webhook handler watching for STOP/UNSUBSCRIBE replies sets that field automatically — not optional, Meta expects opt-outs honored and it directly protects your quality rating.

**Seller mechanics**: no checkbox, no blocking UI — `whatsapp_consent_at` on `app.tenant_users` is stamped the moment a seller user's session is first established, same trigger point as any other first-login bookkeeping you might already do. This exists mainly for symmetry and audit completeness (every WhatsApp recipient in the system has *some* consent record, even a thin one), not because sellers are expected to opt out of receiving their own business's order notifications.

One thing worth deciding, not assuming: is a buyer *required* to check the box to use the buyer app at all, or can they decline and still browse/order with WhatsApp communication simply switched off for them (relying on in-app notifications instead)? The spec above assumes it's required-to-proceed, which is simpler to build but forces the choice on a buyer who might not want any WhatsApp messages at all — worth a deliberate call rather than a default.

---

## 5. Sending pipeline

```
Broadcast composer / transactional trigger
        │
        ▼
Pre-flight checks (§7.2) ──fail──▶ block, show reason in UI
        │ pass
        ▼
Resolve audience → app.whatsapp_messages rows (status=queued) + app.whatsapp_send_queue rows
        │
        ▼
Platform pacing worker (pg_cron scheduled function, runs every 1–5 min)
  - pulls from app.whatsapp_send_queue ordered by priority, scheduled_send_at
  - enforces: platform-wide messages/hour ceiling (stay under Meta's tier),
              per-recipient 2-marketing-messages/24h cap (query app.whatsapp_messages),
              per-tenant daily_broadcast_cap remaining,
              wallet balance still covers this message (re-check at pop time, not just campaign creation)
        │
        ▼
app.debit_whatsapp_credits RPC (synchronous — decrements app.tenants.whatsapp_credits_balance, stamps billed_amount, same transaction as queue pop)
        │
        ▼
WhatsAppClient.send() → Meta Cloud API (direct, no BSP)
        │
        ▼
Webhook receiver (Edge Function) updates app.whatsapp_messages.status only
  (sent/delivered/read/failed) — billing already happened, this just updates delivery state
```

Build this as a Supabase scheduled function (`pg_cron`, matches your locked stack for background jobs) rather than a naive "send everything now" loop. A campaign of, say, 90 buyers should be **paced over the day**, not blasted in one burst — bursty sending is itself a spam signal to Meta's quality algorithm, independent of the daily cap.

---

## 6. Consumption tracking & transparency (the billing ask)

Extend the existing **Billing & Plan** settings page (already speced to show "WhatsApp credit balance + Top up") with:

1. **Usage-by-category chart** (marketing / utility / authentication), current billing period, sourced from `app.whatsapp_messages` grouped by `meta_category`. This is the transparency mechanism you asked for — tenant sees exactly what they consumed, by type, before disputing an invoice.
2. **Cost breakdown table**: messages sent, Meta's cost, your markup, total billed — per category. Whether you show the markup line item explicitly to tenants is a pricing-transparency call (some SaaS hide it as "platform fee included," others itemize it); either way, *you* need the breakdown internally even if the tenant only sees a blended per-message rate.
3. **Daily cap meter** for broadcasts specifically: "42 / 100 sent today," with a hard stop and clear message when the cap is hit (not a silent failure).
4. **Low-balance banner** (inherits the ≥80%-usage warning pattern already speced for tier limits) — warn before the balance hits zero. Once it does hit zero, **new broadcasts are blocked outright** (composer's "Send" action is disabled with a "Top up to send" CTA, not a silent queue-and-fail) — per your direction, this is the primary guardrail against overspend, not a nice-to-have.
5. **Per-broadcast report**: for each `app.whatsapp_broadcasts` row — sent/delivered/read/failed counts, cost, and (once you wire click tracking on template CTA buttons) click-through if you want to sell broadcast as a marketing channel with ROI, not just a utility.

---

## 7. Guardrails — protecting the shared number from getting blocked

This is the section that matters most operationally, because **one bad tenant can tank deliverability for all 50+ tenants sharing your number.** Treat this as non-negotiable infrastructure, not a nice-to-have.

### 7.1 Priority lanes

Transactional messages (OTP, order confirmation, dispatch) must never queue behind broadcast sends. `app.whatsapp_send_queue.priority` enforces this at the queue level — OTP always jumps the line. Losing an OTP send to broadcast congestion breaks login; losing a broadcast send to pacing is just a slower campaign.

### 7.2 Pre-flight checks before any campaign is allowed to send

- **Wallet balance** covers estimated cost of full recipient count (block if insufficient, don't partially send and strand a broadcast) — re-checked again at queue-pop time per message, since balance can move between creation and actual send (§5).
- **Tenant daily cap** has enough headroom for the broadcast size (or auto-split across days).
- **Template approval status** = `approved` in Meta (never allow sending on a `pending`/`rejected` template).
- **Opt-out check**: exclude any buyer with `app.buyers.whatsapp_opt_out_at IS NOT NULL` (§4.8) — Meta requires you to honor opt-outs and this protects your quality rating. This is still a hard runtime filter (never trust it's been avoided upstream), but it should also be **surfaced proactively in the Customers UI** — good catch. Show a "WhatsApp: opted out" badge/chip on the buyer row and buyer detail page, and exclude opted-out buyers from the audience-count preview and manual-selection picker in the composer *before* the seller even attempts to include them, not just silently drop them at send time. This does two things: it saves a runtime check from ever being needed for the common case (sellers can't select someone who's visibly marked opted-out), and it builds trust — a seller who sees "12 of your 40 selected buyers are opted out" understands why their delivered count is lower than expected instead of being confused by a silent gap.
- **Per-recipient 24h marketing cap — hard rule, not a recommendation**: Meta enforces ~2 marketing messages per user per day across *all* businesses on the platform, not just yours (error `131049` when exceeded). Enforce a **stricter internal limit of 1 marketing broadcast per buyer per day, full stop** — query `app.whatsapp_messages` for `meta_category = 'marketing'` sends to that buyer today (any broadcast, any tenant, since it's Meta's per-user cap not per-tenant) and exclude/block any buyer who's already received one, at both composer-preview time and queue-pop time. Utility and authentication sends aren't capped this way — this rule is marketing-category only.
- **First-broadcast review gate** (§4.2) for new tenants until they've built a clean sending history.

### 7.3 Quality rating monitoring — state machine, and how to talk to tenants about it without alarming them

You asked the right question: don't just build the technical circuit breaker, design what the tenant actually sees and how it's framed. Your instinct that broadcasts should be "either blocked or no longer instant" is exactly right — those are the two honest states, and neither should read as an accusation to the tenant, because in the Yellow case it usually isn't *their* fault (someone else's bad campaign on the shared number can degrade everyone's rating).

**Three states, three different tenant experiences:**

| Meta quality rating | System behavior | What the tenant sees |
|---|---|---|
| **Green** (healthy) | Broadcasts send on the normal pacing schedule — "instant" in the sense that they go out same-day per the pacing worker, no extra hold. | Nothing — no banner, this is the default state. |
| **Yellow** (warning) | New broadcasts are accepted but **all go to `pending_review`** regardless of the tenant's individual sending history (temporarily override the per-tenant "trusted, skip review" setting) — held for your manual release rather than auto-queued instantly. | A calm, non-technical banner in the broadcast composer: *"Messages are going through an extra delivery check right now and may take a few hours longer to send. Your scheduled broadcasts are queued and will go out as soon as they clear."* No mention of "quality rating," "spam," or "risk" — frame it as a routine check, because from the tenant's side, it genuinely is just a delay, not a rejection. |
| **Red** (at risk) | **Automatic circuit breaker**: all `sending`/`scheduled` broadcasts platform-wide are paused; new broadcasts can be drafted but not sent until you manually clear the state. Transactional sends (OTP, order notifications) are **not** paused — those stay on the priority lane (§7.1) since breaking login/orders is a much bigger problem than a delayed broadcast. | *"Broadcast sending is temporarily paused for a system-wide health check. Your draft is saved and will send automatically once this clears — usually within a day."* Same non-alarming register, scoped honestly ("system-wide," not "your account"), with a realistic time expectation so it doesn't read as indefinite. |

**If the degradation traces to one specific tenant's campaign** (not a platform-wide Red), don't broadcast that fact to other tenants — pause *that tenant's* broadcasts only (`pending_review` on all their queued/scheduled rows), and *their* banner can be slightly more direct since it's genuinely about their own sending: *"We're reviewing your recent broadcast before sending more — we'll be in touch shortly."* This is also your cue to actually reach out to that tenant directly (a real message from you, not just an in-app banner) — at your current scale, a personal "hey, saw your last broadcast got a few complaints, let's look at the message together" does more for the relationship than any UI copy, and it's the kind of high-touch thing that's easy to do at 10 tenants and impossible at 500, so use the advantage while you have it.

**Internal monitoring** (unchanged from v2): poll Meta's quality rating on a schedule (hourly is enough given Meta itself re-evaluates every 6 hours in 2026), alert yourself (Slack/email) on any drop to Yellow or Red, and treat a single tenant's campaign dropping below ~2–3% block rate as a trigger to pause *that tenant* pending your review even before it drags the whole-number rating down — same mechanism as the Yellow/Red states above, just scoped to one tenant instead of the platform.

Build the tenant-facing banner copy as a config value (not hardcoded string), since you'll likely want to tune the tone after seeing how the first real Yellow/Red event lands with an actual tenant.

### 7.4 Template hygiene

- Server-side validate `meta_category` against what Meta actually approved — never trust a tenant's self-selected category in the UI (§3.3).
- Never let a tenant repurpose an order-notification (utility) template body for promotional content — Meta audits template content against category post-hoc and will reject/suspend mismatched templates, which burns your review cycle time.
- Track `messaging_tier` (250 → 1K → 10K → 100K/day) against total platform volume across all tenants combined — since October 2025 Meta shares limits across all numbers on one Business Portfolio, so if you ever add a second number, the ceiling is still shared. Alert yourself well before aggregate daily volume approaches the current tier ceiling, since growth here is entirely your top-line — don't let a tier cap silently throttle revenue.

### 7.5 Kill switch

A single platform-admin control (not a tenant-facing setting) to pause **all** outbound broadcast sending immediately — for the day Meta flags something and you need to stop everything while you sort it out with support. This should be a boolean read at the top of the pacing worker, checked before every batch pull, not something that requires a deploy.

---

## 8. RBAC & feature flags

- New flag: `df_whatsapp_broadcast` (default off, piloted on 1–2 tenants first, matching your existing feature-flag discipline). Gates both the UI (the "Broadcast message" CTA on Customers, per §9) and the underlying RPCs.
- Sub-flag: `df_broadcast_review_required` (default on) — the manual first-broadcast approval gate, per tenant, until you're confident in their hygiene.
- **Role**: broadcast creation/send is `seller_admin` only — same tier as cohort/price-list management and Tally export in the existing role matrix (`DealFlow_Product-Spec_v1.md` §6.1). `seller_assistant` already has access to the Customers page itself (buyer master data management is in their role), so the "Broadcast message" CTA should be **visible but disabled** for `seller_assistant` with a tooltip ("Only admins can send broadcasts") rather than hidden — consistent with how other admin-only actions are typically surfaced in the cockpit, and less confusing than the button just not existing.
- Sensitive write paths (`send broadcast`, `debit credits`) go through `SECURITY DEFINER` RPCs with role re-verified inside — same pattern as `publish catalog` / `change order status`.

---

## 9. UI touchpoints — recommendation: embed in Customers, no dedicated nav route for MVP

You asked the right question before building either version, so here's the actual reasoning, not just the answer.

**Recommendation: no standalone `/broadcasts` nav item or landing page for MVP.** Add a **"Broadcast message"** CTA (`<MessageCircle/>` or `<Megaphone/>` + label, per your icon+label CTA rule) directly on the Customers page — top-level action alongside "Add customer" / "Import customers" — that opens the composer as a drawer/modal over the Customers list, not a route navigation. Reasoning:

1. **Targeting *is* customer data.** Every targeting mode (cohort, geography, dues, dormant, manual selection) is fundamentally "pick some customers" — the Customers page is already the natural home for that mental model, and a seller who's just looked at their buyer list is one click from messaging them, which is exactly the low-friction, no-frills entry point this feature is supposed to be.
2. **Review frequency is low, especially early.** An unsophisticated distributor sending their first few broadcasts wants to know "did it send, how many got it" — right after sending, not via a dedicated historical-analytics page they come back to visit later. A composer that shows delivered/failed counts inline immediately after send covers that need without a separate surface. As broadcast volume and sophistication grow (more tenants, more frequent sends, actual campaign-performance comparison), a dedicated `/broadcasts` page becomes worth the nav real estate — that's a graduation point to watch for via `app.whatsapp_broadcasts` volume per tenant, not something to pre-build on a guess.
3. **One fewer nav item matters more than it sounds** at this stage — the seller sidebar already has 10 items (§7.1 of the Product Spec); every new top-level nav entry is a small tax on an already dense sidebar, and this feature's whole value proposition is being *easy to find and use*, which a buried 11th nav item actively works against. A CTA on a page the seller is already visiting for a related reason (managing customers) is more discoverable, not less.

**Revised UI touchpoints:**

| Surface | Change |
|---|---|
| Customers page | New CTA: **"Broadcast message"** (`<MessageCircle/>` + label), opens the broadcast composer as a drawer/modal, no route change |
| Broadcast composer (drawer/modal, reused for every send) | Step flow: pick use case → pick from platform-managed template list (§4.1, no drafting) → pick targeting mode (cohort / geography / dues / dormant / manual / all buyers) → preview audience count + estimated cost + opted-out exclusions (§7.2) → review (if gated, §4.2) → schedule/send. On completion: inline delivered/failed summary, no navigation away. |
| Customers page — buyer row & detail | New: **"WhatsApp: opted out"** badge/chip where applicable (§7.2), visible before a seller ever opens the composer |
| Customers page — lightweight broadcast history | A secondary tab or collapsible section on the Customers page (not a new route) listing the last ~20 broadcasts with sent/delivered/failed counts and cost. Enough for "did my last few sends work," not built as a full analytics surface yet. |
| Settings → General → WhatsApp & Notifications | No structural change — existing transactional toggles stay; add a note that these are now billed as utility/authentication messages, link to Billing & Plan for consumption detail |
| Settings → Feature Modules → Buyer App → "WhatsApp Business Number" | **Relabel, not remove** — becomes "Contact number (shown to buyers)," per the resolved shared-number model in §3.1a. Flag this as a follow-up copy edit to `DealFlow_Settings-Spec_v3.md`. |
| Settings → Billing & Plan | Extend per §6: usage-by-category, cost breakdown, daily cap meter, "buy more credits" flow, broadcast reports |
| Buyer PWA — first login (OTP screen) | New: explicit checkbox — *"I agree to receive WhatsApp communication from \{\{seller_name\}\}, including order updates and marketing messages"* — required to proceed past first login, per your consent decision (§4.8, revised). This is the one buyer-facing UI change for MVP. |
| Buyer profile | Add a simple "Communication preferences" line showing opted-in status + how to stop (mirrors the STOP-reply mechanism, doesn't need to be a toggle for MVP) |
| Seller first login (cockpit) | No new UI — implicit consent is stamped silently on first `tenant_users` login, no checkbox shown, per §4.8 |

---

## 10. Build sequence — repositioned as an early, not deferred, feature

Given this is customer-validated as the daily-use feature — the thing distributors reach for before they're sophisticated enough to build cohorts and campaigns — treat it as a **parallel early-build track, not a post-MVP bolt-on.** It doesn't need catalogs, cohorts, or pricing to be functional (geography filter + manual selection are independent of those), so it can land well before Week 6-8 catalog publishing in the original 12-week plan. Concretely: pull it in alongside Week 4 (Customer Master ships — the moment `app.buyers.geography` exists, geography-filter broadcast is buildable) rather than waiting for Week 11+.

| Phase | Deliverable |
|---|---|
| A | Retrofit existing OTP + order-notification sends through `app.whatsapp_messages` ledger + provider adapter (no behavior change, just instrumentation) — unlocks accurate utility/auth consumption tracking regardless of broadcast, do this first since everything else depends on the ledger existing |
| B | Wallet + rate-card tables, synchronous debit RPC, block-on-empty enforcement, Billing & Plan usage/top-up UI |
| C | Consent (§4.8): `app.buyers` columns, first-login notice, STOP-reply webhook handler — small but do it alongside B, not as an afterthought |
| D | Templates registry — you register and get Meta approval on the first 5 templates directly (new-stock, dormant-reengagement, buyer-app-nudge, beat-route-geography, payment-reminder), no tenant-facing submission flow to build (§4.1) |
| E | Broadcast composer UI + targeting (`cohort`, `manual_selection`, `geography_filter`, `dormant_filter`, `dues_filter`, `all_buyers` — full MVP targeting scope including payment reminders now that `app.invoices` covers it) |
| F | Pacing worker + guardrails (§7) — do not skip or shortcut this phase to hit a date; this is what protects the number every other tenant depends on, and matters *more* given this is now a primary daily-use surface, not a secondary one |

Payment-reminder (use case #1) is now part of phase E, not deferred — the `app.invoices` correction in §3.3/§4.4 pulled it back into MVP scope.

Pilot on WineYard first, same as the Zoho integration — they're already your reference tenant, and also a good test of whether a "no-frills" broadcast adoption pattern shows up before the more sophisticated catalog/cohort features do, which would validate the acquisition-driver thesis directly.

---

## 11. Open decisions

**Resolved this round:**

1. **Provider strategy** — direct Meta Cloud API, no BSP, no Tech Provider reseller layer. You still need your own registered WABA and Meta Business verification regardless (§3.2) — that's the real remaining to-do, not a strategy choice.
2. **Rate-card values** — `base_cost` = Meta's actual published per-message rate per category (marketing/utility/authentication), not an estimate with headroom; `markup_pct` is set manually by you, no formula. Concretely, as of Meta's January 2026 India rate card: marketing ≈ ₹0.86/message, utility and authentication ≈ ₹0.115/message each — treat these as a starting reference to seed `app.whatsapp_rate_card`, not as values I'm asserting are still current by the time you build this; confirm against Meta's live rate card at build time and keep `base_cost` current manually going forward, same discipline as `markup_pct`.
3. **Consent** — explicit checkbox for buyers at first login, implicit for seller users (§4.8, revised).
4. **AR data source** — resolved via `app.invoices` (§3.3, §4.4), with the caveat that `amount_paid` and `due_date` as you described them don't exist as stored columns in the live migration — see the factual flag in §3.3 for what actually does.

**Still open — need your input:**

1. **Buyer consent gating**: is checking the WhatsApp-communication box *required* to proceed past first login (simpler to build, but forces the choice), or can a buyer decline and still use the app with WhatsApp switched off for them specifically (more buyer-friendly, more states to build and test)? Flagged in §4.8, not assumed either way.
2. **First-broadcast manual review**: are you personally reviewing every new tenant's first broadcast, or is this too much ops overhead for a solo founder at scale? If it doesn't scale past ~10 tenants, design an automated content/link-safety check instead. Matters more now that broadcast is positioned as an early-adoption feature — more tenants hit this gate sooner than in a deferred-phase plan.
3. **Rate-card pricing story to distributors**: now that markup is explicitly framed as paying for targeting, not message relay (§1), does that argue for a simpler flat "credits" unit price shown to tenants (hiding the three-category cost variance) rather than exposing marketing/utility/authentication as visibly different rates in the Billing UI? Worth deciding before §6's usage-by-category UI gets built, since it's a different design if the categories are meant to be invisible to the tenant.
4. **WABA verification status/timeline**: is Meta Business verification for your WABA already in progress? This is now the actual critical-path item (§3.2) — worth confirming it's moving in parallel with the engineering build, since verification review time is often the slowest part of standing up a Cloud API integration and nothing in this spec can go live without it.

Sources: [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) · [Group messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging) · [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) · [Per-user marketing template limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/) · [WhatsApp Business API Pricing India 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
