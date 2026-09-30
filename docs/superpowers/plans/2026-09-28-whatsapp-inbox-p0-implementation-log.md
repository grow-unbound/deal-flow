# WhatsApp Inbox P0 Implementation Log

Date: 2026-09-28

## Summary of Work Completed

- Added `df_whatsapp_inbox` as a tenant-scoped rollout flag, default-off when PostHog is unavailable.
- Added inbound WhatsApp thread/message persistence for P0 Today inbox entries.
- Extended the WhatsApp inbound webhook to process inbound text/button messages, evaluate the tenant flag, support tenant-owned WABA resolution, and support a single platform-number fallback tenant for P0 testing.
- Added `whatsapp_buyer_message` Today entry support and `whatsapp_thread` source entity support.
- Added a seller-authenticated manual reply API and UI composer for WhatsApp Today entries.
- Extended WhatsApp Cloud API clients and dispatch worker to send service-window text replies through the existing ledger/queue/dispatch flow.
- Added focused tests for flag behavior, migration/webhook contract, Today copy, service-window blocking, and outbound audit linkage.

## Files Changed

- `supabase/migrations/20260928125155_whatsapp_inbox_p0.sql`
- `supabase/functions/whatsapp-inbound-webhook/index.ts`
- `supabase/functions/_shared/whatsapp-client.ts`
- `supabase/functions/_shared/whatsapp-dispatch.ts`
- `src/lib/server/whatsapp-client.ts`
- `src/lib/server/whatsapp-enqueue.ts`
- `src/lib/server/whatsapp-ledger.ts`
- `src/lib/server/whatsapp-template-validation.ts`
- `src/lib/server/tenant-flags-resolve.ts`
- `src/constants/index.ts`
- `app/api/tenant/entries/route.ts`
- `app/api/tenant/entries/count/route.ts`
- `app/api/tenant/entries/[id]/whatsapp-reply/route.ts`
- `src/hooks/useInboxEntries.ts`
- `src/lib/inbox/inbox-types.ts`
- `src/lib/inbox/inbox-entry-copy.ts`
- `src/components/seller/inbox/InboxEntryDetailContent.tsx`
- `src/components/seller/inbox/InboxActionBar.tsx`
- Existing template-send typing narrowed in `src/lib/server/whatsapp.ts`, `src/lib/server/buyer-app-enable-notify.ts`, and `src/lib/server/whatsapp-broadcast-send.ts`
- Tests:
  - `src/tests/lib/flags.test.ts`
  - `src/tests/inbox-entry-copy.test.ts`
  - `src/tests/whatsapp-inbox-reply-api.test.ts`
  - `src/tests/whatsapp-inbox-p0-migration.test.ts`

Note: unrelated pre-existing dirty files in auth/pending areas were left untouched.

## Migration Added

`supabase/migrations/20260928125155_whatsapp_inbox_p0.sql`

What it does:

- Extends `app.entries.entry_type` with `whatsapp_buyer_message`.
- Extends `app.entries.source_entity_type` and `app.whatsapp_messages.related_entity_type` with `whatsapp_thread`.
- Creates `app.whatsapp_threads`.
- Creates `app.whatsapp_thread_messages`.
- Adds RLS, seller read policies, and service-role grants for the new tables.
- Adds provider-message id idempotency for inbound thread messages.
- Updates `app.entry_allowed_actions` and latest `app.list_entries`.
- Adds `app.process_whatsapp_inbound_message(...)` for service-role inbound ingestion.
- Adds `app.record_whatsapp_thread_outbound_reply(...)` for outbound reply audit linkage.
- Updates `app.prepare_whatsapp_message_for_send(...)` so `meta_category = 'service'` text replies are prepared without template approval or credit debit.

## Tests Run and Results

- `pnpm exec vitest run src/tests/lib/flags.test.ts src/tests/inbox-entry-copy.test.ts src/tests/whatsapp-inbox-reply-api.test.ts src/tests/whatsapp-inbox-p0-migration.test.ts --reporter=verbose`
  - Passed: 4 files, 22 tests.
- `pnpm run type-check`
  - Passed.
- `git diff --check`
  - Passed.

## Pending Work

- Apply the migration to a verified dev-linked Supabase project and run DB-level verification/advisors. Not run here because linked Supabase commands require explicit dev verification/authorization.
- Configure PostHog `df_whatsapp_inbox` for the P0 test tenant.
- Configure `WHATSAPP_PLATFORM_TENANT_ID` and platform phone-number id env vars for P0 testing.
- Run an end-to-end Meta webhook/send test against the dev project after env and flag setup.

## Deferred Scope for P1/P2

- Multi-tenant routing on a shared platform WhatsApp number.
- Production rollout for non-owned/shared numbers.
- Approved Meta template replies outside the 24-hour service window.
- Deterministic reply suggestions.
- AI-generated drafts, tool-grounded facts, or autonomous sends.
- Financial-fact prepared replies.
- Seller-driven buyer-resolution UI for ambiguous WhatsApp contacts.

## New Findings and Product/Architecture Questions

- P0 can safely test on one platform-number tenant, but shared-number routing beyond one tenant should not ship because sender phone alone is ambiguous and can cause cross-tenant leakage.
- Tenant-owned WABA `phone_number_id` mapping is the clean production path.
- Service-window text replies currently skip WhatsApp credit debit in `prepare_whatsapp_message_for_send`; billing policy for service conversations should be decided before broader rollout.
- The webhook uses PostHog `/decide` directly in the Edge Function because the existing Node flag resolver is not available in Deno.

## Product Review Decisions and Follow-ups

- Duplicate WABA number mapping: P0 will use Yukti's platform WABA/platform phone number mapped to one configured test tenant only. The safest production control is to require tenant-owned OAuth/WABA phone numbers, enforce a unique active `phone_number_id` mapping across connected WhatsApp integrations, and fail closed/quarantine inbound webhooks when a phone number maps to zero or multiple tenants.
- STOP/UNSUBSCRIBE: P0 accepts phone-level opt-out behavior when tenant resolution fails. Once tenant-owned WhatsApp OAuth is enabled, STOP should be tenant-scoped because messages will come from tenant-specific phone numbers.
- Seller-assistant/location scoping: P0 intentionally keeps WhatsApp inbox entries visible across locations for seller response speed. Only new buyer approvals remain admin-only for now.
- Unknown senders: best PM path is to treat these as unverified WhatsApp contacts/leads rather than fully matched buyers. Sellers should be able to manually reply within the service window, but the contact should stay in an "unverified" state with no buyer-app access, no buyer-admin prepared copy, and no financial/account context until a seller explicitly resolves it to an existing buyer or creates/approves a new buyer.
- Reply audit: outbound thread messages should distinguish queued/sending/sent/failed states. A follow-up should show "Failed to send message" in the thread with a Retry action, and only mark a reply sent/processed after the WhatsApp ledger/provider send succeeds.

## Risks and Blockers Before Rollout

- Migration has not been applied to dev or validated with Supabase advisors in this session.
- PostHog outage or missing key fails closed for inbound webhook processing.
- The P0 UI uses entry metadata for the displayed bundle; durable full history exists in thread tables but no separate thread-history API was added.
- Outside-window replies are blocked until template send support for this inbox is implemented.
- Current P0 reply audit records an outbound thread message before dispatch success; follow-up status/retry handling should land before a broader rollout.
