// brands/VariationA.jsx — "Portfolio Cockpit"
// Conservative, table-leaning. Leaderboard of brands on the left,
// stacked Top/Attention/Rising callouts on the right.

function VariationA({ tweaks }) {
  // Sort the brand list per tweak.
  const sortedBrands = [...BRANDS_DATA].sort((a, b) => {
    if (tweaks.sortBy === 'growth')   return b.growth - a.growth;
    if (tweaks.sortBy === 'share')    return b.share - a.share;
    if (tweaks.sortBy === 'alpha')    return a.name.localeCompare(b.name);
    return b.gmv - a.gmv;
  });
  const sortLabel = ({
    gmv:    'GMV (high → low)',
    growth: 'Growth (best → worst)',
    share:  'Share (high → low)',
    alpha:  'A → Z',
  })[tweaks.sortBy] || 'GMV (high → low)';

  const topPerformers = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const risingBrands  = [...BRANDS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attentionBrands = BRANDS_DATA.filter(b => b.alerts.length > 0);

  return (
    <div className="va">
      <SectionBar
        title="Brand portfolio"
        count={`5 brands · this month`}
        view="overview"
        sortBy={sortLabel}
      />

      <div className="va-body">
        {/* LEADERBOARD ─────────────────────────────────────── */}
        <div className="va-leaderboard">
          <div className="va-row va-row-head">
            <div></div>
            <div className="th">Brand</div>
            <div className="th" style={{ textAlign: 'right' }}>GMV · MTD</div>
            <div className="th">Growth</div>
            <div className="th">Share of portfolio</div>
            <div className="th" style={{ textAlign: 'right' }}>Buyers</div>
            <div></div>
          </div>

          {sortedBrands.map((b, i) => (
            <div className="va-row" key={b.id}>
              <BrandAvatarSm initials={b.initials} hue={b.hue} size={38} />
              <div style={{ minWidth: 0 }}>
                <div className="va-name">{b.name}</div>
                <div className="va-name-sub">{b.category.toUpperCase()} · {b.region} · {b.skus} SKUs</div>
              </div>
              <div className="va-gmv">{inrShort(b.gmv)}</div>
              <div><GrowthPill value={b.growth} /></div>
              <div className="va-share">
                <ShareBar pct={b.share * 2.4} hue={b.hue} />
                <div className="va-share-num">{b.share.toFixed(1)}% of ₹47.3 L</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-800)',
                textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              }}>
                {b.activeBuyers}<span style={{ color: 'var(--cream-600)' }}> / {b.totalBuyers}</span>
              </div>
              <div className="va-chev">›</div>
            </div>
          ))}
        </div>

        {/* CALLOUT COLUMN ──────────────────────────────────── */}
        {tweaks.showAlerts !== false && (
          <div className="va-callouts">
            {/* Needs attention */}
            <div className="va-callout is-attention">
              <div className="va-callout-head">
                <div className="eyebrow" style={{ color: 'var(--ember-700)' }}>
                  Needs attention
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember-600)',
                  background: 'var(--ember-50)', padding: '2px 7px', borderRadius: 999,
                  fontWeight: 600,
                }}>{attentionBrands.length}</span>
              </div>
              <div className="va-callout-list">
                {attentionBrands.map(b => (
                  <div className="va-callout-item" key={b.id} style={{ alignItems: 'flex-start' }}>
                    <BrandAvatarSm initials={b.initials} hue={b.hue} size={32} />
                    <div className="col-meta">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div className="name" style={{ flex: '0 1 auto' }}>{b.name}</div>
                        <GrowthPill value={b.growth} />
                      </div>
                      <div className="reason">
                        {b.alerts.slice(0, 2).map(a => a.label).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
                {attentionBrands.length === 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--cream-700)', padding: '4px 0' }}>
                    No alerts. All brands are within thresholds.
                  </div>
                )}
              </div>
            </div>

            {/* Top performers */}
            <div className="va-callout">
              <div className="va-callout-head">
                <div className="eyebrow">Top performers</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>by GMV</span>
              </div>
              <div className="va-callout-list">
                {topPerformers.map(b => (
                  <div className="va-callout-item" key={b.id}>
                    <BrandAvatarSm initials={b.initials} hue={b.hue} size={32} />
                    <div className="col-meta">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div className="name">{b.name}</div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                          {inrShort(b.gmv)}
                        </span>
                      </div>
                      <div className="reason">{b.share.toFixed(1)}% of portfolio · {b.activeBuyers} buyers</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rising */}
            <div className="va-callout">
              <div className="va-callout-head">
                <div className="eyebrow">Rising</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>fastest growth</span>
              </div>
              <div className="va-callout-list">
                {risingBrands.map(b => (
                  <div className="va-callout-item" key={b.id}>
                    <BrandAvatarSm initials={b.initials} hue={b.hue} size={32} />
                    <div className="col-meta">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div className="name">{b.name}</div>
                        <GrowthPill value={b.growth} />
                      </div>
                      <div className="reason">
                        from {inrShort(b.gmvPrior)} → {inrShort(b.gmv)} this month
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.VariationA = VariationA;
