// brands/VariationC.jsx — "Brand Lookbook"
// Bold. Portfolio share-bar on top, then large brand tiles in a 3-up grid.
// Each tile reads as a curated card: hero stripe, GMV in serif, sparkline,
// 2 micro-KPIs, status verb. Alerts surface as a footer band on the card.

function VariationC({ tweaks }) {
  const sorted = [...BRANDS_DATA].sort((a, b) => {
    if (tweaks.sortBy === 'growth')   return b.growth - a.growth;
    if (tweaks.sortBy === 'share')    return b.share - a.share;
    if (tweaks.sortBy === 'alpha')    return a.name.localeCompare(b.name);
    return b.gmv - a.gmv;
  });

  // Stacked share-bar segments. Each brand gets a band coloured to its hue.
  const hueClass = (b, i) => {
    const fallback = ['s-teal', 's-ember', 's-teal2', 's-ember2', 's-cream'][i];
    if (b.hue === 'teal')  return i % 2 === 0 ? 's-teal'  : 's-teal2';
    if (b.hue === 'ember') return i % 2 === 0 ? 's-ember' : 's-ember2';
    return fallback;
  };

  return (
    <div className="vc">
      <SectionBar
        title="Brand portfolio"
        count="5 brands · this month"
        view="overview"
        sortBy={({
          gmv:    'GMV (high → low)',
          growth: 'Growth (best → worst)',
          share:  'Share (high → low)',
          alpha:  'A → Z',
        })[tweaks.sortBy] || 'GMV (high → low)'}
      />

      {/* Portfolio composition bar ─ a single visual that shows how the
          ₹47.3 L splits across brands. */}
      <div className="vc-portfolio-bar">
        <div className="vc-portfolio-bar-head">
          <div className="l">Portfolio composition</div>
          <div className="r">₹47.3 L · this month · 5 brands</div>
        </div>
        <div className="vc-portfolio-bar-vis">
          {sorted.map((b, i) => (
            <div key={b.id} className={`vc-portfolio-seg ${hueClass(b, i)}`}
              style={{ flex: b.share }} title={`${b.name} · ${b.share.toFixed(1)}%`}>
              {b.share > 10 ? `${b.initials} · ${b.share.toFixed(0)}%` : b.initials}
            </div>
          ))}
        </div>
      </div>

      <div className="vc-grid">
        {sorted.map(b => (
          <div className="vc-card" key={b.id}>
            <div className={`vc-card-hero h-${b.hue}`}>
              <div>
                <div className="name">{b.name}</div>
                <div className="meta">{b.category.toUpperCase()} · {b.region}</div>
              </div>
              <VerbPill label={b.statusVerb} tone={b.statusTone} />
            </div>

            <div className="vc-card-body">
              <div className="vc-card-gmv">
                <div className="v">{inrShort(b.gmv)}</div>
                <div style={{ textAlign: 'right' }}>
                  <GrowthPill value={b.growth} />
                  <div className="h">vs {inrShort(b.gmvPrior)} last month</div>
                </div>
              </div>

              <div className="vc-card-spark">
                <MiniSpark data={b.spark} width={300} height={36} />
              </div>

              <div className="vc-card-row">
                <div className="l">Share of portfolio</div>
                <div className="v">{b.share.toFixed(1)}%</div>
              </div>
              <div className="vc-card-row v-buyers">
                <div className="l">Buyers</div>
                <div className="v-bar"><i style={{ width: (b.activeBuyers / b.totalBuyers * 100) + '%' }}></i></div>
                <div className="v">{b.activeBuyers}<span style={{ color: 'var(--cream-600)' }}>/{b.totalBuyers}</span></div>
              </div>
              <div className="vc-card-row">
                <div className="l">Low stock · catalog</div>
                <div className="v">
                  {b.lowStock} SKU{b.lowStock === 1 ? '' : 's'} · {b.daysSinceCatalog}d ago
                </div>
              </div>
            </div>

            {b.alerts.length > 0 && tweaks.showAlerts !== false && (
              <div className="vc-card-alerts">
                <span className="dot"></span>
                <span>{b.alerts[0].label}{b.alerts.length > 1 ? ` · +${b.alerts.length - 1} more` : ''}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

window.VariationC = VariationC;
