# DealFlow (Yukti) — WhatsApp Broadcast Capability — Spec v1

**Module:** Multi-tenant WhatsApp Broadcast + Consumption Metering + Markup Billing
**Date:** 2026-07-02 | **For:** Phani | **Audience:** Solo-founder build plan, extends `DealFlow_Product-Spec_v1.md` and `DealFlow_Settings-Spec_v3.md`

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

Distributors already have WhatsApp groups for beat-route reminders and stock alerts — informal, unstructured, no read receipts, no targeting, no record. DealFlow's edge isn't "we also send WhatsApp messages" — it's **structured, targeted, trackable broadcast built on the same customer/cohort/catalog data the distributor already has in the cockpit**, sent from a single number you operate and bill for centrally. The distributor gets segmentation (overdue, route, dormant, tier) they can't get from a WhatsApp group. You get a new, transparently-metered revenue line on top of a channel every tenant already needs.

---

## 2. Confirmed decisions from this session

| Decision | Answer |
|---|---|
| Broadcast to WhatsApp groups | **Not viable** — ruled out (§0). Individual template sends only. |
| Daily send cap scope | **Per tenant.** Each tenant gets its own daily broadcast allowance (plan-tier based, ~100/day to start), not a shared pool they compete for. A platform-wide pacing layer still governs the shared Yukti number underneath (§7). |
| Billing model | **Prepaid wallet**, extending the "WhatsApp credit balance + Top up" UI already speced in `DealFlow_Settings-Spec_v3.md` §Billing & Plan. Wallet is debited per send at Meta's cost + markup. |
| Markup structure | **Per-category markup** — marketing, utility, and authentication each carry their own markup %, set as a platform-level configurable setting (not hardcoded). Marketing typically carries the highest margin since it drives tenant revenue; authentication (OTP) the thinnest, since it's a cost of using the product at all. |

---

## 3. Architecture overview

### 3.1 One number, many tenants

```
                         Meta WhatsApp Business Platform (Cloud API)
                                        │
                         Single Business Portfolio, single number
                                  (Yukti's WABA)
                                        │
                              WhatsApp Provider Adapter
                        (BSP: AiSensy/Interakt, or direct Cloud API)
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
             app.whatsapp_send_queue (platform-wide, tenant-tagged)
                    │                   │                   │
            Tenant A (WineYard)   Tenant B            Tenant C  ...
         (broadcasts, txn msgs)  (broadcasts, txn msgs)
```

Every message DealFlow sends — OTP, order confirmation, dispatch notice, or a marketing broadcast — funnels through **one send pipeline** tagged with `tenant_id` and `message_category`. This is the only way to (a) enforce Meta's number-level rate limits and quality rating protection centrally, and (b) meter and bill consumption per tenant transparently. Do not let any code path call the WhatsApp provider directly outside this pipeline — including the existing OTP and order-notification sends in `whatsapp_notification_templates.md`. **Those need to be retrofitted through the same `app.whatsapp_messages` ledger** (§5.4) so utility/auth consumption is tracked identically to broadcast consumption — you explicitly asked for this.

### 3.1a Red flag — this contradicts a field already in `DealFlow_Settings-Spec_v3.md`

The current Settings spec (§Feature Modules > Buyer App, line ~203) has **"WhatsApp Business Number"** as a **per-tenant, tenant-editable text field** — "AiSensy/Interakt registered number for OTP delivery." That's a per-tenant-number model. What you're asking for here — one Yukti number serving every tenant's buyers — is architecturally the opposite. Both can't be true at once, and this isn't cosmetic: it decides whether a buyer's OTP/order/broadcast messages arrive from a number branded to *their* distributor or from a shared generic Yukti number.

Don't let this slide as a detail to patch later — pick one now, because it changes the DB (`app.tenants` needs a number reference either way, but ownership differs), the Settings UI (that field becomes read-only display vs. tenant-configurable), and buyer trust (a shared number showing "New message from +91-XXXXX" reads as spam risk unless the message body clearly names the distributor, which your templates already do via `{{seller_name}}`).

| Option | What changes |
|---|---|
| **Single shared Yukti number (your stated ask)** | "WhatsApp Business Number" field in Settings becomes **read-only**, repurposed as a display label only (e.g. tenant's registered display name shown to Meta, not a real number). All sends route through one WABA, differentiated only by template variables (`{{seller_name}}`, `{{seller_location}}`). This is what the rest of this spec assumes. |
| **Per-tenant number (current Settings spec)** | Each tenant brings/registers their own WABA number via AiSensy/Interakt. No shared-number rate-limit/quality-rating pooling problem (§7) exists in the same way — each tenant's blast radius is their own. Kills the "single Yukti number" premise entirely; you'd bill per-tenant Meta usage pass-through with markup, but guardrails in §7 mostly become each tenant's own problem, not yours. |

I've written the rest of this spec against the **shared-number model**, since that's explicitly what you asked for and it's the only one that makes centralized markup billing and guardrail-as-a-service make sense as a product. But flag and update the "WhatsApp Business Number" field's behavior in `DealFlow_Settings-Spec_v3.md` as part of this build — right now that spec and this one describe two different systems.

### 3.2 Provider layer: BSP vs. direct Tech Provider

Your `.env.example` already has `AISEMSY_AUTH_TOKEN` — you're on a BSP (AiSensy or Interakt) today for OTP. Keep that abstracted behind an adapter interface (`WhatsAppProviderAdapter`) rather than hardwiring AiSensy calls into business logic, for two reasons:

1. **BSP markup risk**: AiSensy/Interakt add their own markup and monthly platform fees on top of Meta's per-message cost, before your markup even applies. If your margin needs are tight, you may want to become a Meta **Tech Provider** directly (register your own WABA, own the Cloud API relationship) — no BSP middleman, you control 100% of the markup. This is a business decision, not urgent for MVP, but the adapter pattern means you can switch later without touching the send pipeline, campaign builder, or billing ledger.
2. Meta's rate/quality mechanics (messaging tiers, quality rating, 24-hour service window) apply to the **underlying WABA number**, not the BSP — so your guardrails (§7) need to be built against Meta's rules regardless of which provider sits in front.

**Recommendation:** ship MVP on your current BSP to move fast, but build the adapter interface now so cutover to direct Tech Provider status is a config change, not a rewrite.

### 3.3 Message taxonomy — mapping your 6 use cases

| # | Use case | Meta template category | Targeting mechanism | Data dependency |
|---|---|---|---|---|
| 1 | Payment reminder (overdue / by route in next 2-3 days / nearing `net_payment_days`) | **Utility** (if tied to an existing transaction) or **Marketing** if Meta reclassifies — see note below | `segment_filter` (ad-hoc query, not a saved cohort) | **Gap**: no AR/invoice ledger exists yet in `app.*` — see §4.4 |
| 2 | New stock / campaign marketing (New in Stock, Latest Arrivals, Flash Sale, Discount, Clearance) | **Marketing** | `campaign` (linked to `app.published_catalogs`, i.e. "Campaigns" post-rename) or `cohort` | None — campaigns already exist |
| 3 | Preset cohorts or ad-hoc individual selection | n/a (targeting mode) | `cohort` \| `manual_selection` \| `segment_filter` \| `all_buyers` | None |
| 4 | Beat-route arrival ("agent visiting soon, be ready") | **Utility** (operationally triggered) | `segment_filter` on route/beat | **Gap**: no `route`/`beat` concept in `app.buyers.geography` today — see §4.5 |
| 5 | Buyer-app onboarding / self-service nudge | **Marketing** or **Utility** depending on wording — Meta is strict here (see §7.4) | `segment_filter` (buyers with no `buyer_users` linked yet) or `all_buyers` | None |
| 6 | Dormant customer re-engagement | **Marketing** | `segment_filter` on `orders.placed_at` staleness | None |

**On category classification** — Meta enforces this, not you. Payment reminders and beat-route notices *feel* transactional to a distributor, but Meta's utility-template policy is narrow: utility templates must relate to an existing transaction and cannot include promotional content. A generic "pay your dues" reminder with no specific order reference will likely need to be filed as **marketing**, which is more expensive and counts against the 2-messages/day-per-user marketing cap (§7.3). Don't let tenants self-classify templates in the UI — validate category server-side against Meta's actual approval (`app.whatsapp_templates.meta_category`), and default anything ambiguous to marketing so you never get flagged for miscategorization (which stalls tier progression, per Meta's 2026 policy).

---

## 4. Database schema (all in `app` schema, per existing conventions)

Every table below carries the mandatory audit columns (`created_at`, `updated_at`, `created_by`, `updated_by`), `deleted_at` soft-delete, and is `tenant_id`-scoped with RLS — same pattern as every other `app.*` table in `DealFlow_Product-Spec_v1.md` §5.2. Schema qualification is explicit everywhere (`app.whatsapp_templates`, never bare `whatsapp_templates`), per your non-negotiable rule.

### 4.1 `app.whatsapp_templates` — Meta template registry

```sql
app.whatsapp_templates
  id uuid PK
  tenant_id uuid NULL REFERENCES app.tenants(id)   -- NULL = platform-wide template (OTP, order notifications)
  meta_template_name text NOT NULL                 -- exact name registered with Meta
  meta_template_id text                             -- Meta's template ID once approved
  meta_category text NOT NULL CHECK (meta_category IN ('marketing','utility','authentication'))
  use_case text NOT NULL                            -- 'payment_reminder','new_stock','beat_route','buyer_app_nudge','dormant_reengagement','order_notification','otp', etc.
  locale text DEFAULT 'en'
  body text NOT NULL                                -- template body with {{n}} placeholders, mirrors whatsapp_notification_templates.md format
  variables jsonb NOT NULL DEFAULT '[]'              -- [{key, description, source_field}]
  button_config jsonb                                -- CTA URL template, if any
  approval_status text NOT NULL DEFAULT 'pending'    -- 'pending','approved','rejected','disabled'
  is_platform_managed boolean DEFAULT false          -- true = Yukti ships/updates this template, tenant can't edit body
  + audit cols
  UNIQUE(tenant_id, meta_template_name)
```

Platform-managed templates (OTP, order confirmations) live with `tenant_id = NULL` and `is_platform_managed = true` — tenants can toggle them on/off (already the "WhatsApp & Notifications" trigger toggles in Settings) but not edit the body, since Meta re-review is required on every body change and you don't want 200 tenants independently breaking template approval. Broadcast templates (marketing use cases) are tenant-owned, drafted in-app, submitted to Meta for approval through the provider adapter, and gated `approval_status = 'approved'` before they're selectable in the campaign builder.

### 4.2 `app.broadcast_campaigns` — a broadcast send job

```sql
app.broadcast_campaigns
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text NOT NULL                                -- distributor-facing label
  whatsapp_template_id uuid REFERENCES app.whatsapp_templates(id)
  use_case text NOT NULL                            -- same enum as §4.1
  target_type text NOT NULL CHECK (target_type IN ('cohort','buyer_selection','segment_filter','all_buyers'))
  target_cohort_id uuid NULL REFERENCES app.cohorts(id)
  target_filter jsonb NULL                          -- e.g. {"overdue_days_gt": 15} or {"route_id": "..."} or {"dormant_days_gt": 45}
  target_buyer_ids uuid[] NULL                       -- for manual_selection
  linked_catalog_id uuid NULL REFERENCES app.published_catalogs(id)  -- for "new stock" campaigns
  variable_bindings jsonb NOT NULL DEFAULT '{}'      -- maps template {{n}} to buyer/order fields
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','scheduled','sending','completed','partially_failed','cancelled'))
  scheduled_for timestamptz NULL
  estimated_recipient_count integer                 -- computed at build time, shown before send
  actual_recipient_count integer                    -- final resolved count at send time
  daily_cap_at_creation integer                      -- snapshot of tenant's plan-tier cap when created, for audit
  created_by uuid
  + audit cols
```

Note the `pending_review` status: given the blocking/quality-rating stakes of a shared number, you (platform admin) should manually approve the **first few campaigns per tenant** before auto-approval kicks in — cheap insurance against a distributor blasting an off-template or spammy message that tanks your shared number's quality rating for everyone. This can be a feature-flag-gated review queue (`df_broadcast_review_required`), defaulted on, turned off per-tenant once they've proven good hygiene.

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
  broadcast_campaign_id uuid NULL REFERENCES app.broadcast_campaigns(id)   -- NULL for transactional sends
  trigger_source text NOT NULL                       -- 'broadcast','order_placed','otp_login','dispatch_notice', etc.
  provider_message_id text                           -- Meta's wamid, for webhook correlation
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','read','failed','blocked_by_recipient','opted_out'))
  failure_reason text
  meta_cost numeric(10,4)                             -- Meta's actual per-message cost, INR, from provider webhook/invoice
  markup_pct numeric(5,2)                              -- markup % applied at send time, snapshot (not looked up later)
  billed_amount numeric(10,4)                          -- meta_cost * (1 + markup_pct/100), what the wallet was debited
  wallet_transaction_id uuid NULL REFERENCES app.whatsapp_wallet_transactions(id)
  sent_at timestamptz
  delivered_at timestamptz
  read_at timestamptz
  + audit cols
```

Index on `(tenant_id, meta_category, sent_at)` and `(tenant_id, broadcast_campaign_id)` — these two power every usage/billing query you'll run.

### 4.4 Gap: no AR/invoice ledger for payment-overdue segmentation

Use case #1 (overdue payment reminders, nearing `net_payment_days`) needs to know **who owes how much, since when.** Today's schema has `app.buyers.payment_terms_days` and `app.orders.total_amount`, but nothing tracking payment status/receipts — the MVP scope explicitly defers "payment reconciliation." **This is a real dependency, not a broadcast-feature detail** — flagging it because segmenting by "overdue" is one of your six headline use cases and it will produce wrong or empty audiences without it.

Two paths, pick one before building the payment-reminder use case:
1. **Minimum viable AR table**: add `app.buyer_ledger_entries` (`buyer_id`, `order_id NULL`, `entry_type` [invoice/payment], `amount`, `due_date`, `balance_running`) — populated manually by the distributor or pulled from Zoho/Tally exports where those integrations exist (WineYard's Zoho sync is a natural source). Lightweight, ships inside this feature.
2. **Defer the use case**: ship broadcast for use cases #2–6 first (no AR dependency), gate #1 behind the AR table landing later. Given payment collection is probably the single highest-value use case commercially (distributors care intensely about DSO), I'd lean toward path 1 even as a thin table — but that's your call given the 12-week build sequence is already tight.

### 4.5 Gap: no route/beat concept for geography-based targeting

Use case #4 (beat-route arrival notice) and part of #1 (route-based payment collection) need "which buyers does the collection agent visit on Tuesday's route" — `app.buyers.geography` today is just `{city, state, pincode, zone}`, no ordered route/beat grouping.

```sql
app.collection_routes
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text NOT NULL                                -- "North Delhi Beat 3"
  agent_name text
  agent_phone text
  visit_day_of_week integer[]                        -- e.g. {2,5} = Tue, Fri
  + audit cols

app.buyer_route_assignments
  buyer_id uuid REFERENCES app.buyers(id)
  route_id uuid REFERENCES app.collection_routes(id)
  PRIMARY KEY (buyer_id, route_id)
```

Small addition, reuses the static-list pattern already used for `app.cohort_members`. A route can double as a cohort target (`target_type = 'cohort'` isn't quite right since routes aren't cohorts) — model it as its own `segment_filter` value: `{"route_id": "..."}`.

### 4.6 Wallet & billing tables

```sql
app.whatsapp_wallets
  id uuid PK
  tenant_id uuid UNIQUE REFERENCES app.tenants(id)
  balance numeric(12,2) NOT NULL DEFAULT 0            -- INR, current spendable balance
  low_balance_threshold numeric(12,2) DEFAULT 100     -- triggers warning banner
  auto_topup_enabled boolean DEFAULT false
  auto_topup_amount numeric(12,2)
  + audit cols

app.whatsapp_wallet_transactions
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  wallet_id uuid REFERENCES app.whatsapp_wallets(id)
  transaction_type text CHECK (transaction_type IN ('topup','debit','refund','adjustment'))
  amount numeric(12,2) NOT NULL                       -- positive for topup/refund, negative for debit
  balance_after numeric(12,2) NOT NULL
  related_message_id uuid NULL REFERENCES app.whatsapp_messages(id)
  payment_reference text                              -- Razorpay/Stripe txn ID for topups
  notes text
  + audit cols

app.whatsapp_markup_config                            -- platform-level, not per-tenant (unless you want tenant-specific pricing later)
  id uuid PK
  meta_category text UNIQUE CHECK (meta_category IN ('marketing','utility','authentication'))
  markup_pct numeric(5,2) NOT NULL
  effective_from timestamptz NOT NULL DEFAULT now()
  + audit cols
```

`app.whatsapp_markup_config` is intentionally a tiny standalone table, not a JSON blob in tenant settings — you'll want to change markup % globally without touching every tenant row, and you'll want an auditable history of when markup changed (finance will ask). If you later want tenant-specific negotiated rates (e.g. WineYard gets a lower rate as an anchor customer), add an optional `app.tenant_markup_overrides (tenant_id, meta_category, markup_pct)` that takes priority over the global config — same override pattern as `app.price_list_assignments`.

**Debit flow**: on every successful send (`app.whatsapp_messages.status = 'sent'`), a `SECURITY DEFINER` RPC (`app.debit_whatsapp_wallet`) atomically: looks up `meta_cost` from the provider webhook (or an estimated cost if the webhook hasn't landed yet, reconciled later), applies `markup_pct` from config or override, debits the wallet, writes the transaction row, and stamps `billed_amount`/`wallet_transaction_id` back onto the message row. If wallet balance would go negative, the send should have been blocked pre-flight (§7.2), so this should be a rare reconciliation-only path, not the primary guard.

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

---

## 5. Sending pipeline

```
Campaign builder / transactional trigger
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
              per-tenant daily_broadcast_cap remaining
        │
        ▼
WhatsAppProviderAdapter.send() → BSP/Cloud API
        │
        ▼
Webhook receiver (Edge Function) updates app.whatsapp_messages.status,
  writes delivery/read timestamps, triggers wallet debit RPC
```

Build this as a Supabase scheduled function (`pg_cron`, matches your locked stack for background jobs) rather than a naive "send everything now" loop. A campaign of, say, 90 buyers should be **paced over the day**, not blasted in one burst — bursty sending is itself a spam signal to Meta's quality algorithm, independent of the daily cap.

---

## 6. Consumption tracking & transparency (the billing ask)

Extend the existing **Billing & Plan** settings page (already speced to show "WhatsApp credit balance + Top up") with:

1. **Usage-by-category chart** (marketing / utility / authentication), current billing period, sourced from `app.whatsapp_messages` grouped by `meta_category`. This is the transparency mechanism you asked for — tenant sees exactly what they consumed, by type, before disputing an invoice.
2. **Cost breakdown table**: messages sent, Meta's cost, your markup, total billed — per category. Whether you show the markup line item explicitly to tenants is a pricing-transparency call (some SaaS hide it as "platform fee included," others itemize it); either way, *you* need the breakdown internally even if the tenant only sees a blended per-message rate.
3. **Daily cap meter** for broadcasts specifically: "42 / 100 sent today," with a hard stop and clear message when the cap is hit (not a silent failure).
4. **Low-balance banner** (inherits the ≥80%-usage warning pattern already speced for tier limits) — warn before the wallet hits zero and sends start failing mid-campaign.
5. **Per-campaign report**: for each `app.broadcast_campaigns` row — sent/delivered/read/failed counts, cost, and (once you wire click tracking on template CTA buttons) click-through if you want to sell broadcast as a marketing channel with ROI, not just a utility.

---

## 7. Guardrails — protecting the shared number from getting blocked

This is the section that matters most operationally, because **one bad tenant can tank deliverability for all 50+ tenants sharing your number.** Treat this as non-negotiable infrastructure, not a nice-to-have.

### 7.1 Priority lanes

Transactional messages (OTP, order confirmation, dispatch) must never queue behind broadcast sends. `app.whatsapp_send_queue.priority` enforces this at the queue level — OTP always jumps the line. Losing an OTP send to broadcast congestion breaks login; losing a broadcast send to pacing is just a slower campaign.

### 7.2 Pre-flight checks before any campaign is allowed to send

- **Wallet balance** covers estimated cost of full recipient count (block if insufficient, don't partially send and strand a campaign).
- **Tenant daily cap** has enough headroom for the campaign size (or auto-split across days).
- **Template approval status** = `approved` in Meta (never allow sending on a `pending`/`rejected` template).
- **Opt-out check**: exclude any buyer who has previously replied STOP/opted out (`app.buyers` needs an `whatsapp_opt_out boolean` flag — add this; Meta requires you to honor opt-outs and this protects your quality rating).
- **Per-recipient 24h marketing cap**: Meta enforces ~2 marketing messages per user per day across *all* businesses on the platform, not just yours (error `131049` when exceeded) — pre-filter recipients who've already hit this from *your* sends today; you can't control other businesses' sends to the same user, but you can avoid being the ones who trip it. Recommend a stricter internal default: 1 marketing broadcast per buyer per day, full stop.
- **First-campaign review gate** (§4.2) for new tenants until they've built a clean sending history.

### 7.3 Quality rating monitoring

Poll Meta's quality rating (Green/Yellow/Red) for your WABA on a schedule (hourly is enough given Meta itself re-evaluates every 6 hours in 2026). Build an internal alert (Slack/email to you) on any drop to Yellow or Red — this is the earliest warning that a specific tenant's campaign is causing block/spam-report rates to spike. **Automatic circuit breaker**: if quality rating drops to Red, auto-pause all `sending`/`scheduled` broadcast campaigns platform-wide and require manual re-enable — do not let campaigns keep firing into a degrading number while you investigate. A drop below ~2–3% block rate on any single tenant's campaign should auto-pause *that tenant's* future broadcasts pending your review, even before it drags the whole-number rating down.

### 7.4 Template hygiene

- Server-side validate `meta_category` against what Meta actually approved — never trust a tenant's self-selected category in the UI (§3.3).
- Never let a tenant repurpose an order-notification (utility) template body for promotional content — Meta audits template content against category post-hoc and will reject/suspend mismatched templates, which burns your review cycle time.
- Track `messaging_tier` (250 → 1K → 10K → 100K/day) against total platform volume across all tenants combined — since October 2025 Meta shares limits across all numbers on one Business Portfolio, so if you ever add a second number, the ceiling is still shared. Alert yourself well before aggregate daily volume approaches the current tier ceiling, since growth here is entirely your top-line — don't let a tier cap silently throttle revenue.

### 7.5 Kill switch

A single platform-admin control (not a tenant-facing setting) to pause **all** outbound broadcast sending immediately — for the day Meta flags something and you need to stop everything while you sort it out with support. This should be a boolean read at the top of the pacing worker, checked before every batch pull, not something that requires a deploy.

---

## 8. RBAC & feature flags

- New flag: `df_whatsapp_broadcast` (default off, piloted on 1–2 tenants first, matching your existing feature-flag discipline). Gates both the UI (`/broadcasts` nav route) and the underlying RPCs.
- Sub-flag: `df_broadcast_review_required` (default on) — the manual first-campaign approval gate, per tenant, until you're confident in their hygiene.
- **Role**: broadcast campaign creation/send is `seller_admin` only — same tier as cohort/price-list management and Tally export in the existing role matrix (`DealFlow_Product-Spec_v1.md` §6.1). `seller_assistant` can view campaign reports but not create/send, consistent with how they're already excluded from cohort/price-list management.
- Sensitive write paths (`send campaign`, `approve template`, `debit wallet`) go through `SECURITY DEFINER` RPCs with role re-verified inside — same pattern as `publish catalog` / `change order status`.

---

## 9. UI touchpoints

| Surface | Change |
|---|---|
| Seller sidebar nav | New item: **Broadcasts** (suggest `MessageCircle` or `Megaphone` lucide icon), positioned after Orders, before Exports |
| `/broadcasts` (new route) | Campaign list (draft/scheduled/sending/completed), "New broadcast" CTA (`<Plus/>` + "New broadcast", per your icon+label CTA rule) |
| Campaign builder (new) | Step flow: pick use case → pick/create template → pick targeting mode (cohort / segment filter / manual / all buyers) → preview audience count + estimated cost → review (if gated) → schedule/send |
| Settings → General → WhatsApp & Notifications | No structural change — existing transactional toggles stay; add a note that these are now billed as utility/authentication messages, link to Billing & Plan for consumption detail |
| Settings → Feature Modules → Buyer App → "WhatsApp Business Number" | **Behavior change required** — becomes read-only / repurposed as display label, per the shared-number decision in §3.1a. Flag this as a follow-up edit to `DealFlow_Settings-Spec_v3.md`, not silently reinterpreted. |
| Settings → Billing & Plan | Extend per §6: usage-by-category, cost breakdown, daily cap meter, campaign reports |
| Buyer-facing | None — buyers just receive WhatsApp messages; no buyer-app UI change required for MVP |

---

## 10. Build sequence (extends the 12-week plan, propose as a post-MVP phase)

| Phase | Deliverable |
|---|---|
| A | Retrofit existing OTP + order-notification sends through `app.whatsapp_messages` ledger + provider adapter (no behavior change, just instrumentation) — this alone unlocks accurate utility/auth consumption tracking, which you asked for regardless of broadcast |
| B | Wallet + markup config tables, debit RPC, Billing & Plan usage UI |
| C | Templates registry + Meta submission flow (start with 3–4 templates: new-stock, dormant-reengagement, buyer-app-nudge — the ones with no data-gap dependency) |
| D | Campaign builder UI + targeting (`cohort`, `manual_selection`, `all_buyers` targeting modes only — defer `segment_filter` until routes/AR land) |
| E | Pacing worker + guardrails (§7) — do not skip or shortcut this phase to hit a date; this is what protects the number every other tenant depends on |
| F | `app.collection_routes` + beat-route targeting (use case #4) |
| G | `app.buyer_ledger_entries` (thin AR table) + payment-reminder `segment_filter` targeting (use case #1) — gate on whether Zoho/Tally data can seed it, else manual entry only |

Pilot on WineYard first, same as the Zoho integration — they're already your reference tenant and have real payment/collection pain to validate against.

---

## 11. Open decisions — need your input before implementation starts

1. **Provider strategy**: stay on current BSP (AiSensy/Interakt) for MVP, or evaluate becoming a direct Meta Tech Provider now? Affects markup ceiling and how much billing reconciliation logic you build vs. inherit from the BSP.
2. **Markup percentages**: no numbers assumed anywhere in this spec — `app.whatsapp_markup_config` ships with whatever you set. Needs your input on category-by-category rates.
3. **AR data source for payment reminders**: build the thin `app.buyer_ledger_entries` table (manual entry to start) now, or defer use case #1 until Zoho sync (already in MVP scope) can feed it automatically?
4. **First-campaign manual review**: are you personally reviewing every new tenant's first broadcast, or is this too much ops overhead for a solo founder at scale? If it doesn't scale past ~10 tenants, we should design an automated content/link-safety check instead.

Sources: [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) · [Group messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging) · [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) · [Per-user marketing template limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/) · [WhatsApp Business API Pricing 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026) · [Tech Provider model — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)
