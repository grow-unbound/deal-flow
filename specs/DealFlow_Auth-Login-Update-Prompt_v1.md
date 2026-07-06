# DealFlow Auth & Login Copy — Claude Code Implementation Prompt

> Paste this entire prompt into Claude Code. It is self-contained.

---

## Context

This is the DealFlow auth entry screen (shared front door before subdomain/tenant resolution — used by both seller signup/login and buyer number resolution). Read `.claude/CLAUDE.md` and `AGENTS.md` as authoritative references before touching any file. No production users exist yet, so ship the target state directly.

**Strict constraint: do not change any existing login flow, routing, or resolution logic.** This task is copy updates and additional confirmation/CTA steps inserted into the existing screens only. No new routes.

Locate the existing login screen component(s) and the number/email resolution logic (likely under `app/(auth)/`). Confirm actual paths before editing.

---

## Phase 1 — Phone OTP as default, email as OTP-fallback only

- Make Phone number + OTP as the default entry point — instead of email+OTP.
- Remove "Login with email" from the initial number-entry screen.
- On the OTP-input screen only (after a number has been submitted and OTP sent), show "Login with Email" as a fallback link — intended for cases where the user doesn't receive the OTP or the OTP fails. Do not show it anywhere else.
- Do not delete or restructure the email/password auth code path — just relocate where the link is shown.

## Phase 2 — Number-resolution messaging

Replace the current single generic failure banner with resolution-outcome-specific messaging, inserted into the existing resolution flow (no new routes).

### 2a. Registered buyer, buyer-app not enabled for this seller
```
Your account is not enabled by [Seller Name] for catalog access and ordering.
Ask them to enable your access.

[Request Access]   [Try a different number]
```
- "Request Access" opens WhatsApp (`https://wa.me/<seller_whatsapp_business_number>?text=<encoded message>`) using the seller's `whatsapp_business_number` from tenant settings.
- Prefilled message (draft, adjust to fit character/encoding limits):
  ```
  Hi [Seller Name], I'd like to get access to the Yukti buyer-app to view your catalog and place orders. Can you please confirm once you've enabled my access. - [Buyer Name]
  ```

### 2b. Number not found (no seller account, no buyer account)
```
We couldn't find your number.
Yukti works through a registered seller. 
If you sell to other businesses, create your seller account below. 
If you're trying to order from a business you work with, ask them to add you as a buyer.

[Create seller account]   [Inform your Seller]   [Try a different number]
```
- Rename "Create account" → "Create seller account" on this screen.
- No "distributor"/"distribution" wording anywhere in this copy.
- "Inform your Seller" opens a share sheet (WhatsApp share intent) with a predefined message the user can send to whoever they choose. Draft message — nudges the recipient (the seller) to check out Yukti and sign up:
  ```
  Hey, 
  
  I tried to place an order with you on Yukti but couldn't find your catalog.
  Yukti lets you manage your catalog and take orders from buyers like me directly.
  
  Worth checking out: [signup link]
  
  Set it up and add me as a buyer so I can order.

  - [Buyer Name].
  ```

### 2c. Multiple buyer profiles under one seller
```
Choose an account
This number is linked to multiple buyer profiles with [Seller Name].
Pick one to continue.
```

### 2d. Buyer accounts across multiple sellers
No change — keep as previously drafted:
```
Choose a business
This number is linked to buyer accounts with multiple sellers.
Select which one you'd like to open.
```
- The below list will be the list of seller accounts that the number is a registered buyer

### 2e. Seller opening buyer app with no buyer account on that number
Currently routes directly into buyer-app preview mode on tap of "Open Buyer App" — insert a confirmation dialog before that routing happens (do not change the routing logic itself, just gate it behind a confirm step):
```
Preview mode
You don't have a buyer account here yet. You can browse the catalog, but won't be able to place orders until a seller adds you as a buyer.

[Continue]   [Cancel]
```
- On mobile viewports, skip the persistent preview-mode banner inside the buyer app itself (the confirmation dialog above already covers the disclaimer) — desktop/larger viewports can keep a subtle persistent indicator if one already exists.

## Phase 3 — No regressions

- Seller-user login via OTP → lands on seller-app: unchanged.
- Registered buyer with buyer-app enabled → OTP screen: unchanged.
- These two never trigger the Phase 2 messaging above.

## Phase 4 — Copy source of truth

- Centralize the Phase 2 strings (and the two WhatsApp message drafts) in one copy/constants file so wording can change without touching component logic.

---

## Verification checklist

- [ ] "Login with Email" appears only on the OTP-input screen, not the initial number screen
- [ ] 2a "Request Access" opens WhatsApp to the seller's configured number with the prefilled message
- [ ] 2b "Inform your Buyer" opens a share sheet with the drafted message
- [ ] 2c uses "multiple buyer profiles" wording
- [ ] 2e shows a confirm dialog before entering preview mode; no persistent banner on mobile
- [ ] No new routes added; existing login/resolution logic untouched
- [ ] No "distributor"/"distribution" wording anywhere on this screen
- [ ] "Create account" renamed to "Create seller account"
