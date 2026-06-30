# Zoho Connection Hang Fix

## Problem
The Zoho Books integration connection flow was hanging after OAuth completion:
- Browser showed "Connection ready" in Zoho
- Yukti app showed "window closed before connection finished"
- No logs from `integrations-connect` or `integrations-webhook` Edge Functions

**Root Cause:** The OAuth callback endpoint was synchronously registering webhooks with Zoho before returning the success response. Webhook registration involves multiple sequential Zoho API calls with no timeouts, causing indefinite hangs if Zoho API is slow.

## Solution
Moved webhook registration from the hot OAuth path to a background Edge Function job.

### Changes

#### 1. Modified OAuth Callback
**File:** `/app/api/settings/integrations/zoho/oauth/callback/route.ts`

- Creates webhook records in `pending` status immediately (lines 647-680)
- Seeds integration data flows with pending webhook IDs (lines 682-693)
- Fire-and-forgets webhook setup job via Edge Function (lines 710-728)
- Returns success HTML immediately (no webhook registration wait)

**Key:** The callback returns almost instantly after creating the integration record. Webhook registration now happens asynchronously.

#### 2. Created Background Job
**File:** `/supabase/functions/integrations-webhook-setup/index.ts` (NEW)

Handles webhook registration asynchronously:
- Deletes old webhook registrations (cleanup)
- Registers new webhooks with Zoho via Zoho API
- Includes 30-second timeouts per request (prevents indefinite hangs)
- Updates webhook records as they complete
- Updates integration config with final setup status
- Can be retried if it fails

### Flow

```
OLD (Blocking):
OAuth Callback → Exchange Tokens → Create Integration → [LONG WAIT] Register Webhooks → Return Success

NEW (Async):
OAuth Callback → Exchange Tokens → Create Integration → Fire Job → Return Success Immediately
                                                              ↓
                                         Background Job: Register Webhooks (async)
```

### User Experience

1. User clicks "Connect to Zoho"
2. Zoho OAuth window opens
3. User logs in and authorizes
4. Zoho redirects to callback
5. **Instantly:** "Connection ready" page + localStorage update
6. **Browser stays open** and user can close tab
7. **Background:** Webhooks register (30s timeout per request)
8. **Integration status** updates from `pending_registration` → `active` (once webhooks complete)

## Testing

After deploying, verify:

1. **Callback returns quickly:** Monitor Vercel logs, should see callback complete in <1s
2. **Webhook setup queued:** Check Edge Function logs for `integrations-webhook-setup` starting
3. **Webhooks register:** Verify webhook records change from `status='pending'` to `status='active'`
4. **Integration config updated:** Check `webhook_setup.status` changes from `pending_registration` to `active`

## Rollback

If webhook registration is failing:
1. Check Edge Function logs for `integrations-webhook-setup` errors
2. Verify Zoho credentials are still valid
3. Check Supabase logs for database errors
4. Can retry by manually calling the webhook setup function or reconnecting

## Future Improvements

- Add retry logic with exponential backoff for transient Zoho API failures
- Add UI indicator showing "Webhooks setting up..." status
- Add webhook health check polling to refresh status in real-time
- Consider using Supabase pg_cron for periodic webhook verification
