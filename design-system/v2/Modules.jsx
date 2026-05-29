// v2/Modules.jsx
// Six landing-page renderings, all sharing the same chrome.
// Each module returns a React node: a PageHeaderV2, an InsightStrip4,
// an AttentionRail, a FilterBar, and a body (list table OR tile grid).
//
// Defaults per module:
//   Brands     — List   (5 brands, but the rich row is the right read)
//   Products   — List   (357 items — must scan dense)
//   Customers  — List   (142 buyers — same)
//   Cohorts    — Grid   (4 — tiles do the work)
//   Catalogs   — Grid   (covers have visual identity)
//   Orders     — List   (transactional — table is correct)

/* ============================================================
   Helpers
   ============================================================ */
function fmtGrowth(g) {
  if (g > 0)  return <span className="growth-up">↑ +{g.toFixed(1)}%</span>;
  if (g < 0)  return <span className="growth-down">↓ {g.toFixed(1)}%</span>;
  return <span className="growth-flat">· flat</span>;
}

/* ============================================================
   BRANDS
   ============================================================ */
function BrandsLandingV2() {
  const sorted = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv);
  return (
    <PageWrap label="Brands · landing">
      <PageHeaderV2
        eyebrow="Portfolio"
        title="Brands"
        subtitle="Five brand principals. Phani Distribution carries them across 142 buyers in 6 cohorts. This is your portfolio at a glance."
        horizon="This month"
        secondary={{ label: 'Invite a principal', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> }}
        primary="Add a brand"
      />
      <InsightStrip4 tiles={[
        { label: 'Portfolio GMV', value: inrShort(PORTFOLIO.gmv), delta: '+8.3%', deltaTone: 'up', sub: 'vs last month', tone: 'accent' },
        { label: 'Brands carried', value: PORTFOLIO.brandsCarried, sub: `${PORTFOLIO.activeBuyersAcross} of ${PORTFOLIO.totalBuyers} buyers active` },
        { label: 'Need attention', value: PORTFOLIO.brandsAtRisk, sub: '3 alerts open', tone: 'warn' },
        { label: 'Catalog freshness', value: `${PORTFOLIO.catalogFresh} / ${PORTFOLIO.brandsCarried}`, sub: 'published in last 14 days' },
      ]}/>
      <AttentionRail items={[
        { kind: 'risk', subject: 'Tara Spirits', title: 'GMV down 8% · stale catalog 28d', hint: 'Active buyers fell from 18 to 14. No new catalog since 2 May.', action: 'Call principal' },
        { kind: 'opportunity', subject: 'Aravalli Vineyards', title: 'New peak, growth +18%', hint: 'Asked to expand Q3 allocation last call. Worth a follow-up.', action: 'Send proposal' },
        { kind: 'info', subject: 'WineYard Vintners', title: '35.5% of portfolio · concentration risk', hint: 'One brand · ₹16.8 L this month. Loss of WY would halve your run rate.', action: 'See dependency' },
      ]}/>
      <FilterBar
        count="5 brands"
        searchPlaceholder="Search brand or category…"
        chips={['All categories', 'Wines', 'Beer', 'Spirits', 'At risk']}
        activeChip="All categories"
        view="list"
        sortBy="GMV (high → low)"
      />
      <div className="v2-body">
        <table className="v2-table">
          <thead><tr>
            <th style={{ width: 320 }}>Brand</th>
            <th className="num">GMV · MTD</th>
            <th>Growth</th>
            <th>Share of portfolio</th>
            <th className="num">Active buyers</th>
            <th>Catalog</th>
            <th></th>
          </tr></thead>
          <tbody>
            {sorted.map(b => (
              <tr key={b.id}>
                <td>
                  <div className="ent">
                    <BrandAvatarSm initials={b.initials} hue={b.hue} size={38} />
                    <div className="ent-meta">
                      <div className="ent-name">{b.name}</div>
                      <div className="ent-sub">{b.category.toUpperCase()} · {b.region} · {b.skus} SKUs</div>
                    </div>
                  </div>
                </td>
                <td className="num"><span className="num-display">{inrShort(b.gmv)}</span></td>
                <td>{fmtGrowth(b.growth)}</td>
                <td>
                  <div className="v2-share">
                    <div className={'v2-share-bar' + (b.hue === 'ember' ? ' is-ember' : b.hue === 'cream' ? ' is-cream' : '')}>
                      <i style={{ width: (b.share * 2.4) + '%' }}></i>
                    </div>
                    <span className="v2-share-num">{b.share.toFixed(1)}% of ₹47.3 L</span>
                  </div>
                </td>
                <td className="num">{b.activeBuyers}<span style={{ color: 'var(--cream-600)' }}> / {b.totalBuyers}</span></td>
                <td>
                  {b.daysSinceCatalog <= 14
                    ? <span className="v2-status is-success">{b.daysSinceCatalog}d ago</span>
                    : <span className="v2-status is-warning">{b.daysSinceCatalog}d ago</span>}
                </td>
                <td className="chev">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

/* ============================================================
   PRODUCTS
   ============================================================ */
function ProductsLandingV2() {
  return (
    <PageWrap label="Products · landing">
      <PageHeaderV2
        eyebrow="Catalog"
        title="Products"
        subtitle="357 SKUs across 5 brands. 8 out of stock, 24 running low — those are the ones to chase this week."
        horizon="This month"
        secondary={{ label: 'Bulk import', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg> }}
        primary="Add a product"
      />
      <InsightStrip4 tiles={[
        { label: 'Active SKUs', value: PRODUCTS_AGG.active, sub: `${PRODUCTS_AGG.total} total · 23 archived` },
        { label: 'Out of stock', value: PRODUCTS_AGG.outOfStock, sub: 'replenish urgently', tone: 'warn' },
        { label: 'Low stock', value: PRODUCTS_AGG.lowStock, sub: '< 14 days of cover' },
        { label: 'Revenue', value: inrShort(PRODUCTS_AGG.gmv), delta: '+8.3%', deltaTone: 'up', sub: 'vs last month' },
      ]}/>
      <AttentionRail items={[
        { kind: 'risk', subject: 'Estate Chardonnay 2022', title: 'Out of stock · 9 days', hint: 'Sold 92 last month. Two buyers waiting on the next pour.', action: 'Reorder from WY' },
        { kind: 'risk', subject: 'Cabernet Franc Reserve', title: '4 days of cover left', hint: 'Faster sell-through than expected — bumped 22%. Reserve more this cycle.', action: 'Bump allocation' },
        { kind: 'info', subject: 'Aravalli Mead', title: 'Fastest mover · +34% units', hint: 'Doubled buyers in 60 days. Consider featuring in next catalog.', action: 'Feature in catalog' },
      ]}/>
      <FilterBar
        count={`Showing 8 of ${PRODUCTS_AGG.total}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={['All brands', 'Red wine', 'White wine', 'Beer', 'Spirits', 'Low stock']}
        activeChip="All brands"
        view="list"
        sortBy="GMV (high → low)"
      />
      <div className="v2-body">
        <table className="v2-table">
          <thead><tr>
            <th style={{ width: 340 }}>Product</th>
            <th>Brand</th>
            <th className="num">On hand</th>
            <th className="num">Days cover</th>
            <th className="num">Units · MTD</th>
            <th className="num">Revenue</th>
            <th>Growth</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {PRODUCTS_DATA.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="ent">
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 4px', flexShrink: 0 }}>
                      <div style={{ width: 10, height: 26, borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%', background: 'linear-gradient(180deg, #1F3A34, #142823)' }}></div>
                    </div>
                    <div className="ent-meta">
                      <div className="ent-name">{p.name}</div>
                      <div className="ent-sub">{p.sku} · {p.category}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <BrandAvatarSm initials={p.brandInitials} hue={p.brandHue} size={22} />
                    <span style={{ fontSize: 12.5 }}>{p.brand}</span>
                  </div>
                </td>
                <td className="num">{p.onHand}</td>
                <td className="num">
                  {p.daysCover === 0
                    ? <span className="growth-down">0d</span>
                    : p.daysCover < 7
                      ? <span style={{ color: 'var(--warning-700)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{p.daysCover}d</span>
                      : <span>{p.daysCover}d</span>}
                </td>
                <td className="num">{p.units}</td>
                <td className="num"><span className="num-display">{inrShort(p.gmv)}</span></td>
                <td>{fmtGrowth(p.growth)}</td>
                <td><StatusTagV2 label={p.status.label} tone={p.status.tone} /></td>
                <td className="chev">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

/* ============================================================
   CUSTOMERS
   ============================================================ */
function CustomersLandingV2() {
  return (
    <PageWrap label="Customers · landing">
      <PageHeaderV2
        eyebrow="Buyers"
        title="Customers"
        subtitle="142 retailers across 6 cohorts. 89 active this month. The Tier-A names buy 70% of revenue — that's where dues sit too."
        horizon="This month"
        secondary={{ label: 'Invite buyer', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> }}
        primary="Add a customer"
      />
      <InsightStrip4 tiles={[
        { label: 'Active buyers', value: `${CUSTOMERS_AGG.active}/${CUSTOMERS_AGG.total}`, sub: '62.7% of base ordered' },
        { label: 'Spend · MTD', value: inrShort(CUSTOMERS_AGG.spend), delta: '+8.3%', deltaTone: 'up', sub: 'vs last month' },
        { label: 'Dormant > 30d', value: CUSTOMERS_AGG.dormant, sub: 'haven\'t ordered in a month', tone: 'warn' },
        { label: 'Outstanding dues', value: inrShort(CUSTOMERS_AGG.duesTotal), sub: 'across 7 buyers' },
      ]}/>
      <AttentionRail items={[
        { kind: 'risk', subject: 'Capitol Spirits', title: 'Dormant 32 days · ₹92K dues', hint: 'Last order 5 weeks ago. Maxed credit line and stopped responding to catalogs.', action: 'Call buyer' },
        { kind: 'opportunity', subject: 'Rajan Wine Merchants', title: 'Spend up 32% — tier upgrade ready', hint: '₹2.68 L this month, near A-class threshold (₹3 L over 3 months).', action: 'Promote to Tier A' },
        { kind: 'info', subject: 'Singh Hospitality', title: 'Largest exposure · ₹3.84 L credit used', hint: '64% utilised. Always-on time historically. Just a number to keep an eye on.', action: 'View ledger' },
      ]}/>
      <FilterBar
        count={`Showing 7 of ${CUSTOMERS_AGG.total}`}
        searchPlaceholder="Search buyer, city, GSTIN…"
        chips={['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues']}
        activeChip="All tiers"
        view="list"
        sortBy="Spend (high → low)"
      />
      <div className="v2-body">
        <table className="v2-table">
          <thead><tr>
            <th style={{ width: 320 }}>Buyer</th>
            <th>Cohort</th>
            <th className="num">Spend · MTD</th>
            <th>Growth</th>
            <th className="num">Orders</th>
            <th>Last order</th>
            <th>Credit</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {CUSTOMERS_DATA.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="ent">
                    <BrandAvatarSm initials={c.initials} hue={c.hue} size={38} />
                    <div className="ent-meta">
                      <div className="ent-name">
                        {c.name}
                        <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember-700)', background: 'var(--ember-50)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{c.tier}</span>
                      </div>
                      <div className="ent-sub">{c.city.toUpperCase()}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--cream-800)' }}>{c.cohort}</td>
                <td className="num"><span className="num-display">{inrShort(c.spend)}</span></td>
                <td>{fmtGrowth(c.growth)}</td>
                <td className="num">{c.orders}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.lastOrder}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div className="v2-share-bar"><i style={{ width: Math.round(c.credit.used / c.credit.limit * 100) + '%', background: c.credit.used / c.credit.limit > 0.75 ? 'var(--warning-500)' : 'var(--teal-500)' }}></i></div>
                    <span className="v2-share-num">{inrShort(c.credit.used)} / {inrShort(c.credit.limit)}</span>
                  </div>
                </td>
                <td><StatusTagV2 label={c.status.label} tone={c.status.tone} /></td>
                <td className="chev">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

/* ============================================================
   COHORTS  (Grid default — small set)
   ============================================================ */
function CohortsLandingV2() {
  return (
    <PageWrap label="Cohorts · landing">
      <PageHeaderV2
        eyebrow="Segmentation"
        title="Cohorts"
        subtitle="Four buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list."
        horizon="This month"
        secondary={{ label: 'Publish catalog', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16"/></svg> }}
        primary="New cohort"
      />
      <InsightStrip4 tiles={[
        { label: 'Cohorts', value: COHORTS_AGG.total, sub: `covering ${COHORTS_AGG.members} of ${COHORTS_AGG.totalBuyers} buyers` },
        { label: 'Combined GMV', value: inrShort(COHORTS_AGG.gmv), delta: '+11.2%', deltaTone: 'up', sub: 'vs last month', tone: 'accent' },
        { label: 'Avg conversion', value: `${COHORTS_AGG.conversion}%`, sub: 'catalog → order' },
        { label: 'Uncategorised', value: '62 buyers', sub: 'not in any cohort', tone: 'warn' },
      ]}/>
      <AttentionRail items={[
        { kind: 'opportunity', subject: 'South India Specialty', title: 'Best mover · +18% MTD', hint: '14 of 18 members ordered, vs 9 last month. Worth a deeper push catalog.', action: 'Build catalog' },
        { kind: 'risk', subject: 'Hospitality', title: 'Conversion 28% — below threshold', hint: 'Catalog last refreshed 6 weeks ago. Hotels expect monthly cadence.', action: 'Refresh catalog' },
        { kind: 'info', subject: '62 buyers uncategorised', title: 'Sitting outside every cohort', hint: 'They get base price list only. Auto-suggest based on order history?', action: 'Review buyers' },
      ]}/>
      <FilterBar
        count="4 cohorts"
        searchPlaceholder="Search cohort or rule…"
        chips={['All', 'Geo-based', 'Tier-based', 'Brand affinity']}
        activeChip="All"
        view="grid"
        sortBy="GMV (high → low)"
      />
      <div className="v2-body">
        <div className="v2-grid-body">
          {COHORTS_DATA.map(c => (
            <article key={c.id} className="v2-coh-tile">
              <div className="v2-coh-head">
                <div style={{ minWidth: 0 }}>
                  <h3 className="v2-coh-name">{c.name}</h3>
                </div>
                <StatusTagV2 label={c.status.label} tone={c.status.tone} />
              </div>
              <p className="v2-coh-desc">{c.description}</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cream-700)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>FOCUS:</span>
                {c.primaryBrands.map((b, i) => <span key={i} className="v2-coh-chip">{b}</span>)}
              </div>
              <div className="v2-coh-stats">
                <div className="v2-coh-stat">
                  <div className="label">GMV · MTD</div>
                  <div className="value">{inrShort(c.gmv)}</div>
                </div>
                <div className="v2-coh-stat">
                  <div className="label">Growth</div>
                  <div className="value" style={{ color: c.growth >= 10 ? 'var(--success-500)' : 'var(--cream-900)' }}>+{c.growth}%</div>
                </div>
                <div className="v2-coh-stat">
                  <div className="label">Members</div>
                  <div className="value">{c.active}<span style={{ fontSize: 13, color: 'var(--cream-600)' }}> / {c.members}</span></div>
                </div>
                <div className="v2-coh-stat">
                  <div className="label">Conversion</div>
                  <div className="value">{c.conversion}%</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </PageWrap>
  );
}

/* ============================================================
   CATALOGS  (Grid default — covers carry visual identity)
   ============================================================ */
function CatalogsLandingV2() {
  return (
    <PageWrap label="Catalogs · landing">
      <PageHeaderV2
        eyebrow="Distribution"
        title="Catalogs"
        subtitle="The mailers your retailers see in the buyer app. Each one targets a cohort, runs for a validity window, and rolls up to one funnel."
        horizon="This month"
        secondary={{ label: 'New from template', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/></svg> }}
        primary="Publish a catalog"
      />
      <InsightStrip4 tiles={[
        { label: 'Live catalogs', value: CATALOGS_AGG.live, sub: `${CATALOGS_AGG.draft} in draft, ${CATALOGS_AGG.ended} ended` },
        { label: 'GMV from catalogs', value: inrShort(CATALOGS_AGG.gmv), delta: '+14.2%', deltaTone: 'up', sub: 'vs last month', tone: 'accent' },
        { label: 'Avg conversion', value: `${CATALOGS_AGG.conversion}%`, sub: 'opens → orders' },
        { label: 'Orders attributed', value: CATALOGS_AGG.orders, sub: 'this month' },
      ]}/>
      <AttentionRail items={[
        { kind: 'risk', subject: 'Summer Pours', title: '4 days left · 3 buyers haven\'t opened', hint: 'Live to 12 N-Delhi A-class buyers. Re-send to non-openers in last 48h?', action: 'Nudge non-openers' },
        { kind: 'opportunity', subject: 'Monsoon Specials', title: 'Draft ready for 22 hospitality buyers', hint: '18 products selected, valid Jul 15 → Aug 14. Awaiting publish.', action: 'Review & publish' },
        { kind: 'info', subject: 'Premium Reserve', title: 'Top performer · 50% conversion', hint: '11 orders from 18 buyers. Worth templating the layout for next cycle.', action: 'Save as template' },
      ]}/>
      <FilterBar
        count="4 catalogs"
        searchPlaceholder="Search catalog or cohort…"
        chips={['All', 'Live', 'Draft', 'Ended']}
        activeChip="All"
        view="grid"
        sortBy="Recently published"
      />
      <div className="v2-body">
        <div className="v2-grid-body">
          {CATALOGS_DATA.map(c => {
            const badgeCls = c.status.tone === 'warning' ? 'is-draft' : c.status.tone === 'neutral' ? 'is-ended' : '';
            return (
              <article key={c.id} className="v2-cat-tile">
                <div className={'v2-cat-hero h-' + c.hue}>
                  <div>
                    <h3>{c.name}</h3>
                    <div className="v2-cat-hero-meta">{c.products} products · {c.brands} brands</div>
                  </div>
                  <span className={'v2-cat-hero-badge ' + badgeCls}>{c.status.label.toUpperCase()}</span>
                </div>
                <div className="v2-cat-body">
                  <div className="v2-cat-row"><span>Cohort</span><span className="v">{c.cohort}</span></div>
                  <div className="v2-cat-row"><span>GMV</span><span className="v">{c.gmv > 0 ? inrShort(c.gmv) : '—'}</span></div>
                  <div className="v2-cat-row"><span>Orders</span><span className="v">{c.orders > 0 ? `${c.orders} (${c.conversion}%)` : '—'}</span></div>
                  <div className="v2-cat-row" style={{ borderTop: '1px dashed var(--cream-300)', paddingTop: 8 }}>
                    <span>{c.status.label === 'Draft' ? 'Validity' : c.status.label === 'Ended' ? 'Ended' : 'Days left'}</span>
                    <span className="v">{c.status.label === 'Live' ? `${c.daysLeft}d · until ${c.validUntil}` : c.validUntil}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </PageWrap>
  );
}

/* ============================================================
   ORDERS  (List default — transactional)
   ============================================================ */
function OrdersLandingV2() {
  return (
    <PageWrap label="Orders · landing">
      <PageHeaderV2
        eyebrow="Transactions"
        title="Orders"
        subtitle="28 orders this month from 22 buyers. 4 pending dispatch, 1 on hold, 18 already delivered. The list is your workboard."
        horizon="This month"
        secondary={{ label: 'Sync to Tally', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 21v-5h5"/></svg> }}
        primary="Record an order"
      />
      <InsightStrip4 tiles={[
        { label: 'Orders · MTD', value: ORDERS_AGG.total, delta: '+14%', deltaTone: 'up', sub: 'vs last month' },
        { label: 'GMV', value: inrShort(ORDERS_AGG.gmv), sub: `AOV ${inrShort(ORDERS_AGG.aov)}`, tone: 'accent' },
        { label: 'Pending dispatch', value: ORDERS_AGG.pendingDispatch, sub: 'awaiting confirmation', tone: 'warn' },
        { label: 'On hold', value: ORDERS_AGG.holds, sub: 'credit limit issue' },
      ]}/>
      <AttentionRail items={[
        { kind: 'risk', subject: 'DF-2026-00476', title: 'Kapoor Spirits · on hold 4 days', hint: 'Credit limit exceeded. Order value ₹38.2K — clear ₹14K dues to release.', action: 'Resolve hold' },
        { kind: 'opportunity', subject: 'Friday dispatch batch', title: '4 orders for Mon delivery', hint: 'Bengaluru, Mumbai, Gurugram, New Delhi. Confirm all 4 to send pick-list.', action: 'Confirm batch' },
        { kind: 'info', subject: 'AOV trending up', title: '₹44.6K · 12% above last month', hint: 'Largely Tier-A reorders. Singh Hospitality alone is ₹3.84 L over 4 orders.', action: 'See top buyers' },
      ]}/>
      <FilterBar
        count={`Showing 8 of ${ORDERS_AGG.total}`}
        searchPlaceholder="Search order ID, buyer, city…"
        chips={['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled']}
        activeChip="All"
        view="list"
        sortBy="Recent first"
      />
      <div className="v2-body">
        <table className="v2-table">
          <thead><tr>
            <th>Order</th>
            <th>Buyer</th>
            <th>Delivery</th>
            <th className="num">Items</th>
            <th className="num">GMV</th>
            <th>Status</th>
            <th>Placed</th>
            <th></th>
          </tr></thead>
          <tbody>
            {ORDERS_DATA.map(o => (
              <tr key={o.id}>
                <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-800)' }}>{o.id}</span></td>
                <td>
                  <div className="ent">
                    <BrandAvatarSm initials={o.buyerInitials} hue={o.buyerHue} size={30} />
                    <div className="ent-meta">
                      <div className="ent-name" style={{ fontSize: 13 }}>{o.buyer}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 12.5 }}>{o.delivery}</td>
                <td className="num">{o.items}</td>
                <td className="num"><span className="num-display">{inrShort(o.gmv)}</span></td>
                <td><StatusTagV2 label={o.status.label} tone={o.status.tone} /></td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-700)' }}>{o.placed}</td>
                <td className="chev">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

Object.assign(window, {
  BrandsLandingV2, ProductsLandingV2, CustomersLandingV2,
  CohortsLandingV2, CatalogsLandingV2, OrdersLandingV2,
});
