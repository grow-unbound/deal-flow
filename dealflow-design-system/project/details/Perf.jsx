// details/Perf.jsx — Performance panels for each entity.

/* Generic helper — small KPI block embedded inside a perf panel */
function PerfStat({ label, value, sub, tone }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 0, fontSize: 10.5 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em',
        marginTop: 4, fontVariantNumeric: 'tabular-nums',
        color: tone === 'danger' ? 'var(--danger-500)' : 'var(--cream-900)',
      }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--cream-700)' }}>{sub}</div>
      )}
    </div>
  );
}

/* ─── BRAND PERF ───────────────────────────────────────────── */
function BrandPerf({ d }) {
  const p = d.perf;
  return (
    <React.Fragment>
      <div className="perf-grid" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div>
              <h3>GMV trend</h3>
              <div className="sub">Last 12 months · this brand</div>
            </div>
            <div className="view-switch" style={{ background: 'var(--cream-200)' }}>
              <button className="is-active">12 mo</button>
              <button>YTD</button>
              <button>3 mo</button>
            </div>
          </div>
          <div className="perf-panel-body">
            <div className="perf-headline">
              <div className="v">{inrShort(p.gmv)}</div>
              <div className="h"><GrowthPill value={p.growth} /> vs last month · {inrShort(p.gmvPrior)}</div>
            </div>
            <TrendChart data={p.trend} labels={p.trendLabels} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="editorial">
            <div className="eyebrow">This brand</div>
            <p>
              <b>WineYard</b> is your largest principal — <b>{p.share}%</b> of portfolio,
              growing +{p.growth}% MoM. Singh Hospitality drove a third of GMV this month.
              Restock the Cabernet Sauvignon by <b>Jul 12</b> to avoid a stockout.
            </p>
          </div>
          <div className="perf-panel">
            <div className="perf-panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 18 }}>
                <PerfStat label="Margin (avg)"  value={`${p.margin}%`}  sub="across SKUs" />
                <PerfStat label="Sell-through"  value={`${p.sellThrough}%`} sub="last 30 days" />
                <PerfStat label="Repeat rate"   value={`${p.repeatRate}%`}  sub="buyers re-ordering" />
                <PerfStat label="Buyer reach"   value={`${p.activeBuyers}/${p.totalBuyers}`} sub="bought this month" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="perf-grid cols-2" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Top buyers</h3><div className="sub">By GMV · this month</div></div>
            <a className="panel-link">See all →</a>
          </div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topBuyers.map((b, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <BrandAvatarSm initials={b.name.split(' ').map(w => w[0]).slice(0,2).join('')} hue={['teal','ember','cream','teal'][i]} size={28} />
                  <div className="name">{b.name}<div className="sub">{b.city.toUpperCase()}</div></div>
                  <div className="value">{inrShort(b.spend)}<div className="sub">{b.orders} orders</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Top SKUs</h3><div className="sub">By units · this month</div></div>
            <a className="panel-link">See all →</a>
          </div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topSkus.map((s, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <div className="name">{s.name}<div className="sub">{s.sku}</div></div>
                  <div className="value">{inrShort(s.gmv)}<div className="sub">{s.units} units</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="perf-panel">
        <div className="perf-panel-head">
          <div><h3>Catalog history</h3><div className="sub">What you sent · how it landed</div></div>
        </div>
        <div className="perf-panel-body flush">
          <table className="simple-table">
            <thead>
              <tr><th>Catalog</th><th>Sent</th><th>Cohort</th><th className="num">Orders</th><th className="num">GMV</th></tr>
            </thead>
            <tbody>
              {p.catalogHistory.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--cream-700)' }}>{c.sent}</td>
                  <td>{c.cohort}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{inrShort(c.gmv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ─── PRODUCT PERF ─────────────────────────────────────────── */
function ProductPerf({ d }) {
  const p = d.perf;
  return (
    <React.Fragment>
      <div className="perf-grid" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Units sold</h3><div className="sub">Last 12 months</div></div>
          </div>
          <div className="perf-panel-body">
            <div className="perf-headline">
              <div className="v">{p.units}</div>
              <div className="h"><GrowthPill value={p.growth} /> · {inrShort(p.gmv)} in revenue</div>
            </div>
            <TrendChart data={p.trend} accent="var(--ember-400)" accentSoft="rgba(194,110,58,0.10)" />
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Inventory & ops</h3></div></div>
          <div className="perf-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 18 }}>
              <PerfStat label="On hand"        value={`${p.onHand}`}        sub="bottles" />
              <PerfStat label="Days of cover"  value={`${p.daysOfCover} d`} sub="at current pace" tone={p.daysOfCover < 14 ? 'danger' : ''} />
              <PerfStat label="Sell-through"   value={`${p.sellThrough}%`}  sub="last 30 days" />
              <PerfStat label="Last ordered"   value={p.lastOrdered}        sub="Singh Hospitality" />
            </div>
          </div>
        </div>
      </div>

      <div className="perf-grid cols-2">
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Top buyers</h3><div className="sub">Who's been buying this SKU</div></div>
          </div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topBuyers.map((b, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <div className="name">{b.name}<div className="sub">{b.city.toUpperCase()}</div></div>
                  <div className="value">{b.units}<div className="sub">bottles</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Price by cohort</h3><div className="sub">Base + overrides</div></div>
          </div>
          <div className="perf-panel-body flush">
            <table className="simple-table">
              <thead>
                <tr><th>Cohort</th><th className="num">Price</th><th>Override</th></tr>
              </thead>
              <tbody>
                {p.priceByCohort.map((row, i) => (
                  <tr key={i}>
                    <td>{row.cohort}</td>
                    <td className="num">{inrFmt(row.price)}</td>
                    <td>
                      {row.override
                        ? <StatusTag label="Override" tone="accent" />
                        : <span style={{ fontSize: 11.5, color: 'var(--cream-700)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ─── CUSTOMER PERF ────────────────────────────────────────── */
function CustomerPerf({ d }) {
  const p = d.perf;
  const utilization = Math.round((d.creditUsed / d.creditLimit) * 100);
  return (
    <React.Fragment>
      <div className="perf-grid" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Spend trend</h3><div className="sub">Last 12 months</div></div>
          </div>
          <div className="perf-panel-body">
            <div className="perf-headline">
              <div className="v">{inrShort(p.spend)}</div>
              <div className="h"><GrowthPill value={p.growth} /> · {p.orders} orders · AOV {inrShort(p.aov)}</div>
            </div>
            <TrendChart data={p.trend} />
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Brand mix</h3><div className="sub">This month</div></div>
          </div>
          <div className="perf-panel-body">
            <div className="mix-bar">
              {p.brandMix.map((b, i) => (
                <div key={i} className={`seg ${b.hue}`} style={{ width: b.share + '%' }}>
                  {b.share}%
                </div>
              ))}
            </div>
            <div className="mix-legend">
              {p.brandMix.map((b, i) => (
                <div key={i} className="mix-legend-row">
                  <i style={{ background: b.hue === 'teal' ? 'var(--teal-500)' : b.hue === 'ember' ? 'var(--ember-400)' : 'var(--cream-600)' }}></i>
                  <span className="n">{b.name}</span>
                  <span className="v">{b.share}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="perf-grid cols-2">
        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Top SKUs</h3><div className="sub">What this buyer keeps reordering</div></div></div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topSkus.map((s, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <div className="name">{s.name}<div className="sub">{s.sku}</div></div>
                  <div className="value">{inrShort(s.gmv)}<div className="sub">{s.units} units</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Credit & ops</h3></div></div>
          <div className="perf-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 18, marginBottom: 18 }}>
              <PerfStat label="Last order" value={p.lastOrder} sub="₹84,200" />
              <PerfStat label="Catalog opens" value={p.catalogOpens} sub="in PWA, this month" />
            </div>
            <div className="eyebrow" style={{ marginBottom: 0 }}>Credit utilization</div>
            <div className="gauge"><div className="fill" style={{ width: utilization + '%' }}></div></div>
            <div className="gauge-foot">
              <span>{inrFmt(d.creditUsed)} used</span>
              <span>{utilization}% of {inrFmt(d.creditLimit)}</span>
            </div>
            <div style={{
              marginTop: 14, fontSize: 12, color: 'var(--cream-800)',
              padding: '8px 10px', background: 'var(--success-50)',
              borderRadius: 8, border: '1px solid rgba(74,124,78,0.18)',
            }}>
              ✓ Payment behavior — {p.paymentBehavior}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ─── COHORT PERF ──────────────────────────────────────────── */
function CohortPerf({ d }) {
  const p = d.perf;
  return (
    <React.Fragment>
      <div className="perf-grid" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>GMV trend</h3><div className="sub">Last 12 months · from this cohort</div></div>
          </div>
          <div className="perf-panel-body">
            <div className="perf-headline">
              <div className="v">{inrShort(p.gmv)}</div>
              <div className="h"><GrowthPill value={p.growth} /> vs last month · AOV {inrShort(p.avgOrderValue)}</div>
            </div>
            <TrendChart data={p.trend} />
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Engagement</h3></div></div>
          <div className="perf-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 18, marginBottom: 6 }}>
              <PerfStat label="Active members"  value={`${p.activeMembers}/${d.members}`} sub="ordered this month" />
              <PerfStat label="Dormant"          value={p.dormantMembers} sub="no order in 30 days" tone={p.dormantMembers > 5 ? 'danger' : ''} />
              <PerfStat label="Conversion"      value={`${p.conversionRate}%`} sub="catalog → order" />
              <PerfStat label="Brands sold"     value={p.brandsSold} sub="of 5 carried" />
            </div>
          </div>
        </div>
      </div>

      <div className="perf-grid cols-2">
        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Top members</h3><div className="sub">By GMV · this month</div></div></div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topMembers.map((m, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <BrandAvatarSm initials={m.name.split(' ').map(w => w[0]).slice(0,2).join('')} hue={['teal','ember','cream','teal'][i]} size={28} />
                  <div className="name">{m.name}<div className="sub">{m.city.toUpperCase()}</div></div>
                  <div className="value">{inrShort(m.spend)}<div className="sub">{m.orders} orders</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Catalogs to this cohort</h3><div className="sub">Recent sends</div></div></div>
          <div className="perf-panel-body flush">
            <table className="simple-table">
              <thead>
                <tr><th>Catalog</th><th>Sent</th><th className="num">Opens</th><th className="num">Orders</th><th className="num">GMV</th></tr>
              </thead>
              <tbody>
                {p.catalogPerformance.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--cream-700)' }}>{c.sent}</td>
                    <td className="num">{c.opens}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{inrShort(c.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ─── CATALOG PERF ─────────────────────────────────────────── */
function CatalogPerf({ d }) {
  const p = d.perf;
  return (
    <React.Fragment>
      <div className="perf-grid" style={{ marginBottom: 16 }}>
        <div className="perf-panel">
          <div className="perf-panel-head">
            <div><h3>Cumulative orders</h3><div className="sub">Since publish · valid until {d.validUntil}</div></div>
          </div>
          <div className="perf-panel-body">
            <div className="perf-headline">
              <div className="v">{p.orders}</div>
              <div className="h">{inrShort(p.gmv)} · <GrowthPill value={p.growth} /> vs previous catalog</div>
            </div>
            <TrendChart data={p.trend} accent="var(--ember-400)" accentSoft="rgba(194,110,58,0.10)" />
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Funnel</h3></div></div>
          <div className="perf-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, rowGap: 18 }}>
              <PerfStat label="Views"          value={p.views}        sub={`${p.uniqueViewers} unique`} />
              <PerfStat label="Opens → order"  value={`${p.conversionRate}%`} sub="conversion" />
              <PerfStat label="AOV"            value={inrShort(p.aov)} sub="across orders" />
              <PerfStat label="Abandoners"     value={p.abandoners}    sub="opened, didn't order" tone={p.abandoners > 2 ? 'danger' : ''} />
            </div>
          </div>
        </div>
      </div>

      <div className="perf-grid cols-2">
        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Top SKUs in this catalog</h3></div></div>
          <div className="perf-panel-body flush">
            <div className="compact-list">
              {p.topSkus.map((s, i) => (
                <div className="compact-row" key={i}>
                  <div className="idx">{i + 1}</div>
                  <div className="name">{s.name}<div className="sub">{s.sku}</div></div>
                  <div className="value">{inrShort(s.gmv)}<div className="sub">{s.units} units</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="perf-panel">
          <div className="perf-panel-head"><div><h3>Per-buyer activity</h3><div className="sub">From this catalog's cohort</div></div></div>
          <div className="perf-panel-body flush">
            <table className="simple-table">
              <thead>
                <tr><th>Buyer</th><th>Opened</th><th className="num">Orders</th><th className="num">GMV</th></tr>
              </thead>
              <tbody>
                {p.buyers.map((b, i) => (
                  <tr key={i}>
                    <td>{b.name}<div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--cream-700)', marginTop: 2 }}>{b.city.toUpperCase()}</div></td>
                    <td>
                      {b.opened === 'yes'
                        ? <StatusTag label="Opened" tone="success" />
                        : <StatusTag label="Not yet" tone="warning" />}
                    </td>
                    <td className="num">{b.orders}</td>
                    <td className="num">{b.gmv > 0 ? inrShort(b.gmv) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, {
  PerfStat, BrandPerf, ProductPerf, CustomerPerf, CohortPerf, CatalogPerf,
});
