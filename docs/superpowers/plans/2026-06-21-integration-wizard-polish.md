# Integration Wizard Polish — 4 Observations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX and correctness issues in the Zoho integration setup wizard: step checkmarks, auto-run test connection, Indian FY default date, and 400 sync error.

**Architecture:** All UI changes are isolated to `IntegrationsSettingsClient.tsx`. The date fix is a pure function replacement. The sync 400 fix touches the route handler and server lib for better error visibility, then fixes the actual root cause.

**Tech Stack:** Next.js App Router, React, TanStack Query, Supabase JS, Zod

---

## File Map

| File | What changes |
|---|---|
| `src/components/seller/settings/IntegrationsSettingsClient.tsx` | Tasks 1, 2, 3 |
| `app/api/settings/integrations/sync/route.ts` | Task 4a (error serialization) |
| `src/lib/integrations/server.ts` | Task 4b (PostgrestError wrapping) |

---

## Task 1 — Completed step checkmarks

**File:** `src/components/seller/settings/IntegrationsSettingsClient.tsx`

The step indicator grid (lines ~808–821) currently shows completed steps with a cream background and no icon. `CheckCircle2` is already imported. Add it to completed step cards and change the step label to a muted tint so "done" is visually distinct from "active".

- [ ] **Step 1: Update the step indicator JSX**

Find the block:
```tsx
<div
  key={stepLabel}
  className={cn(
    'rounded-2xl border px-3 py-3',
    wizard.step === index ? 'border-teal-200 bg-teal-50' : index < wizard.step ? 'border-cream-200 bg-cream-50' : 'border-cream-200 bg-white',
  )}
>
  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Step {index + 1}</div>
  <div className="mt-1 text-sm font-medium text-cream-900">{stepLabel}</div>
</div>
```

Replace with:
```tsx
<div
  key={stepLabel}
  className={cn(
    'rounded-2xl border px-3 py-3',
    wizard.step === index
      ? 'border-teal-200 bg-teal-50'
      : index < wizard.step
        ? 'border-success-200 bg-success-50'
        : 'border-cream-200 bg-white',
  )}
>
  <div className="flex items-center gap-1.5">
    {index < wizard.step ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
    ) : null}
    <div className={cn(
      'text-xs font-semibold uppercase tracking-[0.12em]',
      index < wizard.step ? 'text-success-700' : 'text-cream-600',
    )}>
      Step {index + 1}
    </div>
  </div>
  <div className={cn(
    'mt-1 text-sm font-medium',
    index < wizard.step ? 'text-success-900' : 'text-cream-900',
  )}>
    {stepLabel}
  </div>
</div>
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/seller/settings/IntegrationsSettingsClient.tsx
git commit -m "feat(integrations): show checkmark on completed wizard steps"
```

---

## Task 2 — Auto-run test connection when entering step 2

**File:** `src/components/seller/settings/IntegrationsSettingsClient.tsx`

**Context:** After OAuth completes, the wizard currently jumps to step 3 (Start Import), skipping step 2 entirely. The fix is to land on step 2 after OAuth and auto-run the test so the user sees verification before starting the import.

Two places need changing:
1. The `pendingOAuthConnectedId` effect (line ~312) — change `step: 3` to `step: 2`
2. Add a `useEffect` that fires `runTestConnection()` automatically when the wizard is open on step 2 with no result yet

`runTestConnection` is already defined at line 423:
```ts
async function runTestConnection() {
  if (!wizardIntegration) return;
  const result = await testConnection({
    integration_type_id: wizardIntegration.id,
    credentials: wizard.credentials,
  });
  setWizard((current) => ({ ...current, testResult: result }));
}
```

- [ ] **Step 1: Land on step 2 after OAuth (not step 3)**

In the `pendingOAuthConnectedId` useEffect (around line 311–319), change:
```ts
setWizard({ ...buildWizardState(target), open: true, integrationId: target.id, step: 3 });
```
to:
```ts
setWizard({ ...buildWizardState(target), open: true, integrationId: target.id, step: 2 });
```

- [ ] **Step 2: Add auto-run test useEffect**

Add the following `useEffect` directly after the existing cleanup `useEffect` (around line 308, before the `pendingOAuthConnectedId` effect):

```tsx
// Auto-run test connection when wizard opens on step 2 with no result yet
useEffect(() => {
  if (!wizard.open || wizard.step !== 2 || wizard.testResult !== null || !wizardIntegration) return;
  void runTestConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [wizard.open, wizard.step, wizard.testResult, wizardIntegration?.id]);
```

`runTestConnection` is declared as a function inside the component, so it's not a stable reference — the dep array uses `wizardIntegration?.id` (the stable ID string) as a proxy to avoid an infinite loop.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/seller/settings/IntegrationsSettingsClient.tsx
git commit -m "feat(integrations): auto-run test connection on step 2 after OAuth"
```

---

## Task 3 — Indian financial year default import date

**File:** `src/components/seller/settings/IntegrationsSettingsClient.tsx`

**Current implementation** (lines 65–69):
```ts
function defaultImportStartDate() {
  const now = new Date();
  now.setDate(now.getDate() - 90);
  return now.toISOString().slice(0, 10);
}
```

**Required logic (from user):**
- Indian FY runs Apr 1 → Mar 31
- Q1 of Indian FY = April, May, June (months 3–5 in JS 0-indexed)
- If today is in Q1 (Apr–Jun): default to **Jan 1 of current calendar year**
- Otherwise: default to **Apr 1 of the current financial year**
  - If month is Jul–Dec → Apr 1 of *current* year
  - If month is Jan–Mar → Apr 1 of *previous* year (because FY started Apr 1 last year)

**Verification:**

| Today | Expected | Why |
|---|---|---|
| Jun 21 2026 | 2026-01-01 | Q1 (Jun), start from Jan 1 |
| Apr 1 2026 | 2026-01-01 | Q1 (Apr), start from Jan 1 |
| Jul 1 2026 | 2026-04-01 | Not Q1, FY started Apr 1 2026 |
| Dec 15 2026 | 2026-04-01 | Not Q1, FY started Apr 1 2026 |
| Jan 20 2026 | 2025-04-01 | Not Q1, FY started Apr 1 2025 |
| Mar 31 2026 | 2025-04-01 | Not Q1, FY started Apr 1 2025 |

- [ ] **Step 1: Replace `defaultImportStartDate`**

Replace the existing function (lines 65–69) with:
```ts
function defaultImportStartDate(): string {
  const now = new Date();
  const month = now.getMonth(); // 0=Jan … 3=Apr … 5=Jun … 11=Dec
  if (month >= 3 && month <= 5) {
    // Q1 of Indian FY (Apr–Jun): go back to Jan 1 of this calendar year
    return `${now.getFullYear()}-01-01`;
  }
  // Outside Q1: use Apr 1 of the current Indian FY
  // FY started Apr 1 of this year if month >= 3, otherwise Apr 1 of last year
  const fyStartYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStartYear}-04-01`;
}
```

- [ ] **Step 2: Update the `hint` on the DatePicker in step 3**

Find `hint="Default window is the last 90 days."` and replace with:
```tsx
hint="Defaults to the start of the current financial year."
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/seller/settings/IntegrationsSettingsClient.tsx
git commit -m "feat(integrations): default import date to Indian FY start"
```

---

## Task 4 — Fix 400 sync error

### 4a — Expose the real error

**File:** `app/api/settings/integrations/sync/route.ts`

The catch block on line 25–28 calls `error instanceof Error ? error.message : 'Failed to start sync'`. Supabase's `PostgrestError` is a plain object (not `instanceof Error`), so the real DB message is silently dropped.

- [ ] **Step 1: Fix error serialization in the route**

Replace the catch block:
```ts
} catch (error) {
  console.error('[POST /api/settings/integrations/sync]', error);
  return jsonError(400, error instanceof Error ? error.message : 'Failed to start sync', 'SYNC_FAILED');
}
```

with:
```ts
} catch (error) {
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : JSON.stringify(error);
  console.error('[POST /api/settings/integrations/sync]', error);
  return jsonError(400, msg, 'SYNC_FAILED');
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/settings/integrations/sync/route.ts
git commit -m "fix(integrations): expose real Supabase error message on sync 400"
```

---

### 4b — Fix PostgrestError throws in server lib

**File:** `src/lib/integrations/server.ts`

`throw secretError` (line 434) and `throw error` (line 462) throw raw `PostgrestError` objects that lose their message in the route handler. Wrap them as proper `Error` instances so the message propagates.

- [ ] **Step 1: Wrap PostgrestError in `getTenantIntegrationWithSecret`**

Find (around line 430–435):
```ts
const { data: secret, error: secretError } = await db.rpc('get_tenant_integration_runtime_secret', {
  p_tenant_integration_id: tenantIntegrationId,
  p_expected_integration_type_id: integration.integration_type_id,
});
if (secretError) throw secretError;
```

Replace with:
```ts
const { data: secret, error: secretError } = await db.rpc('get_tenant_integration_runtime_secret', {
  p_tenant_integration_id: tenantIntegrationId,
  p_expected_integration_type_id: integration.integration_type_id,
});
if (secretError) throw new Error(secretError.message ?? 'Failed to load integration secret');
```

- [ ] **Step 2: Wrap PostgrestError in `startIntegrationSync` INSERT**

Find (around line 461–462):
```ts
if (error || !job) throw error ?? new Error('Failed to enqueue sync job');
```

Replace with:
```ts
if (error) throw new Error(error.message ?? 'Failed to enqueue sync job');
if (!job) throw new Error('Sync job was not created');
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/server.ts
git commit -m "fix(integrations): wrap PostgrestError so sync failures surface real message"
```

---

### 4c — Reproduce and fix the actual root cause

After 4a and 4b land, trigger the sync again and check the server console for the real error message. Common root causes and fixes:

**If error is about Vault / `get_tenant_integration_runtime_secret`:**
- Vault extension may not be enabled on the local Supabase instance. Check: `SELECT * FROM pg_extension WHERE extname = 'supabase_vault';` in the Supabase SQL editor. If missing: run `CREATE EXTENSION IF NOT EXISTS supabase_vault;`
- OR: the OAuth callback failed to call `upsert_tenant_integration_secret`. Check `vault.secrets` to see if the secret exists for the `tenant_integration_id`.

**If error is about `integration_sync_jobs` INSERT:**
- The `tenant_consistency` trigger (`20260612101152_integrations_hardening_and_runtime.sql`) may be throwing due to a `tenant_id` mismatch between the `tenant_integrations` record and the `integration_sync_jobs` insert. Verify the `tenant_id` stored on the `tenant_integrations` row matches `claims.tenant_id`.
- Check with: `SELECT id, tenant_id FROM app.tenant_integrations WHERE id = '<the_tenant_integration_id>';`

**If error is about a missing column or constraint:**
- A migration might not have been applied to the remote Supabase project. Run `supabase migration list` (with `supabase` CLI) to compare local vs remote.

- [ ] **Step 1: Trigger sync and read the real error**

Start the dev server (`npm run dev`), open the integration wizard, click Start Import. Read the 400 response body — it now contains the real error message.

- [ ] **Step 2: Apply the fix from the list above**

Fix the actual root cause identified from the real error message.

- [ ] **Step 3: Confirm sync returns 202**

Trigger sync again. Should get `{"data":{"job_id":"<uuid>"},"error":null}` with status 202.

- [ ] **Step 4: Commit**

```bash
git add <changed files>
git commit -m "fix(integrations): resolve sync 400 — <actual root cause here>"
```

---

## Verification (end-to-end)

1. `npm run dev`
2. Open Settings → Integrations → Zoho
3. Click "Connect Zoho Books" (new tab opens)
4. Complete OAuth → new tab closes, original tab advances to step 2
5. Wizard auto-runs test, shows "Connection verified" card with sample counts
6. Step cards 0–1 show green `CheckCircle2` ✓
7. Click Continue → step 3 (Start Import), date defaults to Jan 1 of current year (since today is Jun 21 = Q1)
8. Click "Start Import" → no 400, job starts, detail panel shows live polling progress
