// brands/VariationB.jsx — "Quadrant Brief"
// Editorial. Growth × Share quadrant chart on the left,
// narrative + quadrant-grouped brand list on the right.

function VariationB({ tweaks }) {
  // Quadrant plot is 0–100% on each axis (within the bordered .vb-plot).
  // We map:
  //   x = share (0–40% of portfolio) → 0–100%
  //   y = growth (−15% to +25%) → 0 at bottom to 100 at top
  // Mid-lines are at share=15% and growth=0% by default.
  const xMax = 40;
  const yMin = -15;
  const yMax = 25;

  function pos(b) {
    const x = Math.max(0, Math.min(100, (b.share / xMax) * 100));
    const y = 100 - Math.max(0, Math.min(100, ((b.growth - yMin) / (yMax - yMin)) * 100));
    return { x, y };
  }

  // Bubble size by GMV (range 28–68px).
  const minGmv = Math.min(...BRANDS_DATA.map(b => b.gmv));
  const maxGmv = Math.max(...BRANDS_DATA.map(b => b.gmv));
  function bubbleSize(g) {
    const t = (g - minGmv) / (maxGmv - minGmv || 1);
    return 32 + t * 32;
  }

  const groups = {
    star:      { title: 'Stars',       sub: 'High share · growing',   tone: 'var(--success-500)', list: [] },
    rising:    { title: 'Rising bets', sub: 'Small but climbing',     tone: 'var(--ember-400)',   list: [] },
    workhorse: { title: 'Workhorses',  sub: 'Big share · steady',     tone: 'var(--teal-400)',    list: [] },
    watchlist: { title: 'Watchlist',   sub: 'Slipping or stalled',    tone: 'var(--danger-500)',  list: [] },
  };
  BRANDS_DATA.forEach(b => groups[b.quadrant] && groups[b.quadrant].list.push(b));

  return (
    <div className="vb">
      <SectionBar
        title="Brand portfolio"
        count="5 brands · this month"
        view="overview"
        sortBy="GMV (high → low)"
      />

      <div className="vb-body">
        {/* ── QUADRANT ─────────────────────────────────────── */}
        <div className="vb-quadrant">
          <div className="vb-quadrant-head">
            <div>
              <h2>Growth × Share</h2>
              <p>Where each brand sits in your portfolio this month. Bubble size scales with GMV.</p>
            </div>
            <div className="vb-quadrant-legend">
              <span><i style={{ background: 'var(--teal-500)' }}></i>Indian</span>
              <span><i style={{ background: 'var(--ember-400)' }}></i>Mixed</span>
              <span><i style={{ background: 'var(--cream-500)' }}></i>Import</span>
            </div>
          </div>

          <div className="vb-plot-wrap">
            <div className="vb-plot">
              {/* Quadrant labels */}
              <div className="vb-quad-label" style={{ left: 12, top: 8 }}>Rising bets</div>
              <div className="vb-quad-label" style={{ right: 12, top: 8 }}>Stars</div>
              <div className="vb-quad-label" style={{ left: 12, bottom: 8 }}>Watchlist</div>
              <div className="vb-quad-label" style={{ right: 12, bottom: 8 }}>Workhorses</div>

              {/* Bubbles */}
              {BRANDS_DATA.map(b => {
                const p = pos(b);
                const sz = bubbleSize(b.gmv);
                return (
                  <div key={b.id} className="vb-dot" style={{
                    left: p.x + '%', top: p.y + '%',
                  }}>
                    <div className={`vb-bubble ${b.hue}`} style={{ width: sz, height: sz }}>
                      {b.initials}
                    </div>
                    <div className="vb-dot-label">{b.name.split(' ')[0]}</div>
                  </div>
                );
              })}

              {/* Axis labels */}
              <div className="vb-axis-x">Share of portfolio →</div>
              <div className="vb-axis-y">Growth vs last month →</div>
            </div>
          </div>
        </div>

        {/* ── EDITORIAL BRIEF ───────────────────────────────── */}
        <div className="vb-brief">
          <div className="vb-brief-head">
            <div className="eyebrow">This month's read</div>
            <h3>Two brands carry the portfolio. Aravalli is closing in. Tara needs a call this week.</h3>
            <p className="lead">
              <b>WineYard</b> and <b>Khanna Brewing</b> together hold <b>59% of GMV</b> and both are
              growing. <b>Aravalli</b> is your fastest mover (+18%) on a smaller base.
              <b> Tara Spirits</b> has slipped −8% with no new catalog in 28 days.
            </p>
          </div>

          {Object.entries(groups).map(([k, g]) => (
            <div key={k} className="vb-quad-group">
              <div className="vb-quad-group-head">
                <span className="swatch" style={{ background: g.tone }}></span>
                <h4>{g.title}</h4>
                <span style={{ fontSize: 11, color: 'var(--cream-700)', textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>
                  · {g.sub}
                </span>
                <span className="count">{g.list.length}</span>
              </div>
              {g.list.map(b => (
                <div className="vb-quad-row" key={b.id}>
                  <BrandAvatarSm initials={b.initials} hue={b.hue} size={26} />
                  <div className="name">{b.name}</div>
                  <GrowthPill value={b.growth} />
                  <div className="gmv">{inrShort(b.gmv)}</div>
                </div>
              ))}
              {g.list.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--cream-600)', padding: '2px 0' }}>—</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.VariationB = VariationB;
