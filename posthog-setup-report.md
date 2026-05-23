<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the DealFlow Next.js App Router project.

## Summary of changes

- **`instrumentation-client.ts`** (new) — Client-side PostHog initialization using the Next.js 15.3+ pattern. Uses `/ingest` reverse proxy, enables `capture_exceptions` for automatic error tracking, and enables debug mode in development.
- **`src/components/providers/PostHogProvider.tsx`** (updated) — Removed the duplicate `posthog.init()` call. The provider now only sets up the React context so `usePostHog()` hooks continue to work throughout the app.
- **`next.config.js`** (updated) — Added PostHog reverse proxy rewrites (`/ingest/static/*`, `/ingest/array/*`, `/ingest/*`) and `skipTrailingSlashRedirect: true` to support PostHog's trailing slash API requests.
- **`src/lib/posthog-server.ts`** (new) — Server-side PostHog client using `posthog-node` for capturing events from API routes with `flushAt: 1` to ensure immediate delivery in serverless environments.
- **`app/(auth)/login/page.tsx`** (updated) — Captures `user_signed_in` with `posthog.identify()`, `login_failed` with error reason, and `captureException` on network errors. Passes `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` headers to correlate client and server events.
- **`app/(auth)/signup/page.tsx`** (updated) — Captures `user_signed_up` with `posthog.identify()`, `signup_failed` with error reason, and `captureException` on network errors. Passes correlation headers to the server.
- **`app/api/auth/signin/route.ts`** (updated) — Server-side `server_user_signed_in` event with `identify()` for both seller and buyer paths. Reads `X-POSTHOG-DISTINCT-ID` header to correlate with the client session.
- **`app/api/auth/signup/route.ts`** (updated) — Server-side `server_tenant_created` event with `identify()` after successful tenant workspace creation. Includes tenant metadata for acquisition funnel analysis.
- **`.env.local`** (updated) — `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` set to correct values.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `user_signed_in` | Fired on successful login. Calls `posthog.identify()` with user ID, email, and role. | `app/(auth)/login/page.tsx` |
| `login_failed` | Fired when login fails. Includes error reason. | `app/(auth)/login/page.tsx` |
| `user_signed_up` | Fired on successful signup. Calls `posthog.identify()` with user ID and email. Includes tenant slug, business name, state, and plan. | `app/(auth)/signup/page.tsx` |
| `signup_failed` | Fired when signup fails. Includes error reason. | `app/(auth)/signup/page.tsx` |
| `server_user_signed_in` | Server-side login event. Includes user type (seller/buyer), role, tenant/buyer ID. Correlated with client session via headers. | `app/api/auth/signin/route.ts` |
| `server_tenant_created` | Server-side tenant creation event. Top of the distributor acquisition funnel. Includes tenant ID, slug, business name, state, and plan. | `app/api/auth/signup/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1621438)
- [New signups over time](/insights/tuReVkpQ) — Distributor account signups per day
- [Logins over time](/insights/LU7iXGBl) — Successful logins per day
- [Login failure rate](/insights/vwBixrAf) — Ratio of failed to successful logins (auth friction signal)
- [Signup to first login funnel](/insights/3O8zwxk5) — Conversion from account creation to first login
- [New tenant workspaces created](/insights/wPtuWXH3) — Distributor workspace creation rate

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
