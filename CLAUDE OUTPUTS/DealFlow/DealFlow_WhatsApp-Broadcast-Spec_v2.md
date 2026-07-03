# DealFlow (Yukti) — WhatsApp Broadcast Capability — Spec v2

**Module:** Multi-tenant WhatsApp Broadcast + Consumption Metering + Markup Billing
**Date:** 2026-07-02 | **For:** Phani | **Audience:** Solo-founder build plan, extends `DealFlow_Product-Spec_v1.md` and `DealFlow_Settings-Spec_v3.md`

**v2 changelog (from customer-validated scope cut):** dropped AR/ledger and beat-route tables entirely for MVP — geography filtering on existing `app.buyers.geography` covers targeting; overdue-payment reminder use case deferred (no data source yet, not simulated); wallet billing simplified to synchronous deduct-on-send with hard block-on-empty, no async Meta-webhook cost reconciliation dependency; markup reframed as the price of *targeting convenience*, not the broadcast infrastructure itself; added implied opt-in-at-first-login consent mechanism; broadcast repositioned as an early acquisition/stickiness feature, not a deferred post-MVP add-on — this is now informed by direct customer pull ("even with 100 features, this is what we'd use daily"), not a hypothesis.

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
| MVP targeting scope | **Cohort, manual selection, "all buyers," and geography filter only** (using the existing `app.buyers.geography` jsonb — city/state/pincode/zone). No AR ledger, no route/beat tables, not even a thin version, for MVP. |
| Consent | **Implied opt-in**, captured with a notice at first buyer login (OTP flow) rather than a separate consent flow — see §4.8 (new). |

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

### 3.3 Message taxonomy — mapping your 6 use cases (revised, MVP-scoped)

| # | Use case | MVP status | Meta template category | Targeting mechanism |
|---|---|---|---|---|
| 1 | Payment reminder (overdue / by route / nearing `net_payment_days`) | **Deferred** — no AR/ledger data source in MVP, not simulated with a proxy (see §4.4) | n/a until built | n/a |
| 2 | New stock / campaign marketing (New in Stock, Latest Arrivals, Flash Sale, Discount, Clearance) | **In scope** | **Marketing** | `campaign` (linked to `app.published_catalogs`, i.e. "Campaigns" post-rename) or `cohort` |
| 3 | Preset cohorts or ad-hoc individual selection | **In scope** | n/a (targeting mode) | `cohort` \| `manual_selection` \| `geography_filter` \| `all_buyers` |
| 4 | Beat-route arrival ("agent visiting soon, be ready") | **In scope, simplified** — no route/beat table; seller filters by existing `app.buyers.geography` (city/pincode/zone) instead of an ordered route. Coarser than "Tuesday's exact route" but ships with zero new schema. | **Utility** (operationally triggered) | `geography_filter` |
| 5 | Buyer-app onboarding / self-service nudge | **In scope** | **Marketing** or **Utility** depending on wording — Meta is strict here (see §7.4) | `geography_filter` \| `all_buyers` |
| 6 | Dormant customer re-engagement | **In scope** | **Marketing** | `dormant_filter` on `orders.placed_at` staleness — this is a computed query, not a new table, so it stays in scope |

**On category classification** — Meta enforces this, not you. Beat-route notices *feel* transactional to a distributor, but Meta's utility-template policy is narrow: utility templates must relate to an existing transaction and cannot include promotional content. Don't let tenants self-classify templates in the UI — validate category server-side against Meta's actual approval (`app.whatsapp_templates.meta_category`), and default anything ambiguous to marketing so you never get flagged for miscategorization (which stalls tier progression, per Meta's 2026 policy).

**Use case #1 is not quietly dropped** — it's very likely your highest-commercial-value use case (distributors care intensely about collections), and it's the one your customers explicitly called out. It's deferred because building it properly needs real AR data, and simulating it with a rough proxy (e.g., "credit_limit exceeded") risks a distributor acting on a wrong number — worse for trust than not having the feature at all. Revisit once the Zoho sync (already in MVP scope for WineYard) can feed real invoice/payment data, or once you decide a minimal manual ledger is worth building (§4.4).

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
  target_type text NOT NULL CHECK (target_type IN ('cohort','buyer_selection','geography_filter','dormant_filter','all_buyers'))
  target_cohort_id uuid NULL REFERENCES app.cohorts(id)
  target_filter jsonb NULL                          -- e.g. {"city":"Nashik"} or {"zone":"West"} (geography_filter) or {"dormant_days_gt": 45} (dormant_filter)
  target_buyer_ids uuid[] NULL                       -- for manual (buyer_selection)
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
  rate_card_cost numeric(10,4)                        -- platform rate-card cost for this category at send time (snapshot, not Meta's live invoice figure)
  markup_pct numeric(5,2)                              -- markup % applied at send time, snapshot (not looked up later)
  billed_amount numeric(10,4)                          -- rate_card_cost * (1 + markup_pct/100), what the wallet was debited synchronously on send
  wallet_transaction_id uuid NULL REFERENCES app.whatsapp_wallet_transactions(id)
  sent_at timestamptz
  delivered_at timestamptz
  read_at timestamptz
  + audit cols
```

Index on `(tenant_id, meta_category, sent_at)` and `(tenant_id, broadcast_campaign_id)` — these two power every usage/billing query you'll run.

### 4.4 Deferred (not built): AR/invoice ledger and route/beat tables

Confirmed decision: **no AR ledger, no route/beat tables, not even a thin version, for MVP.** Use case #1 (payment reminders) is deferred entirely rather than approximated — a rough "credit_limit exceeded" proxy off existing fields was considered and rejected, because a wrong "you're overdue" message sent to a buyer who actually isn't is worse for distributor trust than not having the feature yet. Use case #4 (beat-route arrival) ships against **existing** `app.buyers.geography` (`city`/`state`/`pincode`/`zone`) instead of an ordered route table — coarser ("everyone in this pincode") than "exactly who's on Tuesday's route," but real distributor value with zero new schema. Revisit both once real payment/route data exists (Zoho sync, or distributor demand justifies a purpose-built route builder).

### 4.5 Geography-based targeting (uses existing data, no new tables)

`app.buyers.geography` already stores `{city, state, pincode, zone}` — the campaign builder's `geography_filter` target type queries directly against this jsonb column (e.g. `geography->>'city' = 'Nashik'`). No schema change needed here; this is the targeting mechanism for use cases #3, #4, and #5.

### 4.6 Wallet & billing tables — simplified to synchronous deduct-and-block

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

app.whatsapp_rate_card                                -- platform-level, not per-tenant (unless you want tenant-specific pricing later)
  id uuid PK
  meta_category text UNIQUE CHECK (meta_category IN ('marketing','utility','authentication'))
  base_cost numeric(10,4) NOT NULL                    -- your platform's fixed per-message cost assumption for this category (set with headroom over Meta's published rate + BSP fee, so you're never underwater on a single send)
  markup_pct numeric(5,2) NOT NULL
  effective_from timestamptz NOT NULL DEFAULT now()
  + audit cols
```

`app.whatsapp_rate_card` is intentionally a tiny standalone table, not a JSON blob in tenant settings — you'll want to change rates/markup globally without touching every tenant row, and you'll want an auditable history of when pricing changed (finance will ask). If you later want tenant-specific negotiated rates (e.g. WineYard gets a lower rate as an anchor customer), add an optional `app.tenant_markup_overrides (tenant_id, meta_category, markup_pct)` that takes priority over the global config — same override pattern as `app.price_list_assignments`.

**Debit flow — synchronous, no reconciliation dependency (per your direction):** at the moment a message is dispatched to the provider (not on a later delivery webhook), a `SECURITY DEFINER` RPC (`app.debit_whatsapp_wallet`) atomically: reads `base_cost` + `markup_pct` for the message's category from `app.whatsapp_rate_card` (or a tenant override), computes `billed_amount`, debits `app.whatsapp_wallets.balance`, writes the `app.whatsapp_wallet_transactions` row, and stamps `billed_amount`/`wallet_transaction_id` onto the message row — all in the same transaction as the queue pop, so a send can never leave the wallet undebited. Pre-flight (§7.2) checks wallet balance covers the campaign's full estimated cost before any send starts; if the wallet hits zero mid-campaign anyway (e.g. a concurrent broadcast from another campaign drained it), the remaining queued sends for that campaign are auto-cancelled and the seller sees exactly how many went out before the wallet ran dry. This intentionally does not try to reconcile against Meta's actual invoiced cost in the live path — set `base_cost` with enough headroom that you're never selling below your real cost, and true up the rate card periodically (monthly) against your actual Meta/BSP bill instead of chasing per-message reconciliation.

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

### 4.8 Consent — implied opt-in at first login, with an explicit opt-out path

You asked for the lightest-touch version: buyers are implicitly opted into WhatsApp communication with a notice shown at first login, not a separate consent checkbox flow. That's a reasonable MVP call, but build the record-keeping now even though the UX is light — you want an auditable timestamp of when and how consent was captured, because that's what protects you if Meta or a regulator ever asks, not the UX itself.

```sql
-- additions to app.buyers
  whatsapp_consent_at timestamptz NULL              -- set once, at first login, never overwritten
  whatsapp_consent_method text                       -- 'implied_first_login_notice' (only value for MVP; leaves room for 'explicit_checkbox' later)
  whatsapp_opt_out_at timestamptz NULL                -- set when buyer replies STOP or uses an opt-out link/setting; NULL = still opted in
```

Mechanics: on a buyer's first successful WhatsApp OTP login, show a one-line, non-blocking notice — something like *"We'll use WhatsApp to send you order updates and offers from \{\{seller_name\}\}. Reply STOP anytime to opt out."* — and stamp `whatsapp_consent_at`/`whatsapp_consent_method` at that moment, no separate confirmation tap required. Every broadcast pre-flight check (§7.2) excludes any buyer with `whatsapp_opt_out_at IS NOT NULL`, and you need an inbound-message webhook handler that watches for STOP/UNSUBSCRIBE replies and sets that field automatically — this is not optional, Meta expects opt-outs to be honored and it directly protects your quality rating.

One honest caveat, not a blocker: implied consent-by-notice is thinner than an explicit opt-in checkbox, and Meta's own template review is generally stricter about marketing-category sends needing clear proof of opt-in. If a marketing template gets flagged in review, tightening this to an explicit (but still lightweight — single tap) confirmation is the likely fix. Ship the light version now, keep `whatsapp_consent_method` as an enum specifically so you can add `'explicit_checkbox'` later without a schema change.

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
              per-tenant daily_broadcast_cap remaining,
              wallet balance still covers this message (re-check at pop time, not just campaign creation)
        │
        ▼
app.debit_whatsapp_wallet RPC (synchronous — debits wallet, stamps billed_amount, same transaction as queue pop)
        │
        ▼
WhatsAppProviderAdapter.send() → BSP/Cloud API
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
4. **Low-balance banner** (inherits the ≥80%-usage warning pattern already speced for tier limits) — warn before the wallet hits zero. Once it does hit zero, **new broadcasts are blocked outright** (campaign builder's "Send" action is disabled with a "Top up to send" CTA, not a silent queue-and-fail) — per your direction, this is the primary guardrail against overspend, not a nice-to-have.
5. **Per-campaign report**: for each `app.broadcast_campaigns` row — sent/delivered/read/failed counts, cost, and (once you wire click tracking on template CTA buttons) click-through if you want to sell broadcast as a marketing channel with ROI, not just a utility.

---

## 7. Guardrails — protecting the shared number from getting blocked

This is the section that matters most operationally, because **one bad tenant can tank deliverability for all 50+ tenants sharing your number.** Treat this as non-negotiable infrastructure, not a nice-to-have.

### 7.1 Priority lanes

Transactional messages (OTP, order confirmation, dispatch) must never queue behind broadcast sends. `app.whatsapp_send_queue.priority` enforces this at the queue level — OTP always jumps the line. Losing an OTP send to broadcast congestion breaks login; losing a broadcast send to pacing is just a slower campaign.

### 7.2 Pre-flight checks before any campaign is allowed to send

- **Wallet balance** covers estimated cost of full recipient count (block if insufficient, don't partially send and strand a campaign) — re-checked again at queue-pop time per message, since balance can move between campaign creation and actual send (§5).
- **Tenant daily cap** has enough headroom for the campaign size (or auto-split across days).
- **Template approval status** = `approved` in Meta (never allow sending on a `pending`/`rejected` template).
- **Opt-out check**: exclude any buyer with `app.buyers.whatsapp_opt_out_at IS NOT NULL` (§4.8) — Meta requires you to honor opt-outs and this protects your quality rating.
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
| Settings → Billing & Plan | Extend per §6: usage-by-category, cost breakdown, daily cap meter, "buy more credits" flow, campaign reports |
| Buyer PWA — first login | New: one-line consent notice shown once at first successful WhatsApp OTP login (§4.8), non-blocking, stamps `whatsapp_consent_at`. This is the only buyer-facing UI change for MVP. |
| Buyer profile | Add a simple "Communication preferences" line showing opted-in status + how to stop (mirrors the STOP-reply mechanism, doesn't need to be a toggle for MVP) |

---

## 10. Build sequence — repositioned as an early, not deferred, feature

Given this is customer-validated as the daily-use feature — the thing distributors reach for before they're sophisticated enough to build cohorts and campaigns — treat it as a **parallel early-build track, not a post-MVP bolt-on.** It doesn't need catalogs, cohorts, or pricing to be functional (geography filter + manual selection are independent of those), so it can land well before Week 6-8 catalog publishing in the original 12-week plan. Concretely: pull it in alongside Week 4 (Customer Master ships — the moment `app.buyers.geography` exists, geography-filter broadcast is buildable) rather than waiting for Week 11+.

| Phase | Deliverable |
|---|---|
| A | Retrofit existing OTP + order-notification sends through `app.whatsapp_messages` ledger + provider adapter (no behavior change, just instrumentation) — unlocks accurate utility/auth consumption tracking regardless of broadcast, do this first since everything else depends on the ledger existing |
| B | Wallet + rate-card tables, synchronous debit RPC, block-on-empty enforcement, Billing & Plan usage/top-up UI |
| C | Consent (§4.8): `app.buyers` columns, first-login notice, STOP-reply webhook handler — small but do it alongside B, not as an afterthought |
| D | Templates registry + Meta submission flow (start with 3–4 templates: new-stock, dormant-reengagement, buyer-app-nudge, beat-route-geography) |
| E | Campaign builder UI + targeting (`cohort`, `manual_selection`, `geography_filter`, `all_buyers` — full MVP targeting scope, no deferred modes left to wait on) |
| F | Pacing worker + guardrails (§7) — do not skip or shortcut this phase to hit a date; this is what protects the number every other tenant depends on, and matters *more* given this is now a primary daily-use surface, not a secondary one |

Payment-reminder (use case #1) stays explicitly out of this sequence — revisit once Zoho sync or a deliberate AR-table decision gives it real data (§4.4).

Pilot on WineYard first, same as the Zoho integration — they're already your reference tenant, and also a good test of whether a "no-frills" broadcast adoption pattern shows up before the more sophisticated catalog/cohort features do, which would validate the acquisition-driver thesis directly.

---

## 11. Open decisions — need your input before implementation starts

1. **Provider strategy**: stay on current BSP (AiSensy/Interakt) for MVP, or evaluate becoming a direct Meta Tech Provider now? Affects markup ceiling and how much billing reconciliation logic you build vs. inherit from the BSP.
2. **Rate-card values**: `app.whatsapp_rate_card.base_cost` and `markup_pct` per category — no numbers assumed anywhere in this spec, needs your input. Since markup is now explicitly framed as pricing *targeting*, not the message relay, consider whether that argues for a simpler pricing story to distributors (e.g., a flat "credits" unit price that doesn't visibly vary by Meta category at all) rather than three separate category rates — worth deciding before building the Billing UI around category-level breakdowns.
3. **Consent hardening trigger**: ship implied opt-in-at-first-login now (§4.8); what's the trigger to move to explicit opt-in — a specific Meta template rejection, a legal review finding, or a fixed revisit date regardless? Pick one now so it doesn't just get silently deferred forever.
4. **First-campaign manual review**: are you personally reviewing every new tenant's first broadcast, or is this too much ops overhead for a solo founder at scale? If it doesn't scale past ~10 tenants, we should design an automated content/link-safety check instead. This matters more now that broadcast is positioned as an early-adoption feature — more tenants will hit this gate sooner than in the original deferred-phase plan.
5. **AR data source for payment reminders**: still open for later — build a thin ledger table once Zoho sync or explicit distributor demand justifies it, or keep deferring indefinitely and let it stay a Zoho-only capability?

Sources: [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) · [Group messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging) · [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) · [Per-user marketing template limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/) · [WhatsApp Business API Pricing 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026) · [Tech Provider model — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)
