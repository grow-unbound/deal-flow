# Yukti Marketing Website — Final Brief v1 (Claude Design Handoff)

**Date:** 2026-07-04 · **Supersedes:** Yukti_Website-ICP_Brief_v1, Yukti_Website-Vision_Brief_v1
**Domain:** useyukti.in (app already hosted; self-serve signup live) · Brand: **Yukti everywhere** (no DealFlow anywhere)
**Site goal (instrumented):** conversions — **demo bookings/week + signups/week.** Everything on the site serves one of those two numbers.

---

## 0. Locked decisions this brief encodes

1. **Audience framing (middle ground):** businesses that sell to other businesses on relationships and repeat orders — distributors first, but the homepage never says "distributors only." Industry pages carry the specificity.
2. **Keystone narrative HIDDEN for now.** The voussoir mark is the logo, full stop. No keystone story, no arch metaphor, no "The keystone of your business" tagline anywhere on the site. The mark appears; it is never explained. (Revisit in 6 months.)
3. **Vocabulary (from customer interviews):** say **rate** (not price) in customer-facing claims · say **customers** (never "buyers") · **stock** stays stock · **campaign / customer group / pricelist** are validated terms — use freely. "Retailers" allowed only on distribution industry pages.
4. **Mobile-first, WhatsApp-webview-first.** Primary viewport: mid-range Android, WhatsApp in-app browser, 4G. Desktop is the adaptation, not the design target.
5. **CTAs:** Primary = **"Use Yukti now"** → self-serve signup (verb matches action — signup is live). Secondary = **"Book a demo."** **"Login"** persistent top-right. On mobile: sticky bottom CTA bar with both actions.
6. **Pricing model (final):** buyer-MAU bands + Lite. ₹ on request. Integrations included in **every** tier. WhatsApp credits included per tier, top-ups beyond.
7. **Legal/consent pages are first-class** (DPDP-aware) and consent is marketed as a feature, not hidden.
8. **Proof:** anonymized pilot numbers (CCTV/security distributor — Phani to supply figures) + "Our promise" section of operational commitments. No invented numbers, no fake logos.
9. Brand aesthetic proceeds as locked (R12). No re-exploration.

---

## 1. Design direction (binding)

**Tokens (Yukti_DesignSystem_R12):** Charcoal `#221E1A` + Copper `#B5642F` only · Paper `#F8F6F2` / Canvas `#FCFBF8` / hairlines `#EAE3D9` · light mode · Inter 400–800 everything (hero ~800, -0.02em) · Baloo 2 wordmark only · JetBrains Mono only for scannable numbers/stats, tabular numerals for all money · **≤1 copper CTA per viewport** ("Use Yukti now"); all secondary buttons charcoal · status/steps = shape + label, never colour alone · ₹ proportional and hugging · lakh/crore formatting.

**Mobile-first rules:**
- Hero must land (H1 + sub + both CTAs) within one thumb-scroll on a 360px-wide screen.
- Sticky bottom bar on mobile: [Use Yukti now] (copper) + [Book a demo] (charcoal ghost). Suppress while forms are on screen.
- Performance budget: usable over 4G in WhatsApp's in-app browser; compress screenshots aggressively; `display=swap` fonts; no autoplay video; no heavy animation libraries.
- Screenshots: phone-frame first (customer app), cockpit second. On mobile, cockpit shots crop to the meaningful region, never a shrunken full desktop.
- Test pass required in WhatsApp in-app browser (Android) before launch.

**Imagery:** real product UI and real operators. No ledgers, coins, calculators, paperwork, AI-glow gimmicks, enterprise-blue gloss. Masonry/structural motifs allowed as texture — never explained (see decision #2).

**Voice:** short sentences, active, concrete. Bold about the owner's growth; exact about money and data. Banned words as leads: AI, smart, automate, leverage, edge, intelligence. No exclamation marks. Never over-promise on money/accuracy — ceiling is "your books stay clean" / "structured data flows to the tools your accountant already uses." Never: "replace Tally/ERP," "books keep themselves," "error-free."

---

## 2. Sitemap

```
/                      Home (narrative: claim → story → features → proof → convert)
/how-it-works          The Tuesday story, expanded
/industries/electricals
/industries/mobiles-electronics
/industries/automotive-spares
/industries/hardware
/industries/cosmetics
/pricing               Buyer-MAU bands + Lite (₹ on request)
/integrations          Tally · Zoho Books · Zoho Inventory · Busy (coming soon)
/accountants           For accountants & CAs
/customers             For YOUR customers (the retailer/trust page)
/about                 The name, the belief, the founder
/demo                  Book a demo (enquiry form + WhatsApp deep link)
/signup → app          (existing self-serve; site links out)
/legal/privacy         Privacy policy (DPDP-aware)
/legal/terms           Terms of service
```

**Header (mobile-collapsed):** How it works · Industries ▾ · Pricing · Integrations — [Login] · [Use Yukti now] (copper).
**Footer:** full sitemap + For accountants, For your customers, legal links, WhatsApp contact number (mono), "Made in India. Built for businesses that sell to businesses."

---

## 3. HOME — full copy

### 3.1 Hero

**Eyebrow (mono, uppercase):** RUN IT. GROW IT. ONE PLACE.

**H1:** Run your whole business in one place — and grow it.

**Sub:** Yukti captures the work that drives your business — stock, rates, customers, orders — and turns it into growth. Publish campaigns, reach every customer on WhatsApp, and take orders in an app they'll actually use.

**CTAs:** [Use Yukti now] (copper) · [Book a demo] (charcoal ghost)
**Micro-line under CTAs (small):** Self-serve signup. First campaign live in days, not months.

**Visual:** phone frame front and center — the customer ordering app showing a campaign (MRP struck through, campaign rate highlighted). Cockpit screenshot secondary/behind on desktop, cropped KPI strip on mobile.

**Trust strip:** "Works with the tools you already use" + Tally, Zoho Books, Zoho Inventory marks.

### 3.2 Manifesto (short, text-led)

**H2:** Most software makes you serve the system.

> Feed it data. Configure it. Reconcile it. File through it.
> Somewhere along the way, the tool became the boss.
>
> Yukti inverts that. You decide; the platform carries the weight.
> We build against one enemy: the busywork that sits between you and your next good decision.

### 3.3 How it works — the Tuesday story (timestamped, 4 scenes)

**H2:** One Tuesday on Yukti.

1. **9:00 — Decide.** New stock lands. You build a campaign: the products, the campaign rate, the customer group, valid one week. One screen. You see the average discount before you commit.
2. **9:07 — Reach.** The campaign goes to 84 customers on WhatsApp — each one personally, tracked, opt-out respected. Not a group blast that dies in the noise.
3. **All day — Capture.** Customers order from their phones. No app install, no passwords — a link and an OTP. Orders land in one queue with clear statuses, not in seventeen chats.
4. **6:00 — Know.** The funnel reads: 84 sent → 81 delivered → 52 opened → 19 ordered. Tomorrow's call list writes itself. Orders flow to Tally or Zoho. Your books stay clean.

**Closer:** That's the whole loop — decide, reach, capture, know. Every day, in one system. [See the full story →] /how-it-works

*(Design: vertical timeline on mobile, timestamps in mono; each scene gets one cropped product frame. Steps numbered with shape+label, not colour.)*

### 3.4 Feature deep-scroll (alternating image + text; NOT tiles)

Six full-width sections, screenshot on one side, copy on the other, alternating. On mobile: image above text, generous spacing. Each section: H3, 2–3 sentences, 3 micro-bullets, quiet text-link CTA.

**A. Campaigns** — *Special rates, chosen products, the right customers, a time limit.*
Build it in one flow and preview exactly what your customers will see. A campaign at base rate is fine too — "New Arrivals" with no discount is still a reason to talk to your customers.
• Inline campaign rate with struck-through base rate • Bulk adjust: % off, flat ₹ off, fixed rate • Average discount shown before you publish
[See campaigns in action →]

**B. WhatsApp engagement** — *Reach every customer, personally. With a memory.*
Message everyone in a city, everyone who hasn't ordered in 30 days, or everyone with dues — computed from your own data. Sent one-to-one, tracked end-to-end.
• Targeting: customer group, area, dormant, dues, hand-picked • Pre-approved templates: new stock, campaign, payment reminder, visit alert, re-engagement • Every customer can opt out anytime — and you can see exactly who received, opened, ordered
[How WhatsApp targeting works →]

**C. The ordering app your customers will actually use** — *A link. An OTP. Their rates.*
Every customer sees their own rate list — your brands, their prices, nothing to install. Reordering takes two taps.
• Works on any phone, in the browser • Personal rates per customer, MRP struck through • Order status and history, self-serve
[See the customer app →]

**D. Orders without leakage** — *From enquiry to delivered, nothing slips.*
Enquiries become orders; orders move through clear statuses; invoices are one click. The 20–40% of WhatsApp enquiries that die in chats — captured.
• Enquiry → order → confirmed → dispatched → delivered • Invoice PDF in one click • Every change on record
[See order flow →]

**E. Customers & rates, on record** — *Every customer, every rate, no leakage.*
A-class, B-class, city-wise, brand-wise. Set the rate once per group; every quote, order, and invoice follows it. No more rates living in memory and spreadsheets.
• Customer groups: hand-picked or rule-based • Pricelists with validity windows • The same rate on every document, deterministically
[How rates work →]

**F. Your books stay clean** — *Keep Tally. Keep Zoho. Keep your accountant happy.*
Yukti runs your selling; your accounting stays where it is. Orders, invoices, items, and parties flow to Zoho Books and Zoho Inventory directly, and to Tally as clean CSV.
• Two-way Zoho sync, minutes to set up • Tally-ready exports: items, vouchers, ledgers • Included in every plan — even Lite
[See integrations →]

### 3.5 Industries strip

**H2:** Built for businesses that sell to businesses.

Five cards linking to industry pages: **Electricals · Mobiles & Electronics · Automotive Spares · Hardware · Cosmetics & Salon Supply.**
Line under: Distribution and wholesale are where we started. If you sell on relationships, rates, and repeat orders — Yukti is built for you.

### 3.6 Proof + promise (two-part section)

**H2:** What a pilot showed. What we promise.

**Left — pilot results (anonymized, real — from Apr–Jun 2026 pilot reports):**

Intro line: *A security-products distributor in Hyderabad put 119 customers on Yukti's ordering app across 4 outlets. No training. No app installs.*

Four stat blocks (values in JetBrains Mono, labels in Inter):
- **₹11L** — in customer-submitted estimates, week one
- **56%** — of customers ordering self-serve in the first week
- **40% → 72%** — estimate-to-invoice conversion, improving every week for six weeks
- **0** — additional staff hired to handle it

Closing line: *Six weeks in, self-serve orders were running at a pace of ₹17L+ a month — ahead of the distributor's own target.*

**Claim rules for this block:** ordering-app claims only — never attribute campaign or WhatsApp-broadcast results to this pilot. Numbers are from `WineYard_Week1_Report_1.md` and the 3-week May–June report; do not restate beyond what's there. Identity stays anonymized ("a security-products distributor in Hyderabad"). **[Phani: confirm WineYard is comfortable with these anonymized figures being public — one WhatsApp message, before launch.]**

**Right — our promise (commitments, not outcomes):**
1. First campaign live within 14 days — our team migrates your stock and customers from Tally, Zoho, or Excel.
2. We reply on WhatsApp within one working day.
3. Your data is yours. Export everything, anytime. No lock-in.
4. Your customers can opt out of messages anytime — and we enforce it.

### 3.7 For accountants (band)

**H2:** Your CA will like this.
Yukti doesn't touch your books — it feeds them. Clean items, clean parties, clean vouchers, synced or exported. Less data entry for your accountant, more time for real advice. [For accountants →]

### 3.8 FAQ (accordion, mobile-friendly)

1. **Do my customers need to install an app?** No. They open a WhatsApp link, verify with an OTP, and order in the browser. Any phone works.
2. **Does it work with Tally?** Yes — clean CSV exports for items, sales vouchers, and ledgers. Zoho Books and Zoho Inventory sync directly. Integrations are included in every plan.
3. **Can I just use the WhatsApp part?** Yes. The Lite plan is WhatsApp engagement only — import your customers, target by group, area, dues, or dormancy, and track every send. Upgrade when you want campaigns and ordering.
4. **Can it message my existing WhatsApp groups?** No — deliberately. Yukti messages each customer individually so you see delivery, opens, and orders per person. Groups can't tell you who ignored you. Customers can opt out anytime.
5. **What does it cost?** Plans are sized by how many of your customers actively use Yukti each month — you pay as adoption grows, not before. Talk to us for a number; most businesses compare it to a fraction of one salesperson's salary.
6. **How fast is setup?** Most businesses send their first broadcast on day one and publish their first campaign within two weeks.
7. **Is my data safe from other businesses on Yukti?** Yes. Every account is fully isolated. Your customers see only what you publish to them, and your rates are visible only to you.

### 3.9 Final CTA

**H2:** See your own stock on Yukti.
Bring your rate list. We'll build a live campaign with your products and send it to your phone — you'll see exactly what your customers would see.
[Use Yukti now] (copper) · [Book a demo] · WhatsApp number (mono)

---

## 4. /HOW-IT-WORKS

The Tuesday story (§3.3) expanded — same four scenes, each with a full product frame, plus a fifth scene:

**5. Month-end — Nothing to re-enter.** Orders and invoices already flowed to Tally/Zoho as they happened. Your accountant reviews; nobody re-types.

Close: **Decide. Reach. Capture. Know. Repeat.** [Use Yukti now]

---

## 5. /INDUSTRIES/* — one template, five instances

Template per page (repetition across pages is intended — a visitor reads only their page):

1. **Hero:** "Yukti for [Electricals] distribution." Sub names the reality: brand count, SKU spread, credit norms, rate variance by customer class. *(Retailer vocabulary allowed on these pages.)*
2. **Three pains, industry-specific** — written in that trade's language. E.g. Electricals: scheme-heavy brand pricing, rate confusion across A/B/C class electricians and retailers, stock spread across godowns. Mobiles: price protection and weekly rate drops, dead stock risk, serial-number-level value. Auto spares: massive SKU counts and fitment lookups, slow movers, counter-sale speed. Hardware: bulky stock, project quotes vs counter rates, credit-heavy sales. Cosmetics & salon supply: hundreds of SKUs across brands, shades, and sizes; rates and schemes that change week to week; small, frequent repeat orders and constant "what's the rate now?" enquiries from salons; new-launch pushes that need to reach every salon the day stock lands.
3. **Same product sections as home** (Campaigns, WhatsApp, ordering app) with industry-flavored example screenshots (seed data per vertical — worth the effort, demos and pages die on lorem ipsum).
4. **Industry FAQ (3–4)** + final CTA.

**Validation status:** Cosmetics — **validated** (Hyderabad cosmetics distributor selling to salons confirmed the pains and the loop). CCTV/security pains are validated by the pilot but there is deliberately **no /industries/security page** at launch — it would make the anonymized proof section (§3.6) trivially identifiable. Revisit once the pilot customer agrees to be named. **[Phani: validate electricals, mobiles & electronics, auto spares, hardware against real conversations before those four pages ship. Ship only pages that survive validation; a thin industry page is worse than none.]**

---

## 6. /PRICING

**Hero:** Pay for adoption, not ambition.
**Sub:** Every plan includes the full platform for what it does — no feature grids to decode. Plans grow with how many of your customers actively use Yukti each month.

**Four cards** (Growth elevated, "Most businesses start here"):

| | **Lite** | **Starter** | **Growth** | **Scale** |
|---|---|---|---|---|
| What it is | WhatsApp engagement only | The full platform | The full platform | The full platform |
| Active customers / month | — (unlimited contacts) | up to ~50 | up to ~500 | Unlimited |
| Transactions / month (estimates + orders) | — | ~200 | ~2,000 | Unlimited |
| Campaigns, ordering app, orders, rates | — | ✓ | ✓ | ✓ |
| WhatsApp targeting & tracking | ✓ | ✓ | ✓ | ✓ |
| WhatsApp credits included / month | Base bundle | Larger bundle | Larger bundle | Largest bundle |
| Tally / Zoho integrations | ✓ | ✓ | ✓ | ✓ |
| Onboarding | Self-serve | Assisted | Assisted migration | White-glove |

**[PLACEHOLDER — Phani: final band numbers (50/500, 200/2,000 are directional), included-credit quantities, and whether Lite shows a ₹ figure publicly. Recommendation: Lite can show ₹ (it's the self-serve acquisition rung); other tiers stay ₹-on-request.]**

**Lite card CTA:** [Use Yukti now] → signup. **Other cards:** [Talk to us] → /demo.

**Copy blocks below the table:**
- **Why active customers?** You pay when your customers actually use Yukti — the thing that grows your business. Not for seats, not for features, not before the value shows up.
- **WhatsApp credits.** Every plan includes a monthly credit bundle. Beyond that, transparent per-message credits — top up anytime, pay for what you send. (Meta charges per message; we pass it through with a clear markup, never hidden in your plan.)
- **Why no ₹ on this page?** Your number depends on catalog size and migration scope. One call, one number — and it will make sense next to a fraction of one salesperson's salary.

**Pricing page stability rule (for Phani, not the page):** this model doesn't change for two quarters after launch. Visible pricing churn costs more trust than any single wrong price.

---

## 7. /INTEGRATIONS

Hero: **Yukti fits your stack. Not the other way around.**
Sub: Included in every plan — because your data flowing in is what makes targeting and campaigns work.
Cards: Zoho Books (two-way, live) · Zoho Inventory (two-way, live) · Tally Prime (CSV export live; bridge sync coming) · Busy (coming soon). "Coming soon" = shape+label chip.
Blocks: what syncs (items, parties, orders, invoices, estimates) · setup wizard with connection test, minutes not days · your data stays yours, export anytime.

---

## 8. /ACCOUNTANTS

Hero: **Less punching. More reviewing.**
Sub: Yukti is where your client runs their selling. You get the output — clean, structured, ready for the books.
Sections: exactly what lands in Tally/Zoho and in what format · what Yukti does **not** do (not accounting software; no journal entries, no filings — your domain stays yours) · respect note ("the CA is how good businesses stay good; we build for that relationship").
CTA: "Have a client drowning in WhatsApp orders? [Introduce us]."
**Tone: precise register only — no growth bravado on this page.**

---

## 9. /CUSTOMERS — the trust page for THEIR customers

Purpose: the person who taps a shared link or gets a Yukti WhatsApp message and wonders what this is. Also linked from the app login page.

Hero: **Your supplier runs on Yukti.**
Copy: Yukti is the ordering system your supplier uses to serve you better. Your own rate list, new stock and offers on WhatsApp, and order status you can check yourself — no app to install, no password to remember.
Three reassurances (shape+label):
1. **Your number is safe.** We verify you with an OTP and never sell your data.
2. **You control the messages.** Opt out of promotional messages anytime — one tap.
3. **Your rates are private.** Only you and your supplier see your prices.
FAQ: what is this OTP · how do I stop messages · how do I see my orders.
No signup CTA on this page — it's trust, not conversion. Footer link: "Are you a supplier? See what Yukti does →" (home).

**Companion (app-side, note for Phani, outside website scope):** login page gets one artifact image + two lines — "Your rate list, your orders, your offers — from your supplier, on Yukti." Supabase/Cloudflare-style split login layout.

---

## 10. /ABOUT

- **The name:** Yukti (युक्ति) — practical intelligence; the right move under constraint. From *yuj*, to join: everything joined into one working whole. *(This is the only naming story on the site. No keystone narrative — see decision #2.)*
- **The belief:** a business grows when its owner makes better decisions and executes them faster — not when they spend more time feeding the system.
- **The ambition (public ceiling):** the operating layer modern businesses run, grow, and win on — starting with the businesses that sell to businesses.
- Founder note: built alongside real operators, not in a lab. India-first, built to travel. Contact.

---

## 11. /DEMO

H1: **Bring your rate list. Leave with a live campaign.**
Form: name · business name · city · what you sell (industry dropdown: electricals, mobiles & electronics, automotive spares, hardware, cosmetics & salon supply, security, other) · number of brands · phone (WhatsApp).
One copper submit. Under it: "We reply on WhatsApp within one working day." + direct WhatsApp deep-link button.
*(Industry dropdown doubles as lead routing + validates industry-page demand.)*

---

## 12. /LEGAL — privacy & terms (DPDP-aware)

Not boilerplate. Must cover, in plain language with a summary box up top:
- What we collect on this site (form data, analytics) and why.
- The product's consent model, stated proudly: business customers explicitly consent at first login; every marketing message carries opt-out; opt-outs are enforced platform-wide, with a hard cap of one marketing message per customer per day.
- Data ownership: the business owns its data; export anytime; deletion on request.
- Grievance/contact per DPDP requirements.
**[PLACEHOLDER — get one legal review pass before launch; structure now, lawyer later, but before launch.]**

---

## 13. Analytics & experiment plan (build with the site)

PostHog from day one. Events: `site_signup_click`, `site_demo_click`, `site_demo_submitted`, `site_whatsapp_click`, per-section scroll depth on home, industry-page → CTA conversion.
Weekly numbers that matter: **demo bookings/week, signups/week**, and which section's CTA converts. Everything else is vanity.
First A/B when traffic allows: hero H1 (outcome-led vs engagement-led variant).

---

## 14. Global-reuse architecture (for the builder)

- India-specific material (GST, Tally, ₹, lakh/crore, city names) is confined to: industry pages, integrations page, FAQ answers, and examples — never in the H1/manifesto/feature-section headlines. Internationalizing later = swapping pages and examples, not rewriting the spine.
- The spine that travels unchanged: run-it-in-one-place claim, manifesto, Tuesday story structure, campaign/engage/capture/know loop, customer-app value prop, adoption-based pricing story.
- WhatsApp-first messaging ports to SEA / MENA / Africa / LatAm as-is; a US/EU variant would swap the channel, not the loop. No US/EU copy work now.
- Layout RTL-ready per design system; text containers tolerate +30% expansion.

---

## 15. Placeholders Phani owes before launch (gating)

1. ~~Pilot numbers for §3.6~~ — **done** (Apr–Jun reports incorporated). Remaining: WineYard's OK on publishing the anonymized figures.
2. Final pricing band numbers + included-credit quantities + Lite ₹ decision (§6).
3. Industry-pain validation for electricals, mobiles & electronics, auto spares, hardware (§5) — cosmetics already validated; ship only validated pages.
4. Trademark application filed (classes 9/42/35) — before the site is public.
5. Legal review pass on /legal (§12).
6. Seed demo data per industry for screenshots (§5).
7. WhatsApp-webview test pass on a real Android device (§1).
