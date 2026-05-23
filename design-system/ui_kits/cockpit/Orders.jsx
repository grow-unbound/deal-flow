// ui_kits/cockpit/Orders.jsx
// Orders screen: status filter chips + table + inline detail panel.

function Orders() {
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState('DF-2026-00470');

  const filters = [
    { id: 'all', label: 'All', count: DF_DATA.orders.length },
    { id: 'received', label: 'Received', count: DF_DATA.orders.filter(o => o.status === 'received').length },
    { id: 'confirmed', label: 'Confirmed', count: DF_DATA.orders.filter(o => o.status === 'confirmed').length },
    { id: 'dispatched', label: 'Dispatched', count: DF_DATA.orders.filter(o => o.status === 'dispatched').length },
    { id: 'delivered', label: 'Delivered', count: DF_DATA.orders.filter(o => o.status === 'delivered').length },
  ];

  const rows = filter === 'all' ? DF_DATA.orders : DF_DATA.orders.filter(o => o.status === filter);
  const detail = DF_DATA.orders.find(o => o.id === selected) || DF_DATA.orders[0];

  // Fake line items for the detail
  const lines = [
    { name: 'Cabernet Sauvignon 2021', brand: 'WineYard Vintners', sku: 'VINO-CAB-750-2021', qty: 48, price: 2450, hue: 'teal' },
    { name: 'Chenin Blanc',             brand: 'Maison Roussel',    sku: 'MRSL-CB-750-2022',  qty: 24, price: 1640, hue: 'cream' },
    { name: 'Indian Pale Ale',          brand: 'Khanna Brewing Co.', sku: 'KHAN-IPA-330-006',  qty: 36, price:  580, hue: 'ember' },
  ];
  const timeline = ['received', 'confirmed', 'dispatched', 'delivered'];
  const currentIdx = timeline.indexOf(detail.status);

  return (
    <div>
      <PageHeader
        eyebrow="Orders"
        title="Order log"
        subtitle="All orders across every buyer and cohort. Click a row to see the line items and status timeline."
        actions={
          <>
            <button className="cockpit-btn cockpit-btn-secondary"><IconFilter size={14} /><span>Filter</span></button>
            <button className="cockpit-btn cockpit-btn-secondary"><IconExport size={14} /><span>Export Tally CSV</span></button>
          </>
        }
      />

      <div className="toolbar">
        <div className="toolbar-tabs">
          {filters.map(f => (
            <button
              key={f.id}
              className={'toolbar-tab' + (filter === f.id ? ' is-active' : '')}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <span style={{ color: 'var(--cream-600)', marginLeft: 4 }}>{f.count}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--cream-700)' }}>
          <IconCalendar size={14} />
          <span>Last 30 days</span>
          <IconChev size={12} />
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Catalog</th>
              <th>Status</th>
              <th>Placed</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.id} className={selected === o.id ? 'is-selected' : ''} onClick={() => setSelected(o.id)}>
                <td>
                  <div className="sku">{o.id}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-700)' }}>{o.items} items</div>
                </td>
                <td><strong style={{ fontWeight: 500 }}>{o.buyer}</strong></td>
                <td style={{ color: 'var(--cream-700)' }}>{o.catalog}</td>
                <td><StatusPill status={o.status} /></td>
                <td style={{ color: 'var(--cream-700)', fontSize: 12 }}>{o.placed}</td>
                <td className="num">{inr(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }} className="order-detail">
        <div className="order-detail-head">
          <div>
            <div className="order-id">{detail.id} · placed {detail.placed}</div>
            <div className="order-buyer">{detail.buyer}</div>
            <div style={{ fontSize: 13, color: 'var(--cream-700)', marginTop: 4 }}>
              Via catalog <strong style={{ color: 'var(--cream-900)' }}>{detail.catalog}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cockpit-btn cockpit-btn-secondary cockpit-btn-sm">Download invoice</button>
            <button className="cockpit-btn cockpit-btn-primary cockpit-btn-sm">Mark as dispatched</button>
          </div>
        </div>

        <div className="timeline">
          {timeline.map((s, i) => (
            <div
              key={s}
              className={'timeline-step' + (i < currentIdx ? ' is-done' : '') + (i === currentIdx ? ' is-current' : '')}
            >
              <div className="dot"></div>
              <div className="label">{DF_DATA.statusMeta[s].label}</div>
            </div>
          ))}
        </div>

        <div className="order-lines">
          {lines.map((l, i) => (
            <div className="order-line" key={i}>
              <ProductThumb hue={l.hue} size={40} />
              <div className="order-line-meta">
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream-900)' }}>{l.name}</div>
                <div style={{ fontSize: 11, color: 'var(--cream-700)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{l.brand} · {l.sku}</div>
              </div>
              <div className="order-line-qty">{l.qty} × {inr(l.price)}</div>
              <div className="order-line-total">{inr(l.qty * l.price)}</div>
            </div>
          ))}
        </div>

        <div className="order-totals">
          <div>
            <div className="label">Subtotal</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 4, color: 'var(--cream-700)' }}>{inr(detail.total / 1.18)}</div>
          </div>
          <div>
            <div className="label">GST (18%)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 4, color: 'var(--cream-700)' }}>{inr(detail.total - detail.total / 1.18)}</div>
          </div>
          <div>
            <div className="label">Total</div>
            <div className="total">{inr(detail.total)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Orders = Orders;
