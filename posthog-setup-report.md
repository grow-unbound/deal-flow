<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the yukti distributor platform. The existing infrastructure (instrumentation-client.ts, posthog-server.ts, PostHogProvider, next.config.js rewrites, and signin tracking) was already in place from a prior run. This pass added client-side user identification on login success, fixed the `ui_host` configuration (was pointing to the ingest endpoint instead of the PostHog app UI), and instrumented 8 new business events across the buyer PWA and seller API routes. Server-side events fire non-blocking with `await ph.flush()` and never delay API responses.

| Event | Description | File |
|---|---|---|
| `catalog_viewed` | Buyer opens authenticated catalog view — feeds seller-side funnel analytics | `app/(buyer)/shop/catalog/page.tsx` |
| `catalog_item_added_to_cart` | Buyer adds a product to cart — feeds seller-side conversion funnel | `src/contexts/BuyerCartContext.tsx` |
| `inquiry_submitted` | Buyer submits inquiry from checkout (client-side confirmation) | `app/(buyer)/shop/checkout/page.tsx` |
| `inquiry_created` | Server confirms estimate persisted — authoritative buyer conversion event | `app/api/buyer/estimates/route.ts` |
| `buyer_otp_verified` | Buyer completes OTP verification — top of buyer acquisition funnel | `app/api/auth/phone-otp/verify/route.ts` |
| `catalog_published` | Seller publishes a catalog — key seller activation milestone | `app/api/tenant/catalogs/[id]/route.ts` |
| `customer_created` | Seller adds a new buyer/customer — seller onboarding depth metric | `app/api/customers/route.ts` |
| `brand_created` | Seller adds a new brand to portfolio — seller portfolio depth metric | `app/api/tenant/brands/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/370765/dashboard/1707985)
- [Buyer inquiry funnel (catalog → cart → submitted)](https://us.posthog.com/project/370765/insights/pxg6mCUV)
- [Daily inquiries submitted](https://us.posthog.com/project/370765/insights/pBWDYskf)
- [Seller activation events (brands, customers, catalogs)](https://us.posthog.com/project/370765/insights/IjzX5DWK)
- [Buyer OTP verifications (acquisition)](https://us.posthog.com/project/370765/insights/VyVVmxIp)
- [Seller sign-ins (unique users)](https://us.posthog.com/project/370765/insights/sBuFMGiX)

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
