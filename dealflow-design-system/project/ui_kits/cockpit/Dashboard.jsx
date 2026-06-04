// ui_kits/cockpit/Dashboard.jsx
// Dashboard screen: KPI strip + brand performance + recent orders + empty/onboarding nudge.

function Dashboard({ onNavigate }) {
  const topBrands = DF_DATA.brands.slice(0, 5).map((b, i) => ({
    ...b,
    pct: [82, 64, 58, 41, 22][i],
    trend: b.gmvTrend,
  }));
  const recent = DF_DATA.orders.slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow="This week"
        title="Good morning, Phani."
        subtitle="14 orders placed across 5 brands. Two catalogs went out yesterday. Singh Hospitality just received their Premium Reserve delivery."
        actions={
          <>
            <button className="cockpit-btn cockpit-btn-secondary"><IconCalendar size={14} /><span>Last 7 days</span><IconChev size={12} /></button>
            <button className="cockpit-btn cockpit-btn-primary" onClick={() => onNavigate('catalogs')}>
              <IconCatalog size={14} />
              <span>Go to catalogs</span>
            </button>
          </>
        }
      />

      <div className="kpi-grid">
        <KPITile label="Orders this week" value="14" delta="+3" hint="vs last week" deltaTone="up" />
        <KPITile label="GMV this week" value="₹10,84,420" delta="+12%" hint="vs last week" deltaTone="up" />
        <KPITile label="Active catalogs" value="3" delta="1 expiring" deltaTone="down" />
        <KPITile label="Low-stock alerts" value="7" delta="−2" hint="resolved" deltaTone="up" />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Brand performance</h2>
              <div className="panel-subtitle">GMV share this week · across 5 brand principals</div>
            </div>
            <a className="panel-link" onClick={() => onNavigate('brands')}>All brands <IconChevR size={12} /></a>
          </div>
          <div className="panel-body">
            <div className="brand-list">
              {topBrands.map((b, i) => (
                <div className="brand-row" key={b.id}>
                  <BrandAvatar initials={b.initials} hue={['teal','ember','cream','teal','ember'][i]} />
                  <div className="brand-row-meta">
                    <div className="brand-row-name">{b.name}</div>
                    <div className="brand-row-sub">{b.skus} SKUs · {b.cohorts} cohorts</div>
                  </div>
                  <div className="brand-row-bar"><div className="brand-row-bar-fill" style={{ width: b.pct + '%' }}></div></div>
                  <div className={'brand-row-trend ' + (b.trend.startsWith('−') || b.trend.startsWith('-') ? 'down' : 'up')}>{b.trend}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Latest orders</h2>
              <div className="panel-subtitle">Across all buyers</div>
            </div>
            <a className="panel-link" onClick={() => onNavigate('orders')}>All orders <IconChevR size={12} /></a>
          </div>
          <div className="panel-body">
            <div className="mini-list">
              {recent.map(o => (
                <div className="mini-row" key={o.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mini-row-id">{o.id}</div>
                    <div className="mini-row-buyer">{o.buyer}</div>
                  </div>
                  <StatusPill status={o.status} />
                  <div className="mini-row-total">{inr(o.total)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
