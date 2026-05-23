// ui_kits/cockpit/Shell.jsx
// Topbar + sidebar + content area. Active nav is controlled by parent.

function Shell({ active, onNavigate, children }) {
  const nav = [
    { id: 'dashboard', label: 'Dashboard', Icon: IconHome },
    { id: 'brands', label: 'Brands', Icon: IconBrands, count: 5 },
    { id: 'products', label: 'Products', Icon: IconProduct, count: 357 },
    { id: 'buyers', label: 'Buyers', Icon: IconBuyers, count: 142 },
    { id: 'cohorts', label: 'Cohorts', Icon: IconCohort, count: 4 },
    { id: 'pricelists', label: 'Price lists', Icon: IconPrice },
    { id: 'catalogs', label: 'Catalogs', Icon: IconCatalog, count: 4 },
    { id: 'orders', label: 'Orders', Icon: IconOrders, count: 28 },
    { id: 'exports', label: 'Exports', Icon: IconExport },
    { id: 'settings', label: 'Settings', Icon: IconSettings },
  ];
  return (
    <div className="cockpit-shell">
      <aside className="cockpit-sidebar">
        <div className="cockpit-brand">
          <img src="../../assets/logo-mark.svg" width="32" height="32" alt="" />
          <div className="cockpit-brand-text">
            <div className="cockpit-brand-name">DealFlow</div>
            <div className="cockpit-brand-sub">Phani Distribution</div>
          </div>
          <button className="cockpit-tenant-switch" title="Switch tenant"><IconChev size={14} /></button>
        </div>

        <nav className="cockpit-nav">
          {nav.map(item => (
            <button
              key={item.id}
              className={'cockpit-nav-item' + (active === item.id ? ' is-active' : '')}
              onClick={() => onNavigate(item.id)}
            >
              <item.Icon size={17} />
              <span>{item.label}</span>
              {item.count != null && <span className="cockpit-nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="cockpit-sidebar-footer">
          <div className="cockpit-avatar">PR</div>
          <div className="cockpit-user">
            <div className="cockpit-user-name">Phani Raju</div>
            <div className="cockpit-user-role">Seller admin</div>
          </div>
          <button className="cockpit-icon-btn" title="Notifications"><IconBell size={16} /></button>
        </div>
      </aside>

      <div className="cockpit-main">
        <header className="cockpit-topbar">
          <div className="cockpit-search">
            <IconSearch size={16} />
            <input placeholder="Search brands, products, buyers, orders…" />
            <kbd>⌘K</kbd>
          </div>
          <div className="cockpit-topbar-right">
            <button className="cockpit-btn cockpit-btn-ghost">
              <IconExternal size={14} />
              <span>Open buyer app</span>
            </button>
            <button className="cockpit-btn cockpit-btn-accent">
              <IconPlus size={15} />
              <span>Publish catalog</span>
            </button>
          </div>
        </header>
        <main className="cockpit-content">{children}</main>
      </div>
    </div>
  );
}

window.Shell = Shell;
