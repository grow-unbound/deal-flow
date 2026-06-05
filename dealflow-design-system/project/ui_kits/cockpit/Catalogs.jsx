// ui_kits/cockpit/Catalogs.jsx
// Published catalogs grid (lookbook tiles).

function CatalogCard({ c, onPick }) {
  return (
    <div className="catalog-card" onClick={onPick}>
      <div className={'catalog-hero catalog-hero-' + c.hue}>
        <h3>{c.name}</h3>
        <span className={'catalog-hero-badge ' + (c.status === 'draft' ? 'draft' : 'published')}>
          {c.status === 'draft' ? 'DRAFT' : 'LIVE'}
        </span>
      </div>
      <div className="catalog-body">
        <div className="catalog-meta">
          <div className="row"><span>Cohort</span><strong>{c.cohort}</strong></div>
          <div className="row"><span>Products</span><strong>{c.products}</strong></div>
          <div className="row"><span>Valid until</span><strong>{c.validUntil}</strong></div>
        </div>
      </div>
    </div>
  );
}

function Catalogs({ onPublish }) {
  return (
    <div>
      <PageHeader
        eyebrow="Catalogs"
        title="Published to your retailers"
        subtitle="Catalogs are how retailers see what you're carrying this week. Each one is scoped to a cohort, buyer, or geography — and expires automatically."
        actions={
          <>
            <button className="cockpit-btn cockpit-btn-secondary">
              <IconExternal size={14} /><span>Open as a buyer</span>
            </button>
            <button className="cockpit-btn cockpit-btn-accent" onClick={onPublish}>
              <IconPlus size={15} /><span>New catalog</span>
            </button>
          </>
        }
      />

      <div className="catalog-grid">
        {DF_DATA.catalogs.map(c => (
          <CatalogCard key={c.id} c={c} onPick={onPublish} />
        ))}
      </div>
    </div>
  );
}

window.Catalogs = Catalogs;
