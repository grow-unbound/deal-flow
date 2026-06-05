// v2/Orders.jsx
// Order detail — three directions, all in Ember & Cream chrome:
//   B · OrderTransactional   — focused single-scroll page (recommended)
//   A · OrderTabbed          — forced into the v2 tabbed shell (shows why it doesn't fit)
//   C · OrderDrawer + list   — slide-in right panel, reusable app-wide
//   OrderStatesStrip         — compact "every state + its contextual actions" overview
//
// Reuses inr() + DF_DATA (cockpit), Crumb/StatusTag/MetaStrip4/DetailTabs/
// SectionCard (details + v2), FilterBar/PageHeaderV2 (v2), and the ORDER* data.

/* ── Icons ─────────────────────────────────────────────────── */
function OIcon({ name, size = 14, sw = 1.7 }) {
  const P = {
    cart:    <><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M1 2h3.2l2.3 12.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.5L21 6H6"/></>,
    edit:    <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    check:   <path d="M20 6 9 17l-5-5"/>,
    alert:   <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    truck:   <><rect x="1" y="5" width="14" height="11" rx="1.5"/><path d="M15 8h4l4 4v4h-8z"/><circle cx="6" cy="18.5" r="2"/><circle cx="18" cy="18.5" r="2"/></>,
    home:    <><path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><path d="M9 21.5V13h6v8.5"/></>,
    x:       <><path d="M18 6 6 18"/><path d="M6 6l12 12"/></>,
    download:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    message: <path d="M21 11.5a8.4 8.4 0 0 1-12.8 7.5L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/>,
    package: <><path d="m21 8-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></>,
    pin:     <><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="2.6"/></>,
    note:    <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    bank:    <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 12h.01M18 12h.01"/></>,
    repeat:  <><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    chev:    <path d="M9 18l6-6-6-6"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{P[name]}</svg>
  );
}

const PAY_TONE = { due: 'warning', paid: 'success', neutral: 'neutral', void: 'neutral' };

function actionIcon(label) {
  const l = label.toLowerCase();
  if (l.includes('invoice') || l.includes('tally')) return 'download';
  if (l.includes('message')) return 'message';
  if (l.includes('track') || l.includes('dispatch')) return 'truck';
  if (l.includes('confirm') || l.includes('deliver')) return 'check';
  if (l.includes('reorder')) return 'repeat';
  if (l.includes('edit')) return 'edit';
  if (l.includes('cancel')) return 'x';
  if (l.includes('reason')) return 'note';
  return null;
}

function ActBtn({ act, kind, sm }) {
  const role = kind || act.kind || 'secondary';
  const base = role === 'primary' ? 'cockpit-btn cockpit-btn-primary'
            : role === 'danger'   ? 'cockpit-btn cockpit-btn-ghost'
            : 'cockpit-btn cockpit-btn-secondary';
  const ic = actionIcon(act.label);
  return (
    <button className={base + (sm ? ' cockpit-btn-sm' : '')}
      style={role === 'danger' ? { color: 'var(--danger-700)' } : null}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ic && <OIcon name={ic} size={sm ? 12 : 13} />}<span>{act.label}</span>
      </span>
    </button>
  );
}

/* ── Status band: stepper + what's-next + the one primary action ── */
function OrderStepper({ state }) {
  const cfg = ORDER_STATE_CONFIG[state];
  let steps;
  if (state === 'cancelled') {
    steps = [
      { label: 'Received',  cls: 'is-done',      when: ORDER_STAGES[0].at, node: 'check' },
      { label: 'Cancelled', cls: 'is-cancelled', when: ORDER_EVENTS.cancelled.at, node: 'x' },
      { label: 'Dispatched',cls: 'is-skipped',   when: '' },
      { label: 'Delivered', cls: 'is-skipped',   when: '' },
    ];
  } else {
    steps = ORDER_STAGES.map((s, i) => ({
      label: s.label,
      cls: i < cfg.stepIdx ? 'is-done' : i === cfg.stepIdx ? 'is-current' : '',
      when: i <= cfg.stepIdx ? s.at : '',
      node: i < cfg.stepIdx ? 'check' : null,
    }));
  }
  return (
    <div className={'ord-stepper' + (state === 'cancelled' ? ' is-cancelled' : '')}>
      {steps.map((s, i) => (
        <div className={'ord-step ' + s.cls} key={i}>
          <div className="node">{s.node && <OIcon name={s.node} size={12} sw={2.4} />}</div>
          <div className="lab">{s.label}</div>
          <div className="when">{s.when}</div>
        </div>
      ))}
    </div>
  );
}

function OrderStatusBand({ state }) {
  const cfg = ORDER_STATE_CONFIG[state];
  return (
    <div className={'ord-band' + (state === 'cancelled' ? ' is-cancelled' : '')}>
      <OrderStepper state={state} />
      <div className="ord-band-foot">
        <div className="ord-band-next">
          <span className="eyebrow">What's next</span>
          {cfg.nextLine}
        </div>
        <div className="ord-band-cta">
          <ActBtn act={cfg.primary} kind={cfg.primary.kind === 'secondary' ? 'secondary' : 'primary'} />
        </div>
      </div>
    </div>
  );
}

/* ── Fulfilment alert ──────────────────────────────────────── */
function FulfilmentAlert() {
  const short = ORDER.shortLines;
  if (!short.length) return null;
  const l = short[0];
  return (
    <div className="ord-alert">
      <span className="ic"><OIcon name="alert" size={20} /></span>
      <div className="ord-alert-body">
        <div className="ord-alert-title">{short.length === 1 ? 'One line can’t be fully fulfilled' : `${short.length} lines can’t be fully fulfilled`}</div>
        <div className="ord-alert-detail">
          <b>{l.name}</b> — {l.onHand} of {l.qty} in stock, <b>{l.qty - l.onHand} short</b>. Confirm a partial, backorder the rest, or substitute.
        </div>
      </div>
      <button>Resolve stock</button>
    </div>
  );
}

/* ── Line items + totals ───────────────────────────────────── */
function OrderLineItems({ showStock }) {
  return (
    <React.Fragment>
      <div className="ord-lines">
        {ORDER.lines.map((l, i) => {
          const short = showStock && l.qty > l.onHand;
          return (
            <div className={'ord-line' + (short ? ' is-short' : '')} key={i}>
              <div className={'ord-line-thumb ' + l.hue}><i></i></div>
              <div className="ord-line-meta">
                <div className="ord-line-name">{l.name}</div>
                <div className="ord-line-sku">{l.brand} · {l.sku}</div>
                {short && <div className="ord-line-stock">{l.onHand} of {l.qty} in stock · {l.qty - l.onHand} short</div>}
              </div>
              <div className="ord-line-qty">{l.qty} × {inr(l.price)}</div>
              <div className="ord-line-total">{inr(l.qty * l.price)}</div>
            </div>
          );
        })}
      </div>
      <div className="ord-tot">
        <div className="ord-tot-row"><span className="l">Taxable value</span><span className="v">{inr(ORDER.subtotal)}</span></div>
        <div className="ord-tot-row"><span className="l">IGST @ 18%</span><span className="v">{inr(ORDER.gst)}</span></div>
        <div className="ord-tot-row grand"><span className="l">Order total</span><span className="v">{inr(ORDER.total)}</span></div>
      </div>
    </React.Fragment>
  );
}

/* ── Invoice block ─────────────────────────────────────────── */
function OrderInvoice({ hasInvoice }) {
  if (!hasInvoice) {
    return (
      <div className="ord-inv-empty">
        <span className="ic"><OIcon name="package" size={22} /></span>
        <span>No invoice yet. <b>Confirm the order</b> to reserve stock and raise <span className="mono">INV-2026-…</span> automatically.</span>
      </div>
    );
  }
  return (
    <React.Fragment>
      <div className="ord-inv-head">
        <div>
          <div className="ord-inv-no">{ORDER.invoiceNo}</div>
          <div className="ord-inv-date">Raised {ORDER.invoiceDate} · {ORDER.terms} · IGST (inter-state)</div>
        </div>
        <StatusTag label="Tax invoice" tone="accent" />
      </div>
      <div className="ord-inv-parties">
        <div className="ord-inv-party">
          <div className="lab">Billed to</div>
          <div className="nm">{ORDER.buyer.name}</div>
          <div className="ad">{ORDER.buyer.city}</div>
          <div className="gst">GSTIN {ORDER.buyer.gstin}</div>
        </div>
        <div className="ord-inv-party">
          <div className="lab">Ship to</div>
          <div className="nm">{ORDER.buyer.name}</div>
          <div className="ad">{ORDER.delivery.address}</div>
          <div className="gst">{ORDER.delivery.mode}</div>
        </div>
      </div>
      <div className="ord-tot">
        <div className="ord-tot-row"><span className="l">Taxable value</span><span className="v">{inr(ORDER.subtotal)}</span></div>
        <div className="ord-tot-row"><span className="l">IGST @ 18%</span><span className="v">{inr(ORDER.gst)}</span></div>
        <div className="ord-tot-row grand"><span className="l">Invoice total</span><span className="v">{inr(ORDER.total)}</span></div>
      </div>
    </React.Fragment>
  );
}

/* ── Payment + credit ──────────────────────────────────────── */
function OrderPayment({ state }) {
  const cfg = ORDER_STATE_CONFIG[state];
  const pay = cfg.payment;
  const outstanding = (cfg.hasInvoice && pay.tone === 'due') ? ORDER.total : 0;
  const used = ORDER.credit.usedBefore + outstanding;
  const pct = Math.round((used / ORDER.credit.limit) * 100);
  return (
    <React.Fragment>
      <div className="ord-pay-status">
        <StatusTag label={pay.label} tone={PAY_TONE[pay.tone]} />
      </div>
      <div style={{ padding: '0 18px 14px' }}>
        {pay.amount
          ? <div className="ord-pay-amt">{inr(ORDER.total)}</div>
          : <div className="ord-pay-amt" style={{ color: 'var(--cream-500)', fontSize: 20 }}>—</div>}
        <div className="ord-pay-detail">{pay.detail}</div>
      </div>
      <div className="ord-pay-gauge">
        <div className="head"><span>Credit used</span><span><b>{pct}%</b> of {inrShort(ORDER.credit.limit)}</span></div>
        <div className={'gauge' + (pct >= 90 ? ' is-danger' : pct >= 80 ? ' is-warn' : '')}>
          <div className="fill" style={{ width: pct + '%' }}></div>
        </div>
        <div className="gauge-foot"><span>{inr(used)} used</span><span>{inr(ORDER.credit.limit - used)} available</span></div>
      </div>
    </React.Fragment>
  );
}

/* ── Delivery facts ────────────────────────────────────────── */
function OrderDelivery() {
  const d = ORDER.delivery;
  return (
    <div style={{ padding: '14px 18px 16px' }}>
      <div className="ord-fact"><span className="l">Address</span><span className="v" style={{ maxWidth: 200 }}>{d.address}</span></div>
      <div className="ord-fact"><span className="l">Window</span><span className="v">{d.window}</span></div>
      <div className="ord-fact"><span className="l">Mode</span><span className="v">{d.mode}</span></div>
      <div className="ord-fact"><span className="l">Contact</span><span className="v">{d.contact}</span></div>
    </div>
  );
}

/* ── Event log ─────────────────────────────────────────────── */
function OrderEventLog({ state, limit }) {
  const cfg = ORDER_STATE_CONFIG[state];
  let keys = cfg.events;
  if (limit) keys = keys.slice(0, limit);
  return (
    <div className="ord-events">
      {keys.map((k) => {
        const e = ORDER_EVENTS[k];
        return (
          <div className={'ord-event' + (e.tone ? ' tone-' + e.tone : '')} key={k}>
            <div className="ord-event-node"><OIcon name={e.icon} size={12} /></div>
            <div className="ord-event-body">
              <div className="ord-event-title">{e.title}</div>
              <div className="ord-event-detail">{e.detail}</div>
              <div className="ord-event-meta">{e.who} · {e.at}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Order header (transactional) ──────────────────────────── */
function OrderHead({ state }) {
  const cfg = ORDER_STATE_CONFIG[state];
  const label = state.charAt(0).toUpperCase() + state.slice(1);
  return (
    <div className="ord-head">
      <div>
        <div className="ord-head-id">{ORDER.id}</div>
        <div className="ord-head-row">
          <h1 className="ord-head-title">{ORDER.buyer.name}</h1>
          <StatusTag label={label} tone={ORDER_STATUS_TONE[state]} />
        </div>
        <div className="ord-head-sub">
          <span>Placed {ORDER.placedAt}</span>
          <span className="dot"></span>
          <span>via <b>{ORDER.catalog}</b></span>
          <span className="dot"></span>
          <span>{ORDER.buyer.channel || ORDER.channel}</span>
          <span className="dot"></span>
          <span>{ORDER.lines.length} lines · {ORDER.units} units</span>
        </div>
      </div>
      <div className="ord-actions">
        {cfg.secondary.map((a, i) => <ActBtn key={i} act={a} kind="secondary" sm />)}
        {cfg.danger && <ActBtn act={cfg.danger} kind="danger" sm />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DIRECTION B — Transactional single-scroll page (recommended)
   ════════════════════════════════════════════════════════════ */
function OrderTransactional({ state = 'confirmed', label }) {
  const cfg = ORDER_STATE_CONFIG[state];
  return (
    <div className="v2-page">
      {label && <div className="v2-page-label">{label}</div>}
      <div className="v2-page-inner" style={{ paddingTop: 28 }}>
        <Crumb path={[{ label: 'Orders' }, { label: ORDER.id, current: true }]} />
        <OrderHead state={state} />
        <OrderStatusBand state={state} />
        {cfg.showFulfilment && <FulfilmentAlert />}
        <div className="ord-grid">
          <div className="ord-col">
            <SectionCard title="Items" sub={`${ORDER.lines.length} lines · ${ORDER.units} units`} flush>
              <OrderLineItems showStock={cfg.showFulfilment} />
            </SectionCard>
            <SectionCard
              title="Invoice"
              sub={cfg.hasInvoice ? ORDER.invoiceNo : 'Generated on confirm'}
              right={cfg.hasInvoice ? <button className="cockpit-btn cockpit-btn-secondary cockpit-btn-sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><OIcon name="download" size={12} />Download</span></button> : null}
              flush
            >
              <OrderInvoice hasInvoice={cfg.hasInvoice} />
            </SectionCard>
          </div>
          <div className="ord-col">
            <SectionCard title="Payment" flush><OrderPayment state={state} /></SectionCard>
            <SectionCard title="Delivery" flush><OrderDelivery /></SectionCard>
            <SectionCard title="Activity" sub="Every change to this order" flush>
              <OrderEventLog state={state} />
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DIRECTION A — Forced into the v2 tabbed shell
   ════════════════════════════════════════════════════════════ */
function OrderTabbed({ active = 'summary', label }) {
  const state = 'confirmed';
  const cfg = ORDER_STATE_CONFIG[state];
  const meta = [
    { label: 'Order total', value: inr(ORDER.total), sub: 'incl. IGST' },
    { label: 'Items', value: ORDER.lines.length, sub: `${ORDER.units} units` },
    { label: 'Status', value: 'Confirmed', sub: 'placed Jun 28' },
    { label: 'Payment', value: `Due ${ORDER.dueDate}`, sub: ORDER.terms },
  ];
  const tabs = [{ id: 'summary', label: 'Summary' }, { id: 'timeline', label: 'Timeline' }];
  return (
    <div className="v2-page">
      {label && <div className="v2-page-label">{label}</div>}
      <div className="v2-page-inner" style={{ paddingTop: 28 }}>
        <Crumb path={[{ label: 'Orders' }, { label: ORDER.id, current: true }]} />
        <OrderHead state={state} />
        <MetaStrip4 tiles={meta} />
        <DetailTabs tabs={tabs} active={active} onChange={() => {}} />
        <div className="v2-detail-body">
          <div className="ord-thin-note">
            <b>Why this strains:</b> an order is one transaction, not a hub of relationships. Splitting it across tabs hides the timeline behind a click and leaves each tab thin. The transactional layout (B) keeps the whole story on one scroll.
          </div>
          {active === 'summary' ? (
            <div className="ord-grid">
              <div className="ord-col">
                <SectionCard title="Items" sub={`${ORDER.lines.length} lines · ${ORDER.units} units`} flush>
                  <OrderLineItems showStock={cfg.showFulfilment} />
                </SectionCard>
                <SectionCard title="Invoice" sub={ORDER.invoiceNo} flush>
                  <OrderInvoice hasInvoice />
                </SectionCard>
              </div>
              <div className="ord-col">
                <SectionCard title="Payment" flush><OrderPayment state={state} /></SectionCard>
                <SectionCard title="Delivery" flush><OrderDelivery /></SectionCard>
              </div>
            </div>
          ) : (
            <SectionCard title="Timeline" sub="Every change to this order" flush>
              <OrderEventLog state={state} />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DIRECTION C — Slide-in drawer, shown over the orders list
   ════════════════════════════════════════════════════════════ */
function OrderDrawer({ state = 'confirmed' }) {
  const cfg = ORDER_STATE_CONFIG[state];
  const label = state.charAt(0).toUpperCase() + state.slice(1);
  return (
    <div className="ord-drawer">
      <div className="ord-drawer-head">
        <div className="ord-drawer-head-top">
          <div>
            <div className="ord-head-id">{ORDER.id}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--cream-900)', marginTop: 2 }}>{ORDER.buyer.name}</div>
          </div>
          <button className="ord-drawer-close"><OIcon name="x" size={15} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <StatusTag label={label} tone={ORDER_STATUS_TONE[state]} />
          <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>Placed {ORDER.placedAt}</span>
          <a style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--teal-500)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>Open full order <OIcon name="chev" size={12} /></a>
        </div>
      </div>
      <div className="ord-drawer-body">
        <OrderStepper state={state} />
        <div>
          <div className="ord-mini-head">Order</div>
          <div className="ord-fact"><span className="l">Catalog</span><span className="v">{ORDER.catalog}</span></div>
          <div className="ord-fact"><span className="l">Delivery</span><span className="v">{ORDER.delivery.window}</span></div>
          <div className="ord-fact"><span className="l">Payment</span><span className="v">{cfg.payment.label} · {ORDER.terms}</span></div>
        </div>
        <div>
          <div className="ord-mini-head">{ORDER.lines.length} items · {ORDER.units} units</div>
          {ORDER.lines.map((l, i) => (
            <div className="ord-dline" key={i}>
              <div className={'ord-line-thumb ' + l.hue} style={{ width: 28, height: 34 }}><i style={{ width: 9, height: 21 }}></i></div>
              <div className="ord-dline-meta">
                <div className="ord-dline-name">{l.name}</div>
                <div className="ord-dline-sub">{l.qty} × {inr(l.price)}</div>
              </div>
              <div className="ord-dline-amt">{inr(l.qty * l.price)}</div>
            </div>
          ))}
          <div className="ord-fact" style={{ borderBottom: 'none', paddingTop: 10 }}>
            <span className="l" style={{ fontWeight: 600, color: 'var(--cream-900)' }}>Total</span>
            <span className="v mono" style={{ fontSize: 15 }}>{inr(ORDER.total)}</span>
          </div>
        </div>
        <div>
          <div className="ord-mini-head">Recent activity</div>
          <OrderEventLog state={state} limit={3} />
        </div>
        <div className="ord-reuse-note">
          <b>Reusable shell.</b> The same drawer hosts any entity quick-look — a buyer, a product, a catalog — opened from its list without leaving the page. Deep work still gets a full page.
        </div>
      </div>
      <div className="ord-drawer-foot">
        {cfg.secondary[0] && <ActBtn act={cfg.secondary[0]} kind="secondary" />}
        <ActBtn act={cfg.primary} kind={cfg.primary.kind === 'secondary' ? 'secondary' : 'primary'} />
      </div>
    </div>
  );
}

function OrdersListWithDrawer({ label, state = 'confirmed' }) {
  const rows = ORDERS_LIST;
  return (
    <div className="ord-stage">
      <div className="v2-page">
        {label && <div className="v2-page-label">{label}</div>}
        <div className="v2-page-inner" style={{ paddingTop: 28 }}>
          <Crumb path={[{ label: 'Orders' }, { label: 'Order log', current: true }]} />
          <PageHeaderV2
            eyebrow="Orders"
            title="Order log"
            subtitle="Every order across all buyers and cohorts. Click a row to open it in the side panel without losing your place in the list."
          />
          <FilterBar
            count={rows.length}
            countLabel="orders"
            searchPlaceholder="Search orders, buyers…"
            chips={['All', 'Received', 'Confirmed', 'Dispatched', 'Delivered']}
            activeChip="All"
            sortBy="Placed (newest)"
            hideViewToggle
          />
          <div className="v2-body">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Order</th><th>Buyer</th><th>Catalog</th><th>Status</th><th>Placed</th><th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} style={o.id === ORDER.id ? { background: 'var(--teal-50)' } : null}>
                    <td>
                      <div className="ent-sub" style={{ marginTop: 0, fontSize: 12 }}>{o.id}</div>
                      <div style={{ fontSize: 11, color: 'var(--cream-700)', marginTop: 2 }}>{o.items} items</div>
                    </td>
                    <td><span className="ent-name">{o.buyer}</span></td>
                    <td style={{ color: 'var(--cream-700)' }}>{o.catalog}</td>
                    <td><StatusTag label={o.status.charAt(0).toUpperCase() + o.status.slice(1)} tone={ORDER_STATUS_TONE[o.status]} /></td>
                    <td style={{ color: 'var(--cream-700)', fontSize: 12 }}>{o.placed}</td>
                    <td className="num">{inr(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="ord-scrim"></div>
      <OrderDrawer state={state} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ALL STATES — compact contextual-actions overview
   ════════════════════════════════════════════════════════════ */
function MiniStepper({ state }) {
  const cfg = ORDER_STATE_CONFIG[state];
  let segs;
  if (state === 'cancelled') segs = ['done', 'cancel', '', ''];
  else segs = [0, 1, 2, 3].map(i => i < cfg.stepIdx ? 'done' : i === cfg.stepIdx ? 'current' : '');
  return <div className="ord-mini">{segs.map((s, i) => <span key={i} className={'seg ' + s}></span>)}</div>;
}

function OrderStatesStrip() {
  const order = ['received', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
  return (
    <div className="ord-states">
      {order.map((state) => {
        const cfg = ORDER_STATE_CONFIG[state];
        const label = state.charAt(0).toUpperCase() + state.slice(1);
        return (
          <div className="ord-state-card" key={state}>
            <div className="ord-state-id">
              <StatusTag label={label} tone={ORDER_STATUS_TONE[state]} />
              <MiniStepper state={state} />
              <span style={{ fontSize: 11.5, color: 'var(--cream-700)' }}>{cfg.payment.label}</span>
            </div>
            <div className="ord-state-next">{cfg.nextLine}</div>
            <div className="ord-state-acts">
              {cfg.danger && <ActBtn act={cfg.danger} kind="danger" sm />}
              {cfg.secondary[0] && <ActBtn act={cfg.secondary[0]} kind="secondary" sm />}
              <ActBtn act={cfg.primary} kind={cfg.primary.kind === 'secondary' ? 'secondary' : 'primary'} sm />
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  OIcon, OrderStepper, OrderStatusBand, FulfilmentAlert, OrderLineItems,
  OrderInvoice, OrderPayment, OrderDelivery, OrderEventLog, OrderHead,
  OrderTransactional, OrderTabbed, OrderDrawer, OrdersListWithDrawer,
  MiniStepper, OrderStatesStrip,
});
