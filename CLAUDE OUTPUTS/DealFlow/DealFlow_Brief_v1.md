# DealFlow — GTM Docket v1

**Date:** 2026-06-03 · **For:** Phani · **Use:** Take-to-market brief + one-day production cutline
**Source basis:** Strategic Memo v1, TAM/Monetization Research v1, Competitive Teardown v1, Product Spec v1

---

## 1. Positioning — one line

> **DealFlow is the distributor's own command center.** Manage every brand in one place, publish cohort-specific catalogs to your retailers, and capture orders in a buyer app they'll actually use — looking 10x more organized within 30 days.

**Why this wins:** every Indian DMS (Bizom, BeatRoute, FieldAssist, Botree) is sold to *brands* and pushed down to distributors as a captive node. **No incumbent treats the distributor as the buyer.** That gap is the wedge. Don't lead with AI — that's commodity (Zotok, Comena, WizCommerce) and a funded fight you lose. Lead with the multi-brand cockpit + cohort catalog publishing.

---

## 2. ICP definition

**Primary ICP (first 50 outbound):**

| Dimension | Target |
|---|---|
| Business | Multibrand SMB distributor — the distributor *is* the buyer |
| Verticals | Electricals, electronics, mobiles, beauty/personal care, CCTV/security (WineYard anchor) |
| Geography | **Tier 2/3 cities** — Indore, Coimbatore, Lucknow, Surat. More pain, more growth, less SaaS fatigue |
| Scale | ₹5–25 Cr GMV, 3–10 brand principals, 10–30 field agents |
| Tech today | On Tally/Busy/Zoho; juggling 5–15 brand portals; WhatsApp-run; spreadsheet pricing |
| Why permanent | Structurally permanent distributor layer — regulation, credit, local stocking, technical/relationship sales |

**Anchor customer:** WineYard (CCTV distributor, on Zoho). Reposition from premium custom-build to **Scale-tier SaaS reference logo + quantified ROI quote** — then move on. Don't run it as a cash cow.

**Avoid (wrong-fit, will waste the cycle):**
- Metro FMCG distributors — quick-commerce (Blinkit/Zepto) is eating 18% of top-8-city FMCG; wallet shrinking.
- Pharma / industrial / capital equipment — different compliance and sales motion.
- DTC-disintermediating categories (fashion, eyewear, digitally-native beauty) — the distributor is being designed out.

---

## 3. Problem being solved

The multibrand distributor lives in chaos and loses money to it:

- **5–15 brand portals**, each with its own catalog, pricing, login — no single view.
- **20–40% of incoming WhatsApp enquiries lost** — no layer between WhatsApp and an order.
- **Agents don't know what's in stock; retailers don't see new arrivals** — orders leak.
- **Inconsistent cohort pricing** — manual overrides, errors, leakage.
- **Manual reconciliation** into Tally/Zoho — slow, error-prone.

**The buying trigger is money, not innovation.** A distributor benchmarks ₹50K/mo against *one agent's salary*, not against software. Sell on **₹ saved in lost orders + faster collections**, never on "AI." Build the ROI number into the first demo.

---

## 4. Selling features (the conversion drivers)

Ordered by demo impact. Lead with #1 — it's the wow moment.

1. **Cohort / geo catalog publishing** — "Publish Brand-X's new arrivals *only* to my North-Delhi A-class retailers, valid 7 days" in under a minute, with a buyer-side preview. This is the sales accelerator, not a CRUD feature. **This closes deals.**
2. **Multi-brand cockpit** — one command center across all principals. The unclaimed positioning no competitor owns in the Indian SMB segment.
3. **Buyer PWA, WhatsApp OTP, no passwords** — retailers actually use it. Curated-lookbook aesthetic (hero image, MRP struck through, cohort price highlighted) = the "10x more organized" proof.
4. **Custom pricing per cohort** (`resolve_price`) — deterministic buyer/cohort/all-buyers pricing, visible as struck-through MRP vs cohort price.
5. **Zoho (and Tally CSV) sync** — removes the #1 switching objection. The WineYard conversion wedge. Note: this is *table stakes / a tax*, not a moat — it must "just work," nobody pays extra for it.
6. **Enquiry → order capture** — small, sticky, high-leverage; stops the 20–40% WhatsApp leakage. Genuinely underserved.

**Do NOT sell on:** AI multimodal intake, voice ordering, replenishment forecasting, payment reconciliation. All commodity-in-12-months or Phase-2. Marketing them now invites a feature war with funded incumbents.

---

## 5. Tiers & pricing

| Tier | Profile | Monthly | Onboarding (one-time) |
|---|---|---|---|
| **Starter** | <10 agents, 1–3 brands, <₹5 Cr GMV | **₹9,999** | ₹25,000 |
| **Growth** | 10–30 agents, 3–10 brands, ₹5–25 Cr GMV | **₹24,999** | ₹50,000 |
| **Scale** | 30–100 agents, 10+ brands, ₹25–100 Cr GMV | **₹49,999–75,000** | ₹1,00,000–1,50,000 |
| **Enterprise** | 100+ agents, custom | Custom (₹1L+) | ₹2–5L |

**Add-ons:** per-order overage ₹2–5; extra ERP connector ₹3,000/mo; WhatsApp pass-through at +20% margin (never bundle unlimited messages — Meta per-conversation pricing compresses margin fast).

**The growth engine is NOT a higher SaaS price.** As the customer grows, attach revenue to their *transaction volume*, not a renegotiation they resent:
- **Embedded payments** (0.5–2% of GMV) — after ~20–30 paying tenants + earned trust. *Lowers* churn (money flows through you).
- **B2B BNPL / buyer credit** — only with an NBFC/co-lending partner once you have transaction data to underwrite.

This is the NRR >110% fix and the only path from slow SaaS compounder to venture-scale. Sequence is strict: **software → trust → payments → credit.** Not year one.

---

## 6. Red flags / recipes for disaster (GTM)

- **Selling on AI rhetoric.** They buy on ₹ saved. Build the ROI calculator before the next demo.
- **Onboarding is the retention engine.** SMB churn is front-loaded; **first value in <14 days** is the single biggest retention lever. A clean migration + a published catalog in week one beats any feature.
- **Tally/Busy integration is a silent killer** — budget real engineering; customers expect it to just work and won't pay extra.
- **WineYard as cash cow** — repositioning trap. Take the logo, the quote, the ROI metric, then move to product.
- **Anchoring case studies on metros** — anchor on Tier 2/3 instead.
- **Solo scope creep** — keep everything beyond the golden path behind flags, off.

---

## 7. One-day cutline — what must be production-ready to sell tomorrow

Build is near-complete (Wk 9–12). "Production-ready in a day" = **one golden path that is bulletproof, tenant-safe, and seeded** — not 12 hardened modules.

### The golden path (must work flawlessly, end to end)

1. **Publish a cohort catalog** — seller picks products → cohort → validity → previews as buyer → publishes → gets `share_token` link. *(The wow. Centerpiece of the demo.)*
2. **Buyer opens share link → WhatsApp OTP → browse → cart → place order.** OTP reliability is the #1 live-demo failure risk (Meta/AiSensy) — rehearse it and have a fallback test number.
3. **Order lands in cockpit → status change → invoice PDF + Tally CSV export.** Closes the loop, proves it's a real system.
4. **Pricing is visible** — MRP struck through, cohort price highlighted, `resolve_price` correct.

### The one-day checklist

- [ ] **Seed one demo tenant in the prospect's vertical** with real product images, 3 brands, 2–3 cohorts, a few buyers. *Demos die on empty states and lorem ipsum — this is the highest-ROI hour of the day.*
- [ ] **Run the 5 cross-tenant isolation tests** (flags on + off). Never demo with leakage risk.
- [ ] **Test the PWA on a real phone** — iOS safe-area, OTP, cart, order. Not just localhost.
- [ ] **Confirm invoice PDF + Tally CSV actually open/import.**
- [ ] **No blank transition states** — skeletons/empty states per the nav-performance standard.
- [ ] **Script a 10-minute demo** ending on the published catalog + a placed order.
- [ ] **WineYard only:** harden the Zoho item/customer/order push on their tenant — that's their conversion wedge.

### Explicitly leave OFF tomorrow (flags off)

AI intake · voice · replenishment · payment reconciliation · multi-portal aggregation · search polish · live Tally API. None unlock the first sale.

### The redline

You cannot make all modules production-ready in a day, and you shouldn't try. **Production-ready = the golden path is bulletproof, isolation-safe, and seeded.** Ship that, demo that, sell that. Everything else stays dark behind flags until a paying customer pulls it forward.

---

## 8. First-90-days GTM motion

1. Convert **WineYard** via Zoho sync → reference logo + quantified ROI quote.
2. Outbound to **50 ICP distributors**; lead every demo with cohort catalog publishing.
3. Convert **5 paid customers at ₹10–25K/mo** = your PMF signal.
4. **Refuse consulting/customization money** in MVP phase — it pulls you off product.
5. One real prospect demo every week; don't build what you haven't validated in a demo.
